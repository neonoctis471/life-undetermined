import "server-only";

import { getAiEnvironment } from "@/config/server-env";

import { AiProviderError, type AiProvider } from "./provider";

const MAX_RESPONSE_CHARS = 256_000;

type AiEnvironment = ReturnType<typeof getAiEnvironment>;

export function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${/\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`}/chat/completions`;
}

export interface OpenAiCompatibleOptions {
  fetchImpl?: typeof fetch;
  /** The relay has been seen serving a different model than requested; observe, never block. */
  onModelMismatch?(requested: string, served: string): void;
}

/** OpenAI-compatible chat/completions over native fetch; no SDK. */
export function createOpenAiCompatibleProvider(
  env: AiEnvironment = getAiEnvironment(),
  options: OpenAiCompatibleOptions = {},
): AiProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = resolveChatCompletionsUrl(env.OPENAI_BASE_URL);

  return {
    async completeJson(request) {
      const model = request.tier === "DEEP" ? env.OPENAI_MODEL_DEEP : env.OPENAI_MODEL_FAST;
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            response_format: { type: "json_object" },
            temperature: request.temperature ?? 0.8,
            max_tokens: request.maxTokens,
          }),
          signal: AbortSignal.timeout(request.timeoutMs),
          redirect: "error",
          cache: "no-store",
        });
      } catch (error) {
        throw toProviderError(error, "AI request failed");
      }

      if (!response.ok) {
        throw new AiProviderError("UPSTREAM", `AI upstream returned HTTP ${response.status}`);
      }

      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        throw toProviderError(error, "AI response could not be read");
      }
      if (text.length > MAX_RESPONSE_CHARS) {
        throw new AiProviderError("INVALID_RESPONSE", "AI response is too large");
      }

      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new AiProviderError("INVALID_RESPONSE", "AI response is not JSON");
      }
      const parsed = body as { model?: unknown; choices?: { message?: { content?: unknown } }[] } | null;
      const served = typeof parsed?.model === "string" ? parsed.model.replace(/[^\w.:/-]/g, "").slice(0, 80) : "";
      if (served && served !== model && !served.startsWith(`${model}-`)) {
        options.onModelMismatch?.(model, served);
      }
      const content = parsed?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new AiProviderError("INVALID_RESPONSE", "AI response has no content");
      }
      return content;
    },
  };
}

function toProviderError(error: unknown, message: string): AiProviderError {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new AiProviderError("TIMEOUT", "AI request timed out");
  }
  return new AiProviderError("UPSTREAM", message);
}

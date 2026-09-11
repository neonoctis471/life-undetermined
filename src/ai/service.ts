import type { AiOperation, AiRequest, AiResponseData } from "./contracts";
import { buildFallbackIntentDraft, buildFallbackSituationDraft } from "./fallbacks";
import { AiNormalizeError, normalizeIntentDraft, normalizeSituationDraft } from "./normalize";
import { buildGenerateSituationPrompt, buildUnderstandIntentPrompt } from "./prompts";
import { AiProviderError, type AiCompletionRequest, type AiProvider } from "./provider";

export const CALL_TIMEOUT_MS = 25_000;
const TOTAL_BUDGET_MS = 45_000;
const MIN_ATTEMPT_MS = 5_000;
const MAX_ATTEMPTS = 2;

export type AiAttemptOutcome = "ok" | "invalid_output" | "timeout" | "upstream_error" | "internal_error";

/** Log events carry no prompt, player text, model output or credentials. */
export interface AiLogEvent {
  operation: AiOperation;
  attempt: number;
  outcome: AiAttemptOutcome;
  durationMs: number;
}

export interface AiServiceDependencies {
  provider: AiProvider;
  createId(): string;
  clock?(): number;
  log?(event: AiLogEvent): void;
}

export async function runAiOperation(request: AiRequest, deps: AiServiceDependencies): Promise<AiResponseData> {
  switch (request.operation) {
    case "UNDERSTAND_INTENT": {
      const context = { rawText: request.input.rawText, selectedPlans: request.input.selectedPlans };
      const generated = await generateWithRetry(
        request.operation,
        { tier: "FAST", ...buildUnderstandIntentPrompt(context), maxTokens: 800 },
        (raw) => normalizeIntentDraft(raw, context),
        deps,
      );
      return generated
        ? { operation: request.operation, generation: "AI", result: generated }
        : {
            operation: request.operation,
            generation: "FALLBACK",
            result: normalizeIntentDraft(buildFallbackIntentDraft(context), context),
          };
    }
    case "GENERATE_SITUATION": {
      const { chapter, intent, facts, previousChoices } = request.input;
      const context = { chapter, facts };
      const generated = await generateWithRetry(
        request.operation,
        { tier: "FAST", ...buildGenerateSituationPrompt({ chapter, intent, facts, previousChoices }), maxTokens: 1_600 },
        (raw) => normalizeSituationDraft(raw, context, deps),
        deps,
      );
      return generated
        ? { operation: request.operation, generation: "AI", result: generated }
        : {
            operation: request.operation,
            generation: "FALLBACK",
            result: normalizeSituationDraft(buildFallbackSituationDraft(chapter), context, deps),
          };
    }
  }
}

/** One attempt plus at most one retry inside a shared time budget; null means "use the fallback". */
async function generateWithRetry<T>(
  operation: AiOperation,
  completion: Omit<AiCompletionRequest, "timeoutMs">,
  normalize: (raw: unknown) => T,
  deps: AiServiceDependencies,
): Promise<T | null> {
  const clock = deps.clock ?? Date.now;
  const deadline = clock() + TOTAL_BUDGET_MS;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const remaining = deadline - clock();
    if (remaining < MIN_ATTEMPT_MS) break;
    const started = clock();
    try {
      const content = await deps.provider.completeJson({ ...completion, timeoutMs: Math.min(CALL_TIMEOUT_MS, remaining) });
      const result = normalize(extractJsonObject(content));
      deps.log?.({ operation, attempt, outcome: "ok", durationMs: clock() - started });
      return result;
    } catch (error) {
      deps.log?.({ operation, attempt, outcome: classifyError(error), durationMs: clock() - started });
    }
  }
  return null;
}

/**
 * Always strips ``` fences before parsing, whether or not the relay honoured
 * response_format (it may silently route to a model that wraps JSON in fences).
 * Accepts bare JSON, fenced JSON anywhere in the text, or JSON wrapped in prose.
 */
export function extractJsonObject(content: string): unknown {
  const candidates: string[] = [];
  const fenced = /```[a-zA-Z]*\s*([\s\S]*?)```/.exec(content);
  if (fenced?.[1]) candidates.push(fenced[1]);
  candidates.push(content.replace(/```[a-zA-Z]*/g, ""));
  for (const candidate of candidates) {
    const text = candidate.trim();
    try {
      return JSON.parse(text);
    } catch {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(text.slice(start, end + 1));
        } catch {
          // try the next candidate
        }
      }
    }
  }
  throw new AiNormalizeError("model output is not valid JSON");
}

function classifyError(error: unknown): AiAttemptOutcome {
  if (error instanceof AiProviderError) {
    if (error.kind === "TIMEOUT") return "timeout";
    return error.kind === "INVALID_RESPONSE" ? "invalid_output" : "upstream_error";
  }
  if (error instanceof AiNormalizeError) return "invalid_output";
  return "internal_error";
}

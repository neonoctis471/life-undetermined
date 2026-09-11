import {
  AiResponseDataSchema,
  type GenerateSituationRequest,
  type GenerateSituationResponseData,
  type UnderstandIntentRequest,
  type UnderstandIntentResponseData,
} from "@/ai/contracts";
import { ApiErrorSchema, successResponseSchema } from "@/contracts/api";

const ResponseSchema = successResponseSchema(AiResponseDataSchema);

export class AiCallError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiCallError";
  }
}

export interface Timed<T> {
  data: T;
  elapsedMs: number;
}

export function requestUnderstandIntent(
  input: UnderstandIntentRequest["input"],
  signal?: AbortSignal,
): Promise<Timed<UnderstandIntentResponseData>> {
  return callAi({ operation: "UNDERSTAND_INTENT", input }, signal) as Promise<Timed<UnderstandIntentResponseData>>;
}

export function requestSituation(
  input: GenerateSituationRequest["input"],
  signal?: AbortSignal,
): Promise<Timed<GenerateSituationResponseData>> {
  return callAi({ operation: "GENERATE_SITUATION", input }, signal) as Promise<Timed<GenerateSituationResponseData>>;
}

async function callAi(
  request: UnderstandIntentRequest | GenerateSituationRequest,
  signal?: AbortSignal,
): Promise<Timed<UnderstandIntentResponseData | GenerateSituationResponseData>> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch("/api/v1/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch {
    throw new AiCallError("网络连接失败，请重试。", true);
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = ApiErrorSchema.safeParse(json);
    throw new AiCallError(
      parsedError.success ? `请求失败：${parsedError.data.error.message}` : `请求失败（HTTP ${response.status}）。`,
      parsedError.success ? parsedError.data.error.retryable : true,
    );
  }
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success || parsed.data.data.operation !== request.operation) {
    throw new AiCallError("服务返回了无法识别的内容，请重试。", true);
  }
  return { data: parsed.data.data, elapsedMs: Math.round(performance.now() - started) };
}

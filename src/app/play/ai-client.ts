import {
  AiResponseDataSchema,
  type AiResponseData,
  type GenerateSituationRequest,
  type GenerateSituationResponseData,
  type ResolveOutcomeRequest,
  type ResolveOutcomeResponseData,
  type SimulateLifeRequest,
  type SimulateLifeResponseData,
  type UnderstandIntentRequest,
  type UnderstandIntentResponseData,
} from "@/ai/contracts";
import { ApiErrorSchema, successResponseSchema } from "@/contracts/api";

import { getGameStore } from "./client-store";

const ResponseSchema = successResponseSchema(AiResponseDataSchema);

type AnyRequest = UnderstandIntentRequest | GenerateSituationRequest | ResolveOutcomeRequest | SimulateLifeRequest;

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

export function requestUnderstandIntent(input: UnderstandIntentRequest["input"]) {
  return callAi({ operation: "UNDERSTAND_INTENT", input }) as Promise<Timed<UnderstandIntentResponseData>>;
}

export function requestSituation(input: GenerateSituationRequest["input"]) {
  return callAi({ operation: "GENERATE_SITUATION", input }) as Promise<Timed<GenerateSituationResponseData>>;
}

export function requestOutcome(input: ResolveOutcomeRequest["input"]) {
  return callAi({ operation: "RESOLVE_OUTCOME", input }) as Promise<Timed<ResolveOutcomeResponseData>>;
}

export function requestLife(input: SimulateLifeRequest["input"]) {
  return callAi({ operation: "SIMULATE_LIFE", input }) as Promise<Timed<SimulateLifeResponseData>>;
}

async function callAi(request: AnyRequest): Promise<Timed<AiResponseData>> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch("/api/v1/ai", {
      method: "POST",
      // The random game id only lets server logs add up upstream calls per game.
      headers: { "Content-Type": "application/json", "X-Game-Id": getGameStore().getState().gameId },
      body: JSON.stringify(request),
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

export const errorMessage = (error: unknown) => (error instanceof AiCallError ? error.message : "出了点问题，请重试。");

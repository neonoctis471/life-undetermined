import type { z } from "zod";

import {
  ApiErrorSchema,
  successResponseSchema,
  type ApiErrorCode,
  type NextStepSchema,
} from "@/contracts/api";

import {
  AiRequestSchema,
  AiResponseDataSchema,
  type AiOperation,
  type AiResponseData,
  type GenerationSource,
} from "./contracts";
import type { AiProvider } from "./provider";
import { runAiOperation, type AiLogEvent } from "./service";

const MAX_BODY_BYTES = 128_000;
const NO_STORE = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nextStepFor(data: AiResponseData): z.infer<typeof NextStepSchema> {
  switch (data.operation) {
    case "UNDERSTAND_INTENT":
      return "CONFIRM_INTENT";
    case "GENERATE_SITUATION":
      return "SELECT_SITUATION";
    case "RESOLVE_OUTCOME":
      return "REVIEW_OUTCOME";
    case "SIMULATE_LIFE":
      return data.result.mode === "FIVE_YEARS" ? "SELECT_KEY_DECISION" : "REVIEW_COMPARISON";
  }
}

const AiSuccessResponseSchema = successResponseSchema(AiResponseDataSchema);

/** One entry per /api/v1/ai request, used to estimate upstream quota per game. */
export interface AiUsageEntry {
  operation: AiOperation;
  /** Random per-game id sent by the browser (X-Game-Id); null when absent or malformed. */
  gameId: string | null;
  /** Calls actually sent upstream, including retried and aborted ones. */
  upstreamCalls: number;
  generation: GenerationSource | "ERROR";
  durationMs: number;
}

export interface AiHandlerDependencies {
  /** Throws when server configuration is missing; the message is never exposed. */
  getProvider(): AiProvider;
  createId(): string;
  log?(event: AiLogEvent): void;
  logUsage?(entry: AiUsageEntry): void;
}

export async function handleAiRequest(request: Request, deps: AiHandlerDependencies): Promise<Response> {
  const requestId = deps.createId();
  const fail = (status: number, code: ApiErrorCode, message: string, retryable: boolean) =>
    Response.json(ApiErrorSchema.parse({ error: { code, message, requestId, retryable } }), {
      status,
      headers: NO_STORE,
    });

  let text: string;
  try {
    text = await request.text();
  } catch {
    return fail(400, "INVALID_REQUEST", "request body could not be read", false);
  }
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return fail(413, "INVALID_REQUEST", "request body is too large", false);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400, "INVALID_REQUEST", "request body must be JSON", false);
  }

  const parsed = AiRequestSchema.safeParse(json);
  if (!parsed.success) {
    return fail(400, "INVALID_REQUEST", "request failed validation", false);
  }

  let provider: AiProvider;
  try {
    provider = deps.getProvider();
  } catch {
    return fail(503, "INTERNAL_ERROR", "AI service is not configured", false);
  }

  const rawGameId = request.headers.get("x-game-id");
  const gameId = rawGameId && UUID_PATTERN.test(rawGameId) ? rawGameId.toLowerCase() : null;
  const started = Date.now();
  let upstreamCalls = 0;
  const countingLog = (event: AiLogEvent) => {
    upstreamCalls += 1;
    deps.log?.(event);
  };
  const usage = (generation: AiUsageEntry["generation"]) =>
    deps.logUsage?.({ operation: parsed.data.operation, gameId, upstreamCalls, generation, durationMs: Date.now() - started });

  try {
    const data = await runAiOperation(parsed.data, { provider, createId: deps.createId, log: countingLog });
    const body = AiSuccessResponseSchema.parse({
      data,
      meta: { requestId, eventVersion: 0, nextStep: nextStepFor(data) },
    });
    usage(data.generation);
    return Response.json(body, { headers: NO_STORE });
  } catch {
    usage("ERROR");
    return fail(500, "INTERNAL_ERROR", "AI operation failed", true);
  }
}

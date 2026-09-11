import type { z } from "zod";

import {
  ApiErrorSchema,
  successResponseSchema,
  type ApiErrorCode,
  type NextStepSchema,
} from "@/contracts/api";

import { AiRequestSchema, AiResponseDataSchema, type AiOperation } from "./contracts";
import type { AiProvider } from "./provider";
import { runAiOperation, type AiLogEvent } from "./service";

const MAX_BODY_BYTES = 64_000;
const NO_STORE = { "Cache-Control": "no-store" };

const NEXT_STEPS: Record<AiOperation, z.infer<typeof NextStepSchema>> = {
  UNDERSTAND_INTENT: "CONFIRM_INTENT",
  GENERATE_SITUATION: "SELECT_SITUATION",
  RESOLVE_OUTCOME: "REVIEW_OUTCOME",
};

const AiSuccessResponseSchema = successResponseSchema(AiResponseDataSchema);

export interface AiHandlerDependencies {
  /** Throws when server configuration is missing; the message is never exposed. */
  getProvider(): AiProvider;
  createId(): string;
  log?(event: AiLogEvent): void;
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

  try {
    const data = await runAiOperation(parsed.data, { provider, createId: deps.createId, log: deps.log });
    const body = AiSuccessResponseSchema.parse({
      data,
      meta: { requestId, eventVersion: 0, nextStep: NEXT_STEPS[data.operation] },
    });
    return Response.json(body, { headers: NO_STORE });
  } catch {
    return fail(500, "INTERNAL_ERROR", "AI operation failed", true);
  }
}

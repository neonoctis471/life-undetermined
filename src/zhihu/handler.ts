import { ApiErrorSchema, successResponseSchema, type ApiErrorCode } from "@/contracts/api";

import { buildExperienceCards, type ExperienceDependencies, type ExperienceStats } from "./cards";
import { ExperienceRequestSchema, ExperienceResponseDataSchema, type ExperienceResponseData } from "./contracts";

const MAX_BODY_BYTES = 32_000;
const NO_STORE = { "Cache-Control": "no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SuccessSchema = successResponseSchema(ExperienceResponseDataSchema);

export interface ExperienceUsageEntry extends ExperienceStats {
  gameId: string | null;
  source: ExperienceResponseData["source"] | "ERROR";
  durationMs: number;
}

export interface ExperienceHandlerDependencies {
  /** Throws when server configuration is missing; the message is never exposed. */
  getDependencies(): ExperienceDependencies;
  createId(): string;
  logUsage?(entry: ExperienceUsageEntry): void;
}

/** Experience cards are optional: every failure maps to a non-blocking response. */
export async function handleExperienceRequest(request: Request, deps: ExperienceHandlerDependencies): Promise<Response> {
  const requestId = deps.createId();
  const fail = (status: number, code: ApiErrorCode, message: string, retryable: boolean) =>
    Response.json(ApiErrorSchema.parse({ error: { code, message, requestId, retryable } }), { status, headers: NO_STORE });

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
  const parsed = ExperienceRequestSchema.safeParse(json);
  if (!parsed.success) return fail(400, "INVALID_REQUEST", "request failed validation", false);

  let services: ExperienceDependencies;
  try {
    services = deps.getDependencies();
  } catch {
    return fail(503, "ZHIHU_UNAVAILABLE", "experience cards are not configured", false);
  }

  const rawGameId = request.headers.get("x-game-id");
  const gameId = rawGameId && UUID_PATTERN.test(rawGameId) ? rawGameId.toLowerCase() : null;
  const started = Date.now();
  try {
    const { data, stats } = await buildExperienceCards(parsed.data, services);
    deps.logUsage?.({ ...stats, gameId, source: data.source, durationMs: Date.now() - started });
    return Response.json(
      SuccessSchema.parse({ data, meta: { requestId, eventVersion: 0, nextStep: "MAKE_DECISION" } }),
      { headers: NO_STORE },
    );
  } catch {
    deps.logUsage?.({ zhihuCalls: 0, zhihuFailures: 0, aiCalls: 0, candidates: 0, kept: 0, relevant: 0, gameId, source: "ERROR", durationMs: Date.now() - started });
    return fail(502, "ZHIHU_UNAVAILABLE", "experience cards are unavailable", true);
  }
}

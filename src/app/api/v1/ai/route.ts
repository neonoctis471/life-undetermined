import { randomUUID } from "node:crypto";

import { handleAiRequest } from "@/ai/handler";
import { createOpenAiCompatibleProvider } from "@/ai/openai-compatible";
import type { AiProvider } from "@/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

let provider: AiProvider | undefined;

export function POST(request: Request): Promise<Response> {
  return handleAiRequest(request, {
    getProvider: () =>
      (provider ??= createOpenAiCompatibleProvider(undefined, {
        onModelMismatch: (requested, served) =>
          console.warn(`[ai] model mismatch requested=${requested} served=${served}`),
      })),
    createId: randomUUID,
    log: (event) =>
      console.info(`[ai] ${event.operation} attempt=${event.attempt} outcome=${event.outcome} ${event.durationMs}ms`),
  });
}

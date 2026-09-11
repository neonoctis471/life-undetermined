import { randomUUID } from "node:crypto";

import { handleAiRequest } from "@/ai/handler";
import { createOpenAiCompatibleProvider } from "@/ai/openai-compatible";
import type { AiProvider } from "@/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 60;

let provider: AiProvider | undefined;

// Best-effort running total per game on this instance; the exact per-game sum
// comes from adding up `upstream_calls` for one game id across all log lines.
const MAX_TRACKED_GAMES = 1_000;
const upstreamCallsByGame = new Map<string, number>();

function addGameCalls(gameId: string, calls: number): number {
  const total = (upstreamCallsByGame.get(gameId) ?? 0) + calls;
  upstreamCallsByGame.delete(gameId);
  upstreamCallsByGame.set(gameId, total);
  if (upstreamCallsByGame.size > MAX_TRACKED_GAMES) {
    const oldest = upstreamCallsByGame.keys().next().value;
    if (oldest !== undefined) upstreamCallsByGame.delete(oldest);
  }
  return total;
}

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
    logUsage: (entry) => {
      const total = entry.gameId ? addGameCalls(entry.gameId, entry.upstreamCalls) : null;
      console.info(
        `[ai-usage] game=${entry.gameId ?? "-"} op=${entry.operation} upstream_calls=${entry.upstreamCalls} game_total_on_instance=${total ?? "-"} generation=${entry.generation} ${entry.durationMs}ms`,
      );
    },
  });
}

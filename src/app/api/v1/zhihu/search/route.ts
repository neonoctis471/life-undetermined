import { randomUUID } from "node:crypto";

import { createOpenAiCompatibleProvider } from "@/ai/openai-compatible";
import type { ExperienceDependencies } from "@/zhihu/cards";
import { handleExperienceRequest } from "@/zhihu/handler";
import { createZhihuHttpProvider } from "@/zhihu/http-provider";

export const runtime = "nodejs";
export const maxDuration = 60;

let dependencies: ExperienceDependencies | undefined;

export function POST(request: Request): Promise<Response> {
  return handleExperienceRequest(request, {
    getDependencies: () =>
      (dependencies ??= {
        zhihu: createZhihuHttpProvider(),
        ai: createOpenAiCompatibleProvider(),
        createId: randomUUID,
        // Titles are public Zhihu content; no player text or secret is logged.
        logRelevance: (entry) =>
          console.info(`[zhihu-relevance] score=${entry.score ?? "none"} kept=${entry.kept} title=${entry.title.slice(0, 60)}`),
      }),
    createId: randomUUID,
    logUsage: (entry) =>
      console.info(
        `[zhihu-usage] game=${entry.gameId ?? "-"} source=${entry.source} zhihu_calls=${entry.zhihuCalls} zhihu_failed=${entry.zhihuFailures} ai_calls=${entry.aiCalls} candidates=${entry.candidates} kept=${entry.kept} relevant=${entry.relevant} ${entry.durationMs}ms`,
      ),
  });
}

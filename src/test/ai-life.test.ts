import { describe, expect, it } from "vitest";

import { buildFallbackLifeDraft } from "@/ai/fallbacks";
import { MAX_COMMEMORATIVE_FACTS, MAX_TIMELINE_POINTS, normalizeLifeDraft } from "@/ai/normalize";
import { runAiOperation } from "@/ai/service";
import type { AiProvider } from "@/ai/provider";
import { LifeComparisonSchema, LifePathSchema } from "@/game-state/contracts";

const facts = [{ statement: "完成第一条店铺视频" }, { statement: "家人愿意暂时配合" }];

describe("normalizeLifeDraft", () => {
  it("truncates by count and by character length", () => {
    const result = normalizeLifeDraft(
      {
        timeline: Array.from({ length: 9 }, (_, index) => ({ label: `第${index + 1}年${"长".repeat(200)}`, summary: "事".repeat(5_000) })),
        currentState: "现".repeat(5_000),
        reunionAnswer: "答".repeat(5_000),
        commemorativeFacts: Array.from({ length: 40 }, (_, index) => `纪念${index}${"字".repeat(300)}`),
      },
      { mode: "FIVE_YEARS", facts },
    );

    expect(result.life.timeline).toHaveLength(MAX_TIMELINE_POINTS);
    expect(result.life.timeline.every(({ label, summary }) => label.length <= 160 && summary.length <= 4_000)).toBe(true);
    expect(result.life.commemorativeFacts).toHaveLength(MAX_COMMEMORATIVE_FACTS);
    expect(result.life.commemorativeFacts.every((item) => item.length <= 160)).toBe(true);
    expect(result.comparison).toBeNull();
    expect(LifePathSchema.safeParse(result.life).success).toBe(true);
  });

  it("pads a thin draft to a valid LifePath from real Facts", () => {
    const result = normalizeLifeDraft({ timeline: ["只有一段"], comparison: { changedByDecision: ["x"] } }, { mode: "FIVE_YEARS", facts });

    expect(result.life.timeline).toHaveLength(2);
    expect(result.life.commemorativeFacts).toEqual(["完成第一条店铺视频", "家人愿意暂时配合"]);
    expect(result.life.reunionAnswer.length).toBeGreaterThan(0);
    expect(result.comparison).toBeNull();
  });

  it("always returns a comparison for COUNTERFACTUAL, possibly with empty lists", () => {
    const empty = normalizeLifeDraft({}, { mode: "COUNTERFACTUAL", facts: [] });
    expect(empty.comparison).toEqual({ changedByDecision: [], unchanged: [], external: [] });
    expect(empty.life.timeline.map(({ label }) => label)).toEqual(["一个月以后", "五年以后"]);

    const filled = normalizeLifeDraft(
      { timeline: [{ time: "一年以后", text: "开始接单" }], comparison: { changedByDecision: ["收入来源"], unchanged: ["生活城市"], external: "市场变化" } },
      { mode: "COUNTERFACTUAL", facts },
    );
    expect(filled.life.timeline[0]).toEqual({ label: "一年以后", summary: "开始接单" });
    expect(LifeComparisonSchema.parse(filled.comparison)).toEqual({
      changedByDecision: ["收入来源"],
      unchanged: ["生活城市"],
      external: ["市场变化"],
    });
  });

  it("normalizes both fallback templates", () => {
    expect(normalizeLifeDraft(buildFallbackLifeDraft({ mode: "FIVE_YEARS" }), { mode: "FIVE_YEARS", facts }).life.commemorativeFacts).toHaveLength(2);
    const counterfactual = normalizeLifeDraft(
      buildFallbackLifeDraft({ mode: "COUNTERFACTUAL", originalAction: "接下合作", replacementAction: "暂时不接" }),
      { mode: "COUNTERFACTUAL", facts },
    );
    expect(counterfactual.comparison?.changedByDecision[0]).toContain("暂时不接");
  });
});

describe("hedged AI attempts", () => {
  const request = {
    operation: "UNDERSTAND_INTENT" as const,
    input: { rawText: "回家帮忙，同时拍视频。", selectedPlans: [] },
  };
  const fastPolicy = { UNDERSTAND_INTENT: { callTimeoutMs: 5_000, budgetMs: 60_000, hedgeAfterMs: 20 } };
  let next = 0;
  const createId = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;

  it("starts a second call when the first hangs and aborts the loser", async () => {
    const signals: AbortSignal[] = [];
    const provider: AiProvider = {
      completeJson: ({ signal }) => {
        signals.push(signal!);
        if (signals.length === 1) {
          return new Promise((_, reject) => signal!.addEventListener("abort", () => reject(new Error("aborted"))));
        }
        return Promise.resolve('{"summary":"你打算回家帮忙。","goals":["帮家里"],"priorities":["家庭"],"currentActions":["拍视频"]}');
      },
    };

    const data = await runAiOperation(request, { provider, createId, policies: fastPolicy });

    expect(data.generation).toBe("AI");
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
  });

  it("retries an invalid answer immediately and falls back when both attempts fail", async () => {
    let calls = 0;
    const provider: AiProvider = {
      completeJson: () => {
        calls += 1;
        return Promise.resolve("抱歉，我无法回答");
      },
    };

    const data = await runAiOperation(request, {
      provider,
      createId,
      policies: { UNDERSTAND_INTENT: { callTimeoutMs: 5_000, budgetMs: 60_000, hedgeAfterMs: 60_000 } },
    });

    expect(calls).toBe(2);
    expect(data.generation).toBe("FALLBACK");
  });
});

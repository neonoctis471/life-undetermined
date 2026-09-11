import { describe, expect, it } from "vitest";

import { IntentCandidateSchema, SituationCandidateSchema } from "@/ai/contracts";
import { buildFallbackIntentDraft, buildFallbackSituationDraft } from "@/ai/fallbacks";
import {
  AiNormalizeError,
  CHAPTER_TIME_LABELS,
  CUSTOM_ACTION_LABEL,
  MAX_PRESET_ACTIONS,
  POSSIBILITY_TITLES,
  normalizeIntentDraft,
  normalizeSituationDraft,
} from "@/ai/normalize";
import { extractJsonObject } from "@/ai/service";
import { IntentSchema, SituationSchema, type Decision, type Intent, type ResolvedOutcome } from "@/contracts/game";
import { createInitialGameState, transitionGameState, type EngineDependencies } from "@/game-state/engine";
import type { GameState } from "@/game-state/contracts";

const timestamp = "2026-09-11T12:00:00.000Z";

function sequentialIds() {
  let next = 0;
  return () => {
    next += 1;
    return `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`;
  };
}

const intentContext = {
  rawText: "我想先回家帮家里做店里的事情，同时学剪辑试着拍视频。",
  selectedPlans: ["帮家里做生意", "做自媒体"],
};

describe("normalizeIntentDraft", () => {
  it("fills every required array from defaults when the draft is empty", () => {
    const result = normalizeIntentDraft({}, intentContext);

    expect(result.intent.rawText).toBe(intentContext.rawText);
    expect(result.intent.goals).toEqual(["帮家里做生意", "做自媒体"]);
    expect(result.intent.priorities.length).toBeGreaterThanOrEqual(1);
    expect(result.intent.currentActions.length).toBeGreaterThanOrEqual(1);
    expect(result.intent.constraints).toEqual([]);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(IntentSchema.safeParse({ ...result.intent, confirmedAt: timestamp }).success).toBe(true);
  });

  it("repairs messy model output instead of rejecting it", () => {
    const result = normalizeIntentDraft(
      {
        summary: "  你打算先回家帮忙。  ",
        goals: ["1. 帮助家庭经营", "- 帮助家庭经营", 42, null, { label: "尝试内容创作" }, "x".repeat(500)],
        priorities: "家庭责任",
        constraints: Array.from({ length: 20 }, (_, index) => `限制 ${index}`),
        currentActions: [],
        confirmedAt: "model-invented-timestamp",
        id: "model-invented-id",
      },
      intentContext,
    );

    expect(result.summary).toBe("你打算先回家帮忙。");
    expect(result.intent.goals[0]).toBe("帮助家庭经营");
    expect(result.intent.goals).toContain("42");
    expect(result.intent.goals).toContain("尝试内容创作");
    expect(result.intent.goals.every((goal) => goal.length <= 40)).toBe(true);
    expect(result.intent.priorities).toEqual(["家庭责任"]);
    expect(result.intent.constraints.length).toBeLessThanOrEqual(8);
    expect(result.intent.currentActions.length).toBe(1);
    expect(IntentCandidateSchema.safeParse(result.intent).success).toBe(true);
    expect(result.intent).not.toHaveProperty("confirmedAt");
  });

  it.each([null, "text", ["array"], 3])("rejects a non-object draft (%s)", (draft) => {
    expect(() => normalizeIntentDraft(draft, intentContext)).toThrow(AiNormalizeError);
  });

  it("normalizes the fallback template through the same gate", () => {
    const result = normalizeIntentDraft(buildFallbackIntentDraft(intentContext), intentContext);
    expect(result.summary).toContain("回家");
  });
});

describe("normalizeSituationDraft", () => {
  const facts = [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2" },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3" },
  ];

  const richDraft = {
    tensions: ["拍摄和店里忙碌冲突"],
    externalConditions: ["周末客流高峰"],
    triggerFactIndexes: [1, 2],
    forbiddenFactKinds: ["CREATION", "FINANCE"],
    timeLabel: "模型自己写的时间",
    momentum: {
      title: "好结果",
      summary: "第一条视频有几条评论。",
      scene: "下午五点半，你刚把手机架好。",
      actions: ["A. 先帮忙，关店后再拍", "和家里商量留二十分钟", "今天不拍，先观察顾客", "我有自己的办法", "去问问隔壁店主", "第五个多余选项"],
    },
    unexpected: {
      summary: "店里突然忙了起来。",
      scene: "三桌客人同时进门。",
      actions: ["先帮忙"],
      externalConditions: ["突降大雨"],
    },
  };

  it("keeps branch-level external conditions inside their own variant", () => {
    const result = normalizeSituationDraft(richDraft, { chapter: "DAY_8", facts: [] }, { createId: sequentialIds() });

    expect(result.variants.MOMENTUM.externalConditions).toEqual(["周末客流高峰"]);
    expect(result.variants.UNEXPECTED.externalConditions).toEqual(["突降大雨"]);
  });

  it("injects ids, fixed titles and time labels; DAY_8 drops every trigger index", () => {
    const createId = sequentialIds();
    const result = normalizeSituationDraft(richDraft, { chapter: "DAY_8", facts: [] }, { createId });

    expect(SituationCandidateSchema.safeParse(result).success).toBe(true);
    expect(result.possibilities.map((item) => [item.kind, item.title])).toEqual([
      ["MOMENTUM", POSSIBILITY_TITLES.MOMENTUM],
      ["UNEXPECTED", POSSIBILITY_TITLES.UNEXPECTED],
    ]);
    for (const variant of [result.variants.MOMENTUM, result.variants.UNEXPECTED]) {
      expect(SituationSchema.safeParse(variant).success).toBe(true);
      expect(variant.triggerFactIds).toEqual([]);
      expect(variant.forbiddenFactKinds).toEqual([]);
      expect(variant.timeLabel).toBe(CHAPTER_TIME_LABELS.DAY_8);
      expect(variant.availableActions.at(-1)).toMatchObject({ kind: "CUSTOM_PLACEHOLDER", label: CUSTOM_ACTION_LABEL });
      expect(variant.availableActions.filter((action) => action.label === CUSTOM_ACTION_LABEL)).toHaveLength(1);
      expect(variant.availableActions.length).toBeLessThanOrEqual(MAX_PRESET_ACTIONS + 1);
    }
    expect(result.variants.MOMENTUM.id).toBe(result.variants.UNEXPECTED.id);
    expect(result.variants.MOMENTUM.availableActions[0]!.label).toBe("先帮忙，关店后再拍");
    expect(result.variants.UNEXPECTED.concreteContext).toBe("三桌客人同时进门。");
  });

  it("builds a playable Situation from an empty draft", () => {
    const result = normalizeSituationDraft({}, { chapter: "DAY_8", facts: [] }, { createId: sequentialIds() });

    expect(result.variants.MOMENTUM.tensions.length).toBeGreaterThanOrEqual(1);
    expect(result.variants.MOMENTUM.availableActions.filter((action) => action.kind === "PRESET").length).toBeGreaterThan(0);
    expect(result.variants.UNEXPECTED.concreteContext.length).toBeGreaterThan(0);
  });

  it("maps 1-based indexes to Fact ids and silently drops invalid ones", () => {
    const result = normalizeSituationDraft(
      { ...richDraft, triggerFactIndexes: [0, 3, "2", 3, 99, -1, 1.5] },
      { chapter: "MONTH_7", facts },
      { createId: sequentialIds() },
    );

    expect(result.variants.MOMENTUM.triggerFactIds).toEqual([facts[2]!.id, facts[1]!.id]);
  });

  it("falls back to the latest Fact when no index is usable in later chapters", () => {
    const result = normalizeSituationDraft(
      { ...richDraft, triggerFactIndexes: [42] },
      { chapter: "YEAR_4", facts },
      { createId: sequentialIds() },
    );

    expect(result.variants.UNEXPECTED.triggerFactIds).toEqual([facts[2]!.id]);
  });

  it("refuses a later chapter without any prior Fact", () => {
    expect(() =>
      normalizeSituationDraft(richDraft, { chapter: "MONTH_7", facts: [] }, { createId: sequentialIds() }),
    ).toThrow(AiNormalizeError);
  });

  it.each(["DAY_8", "MONTH_7", "YEAR_4"] as const)("normalizes the %s fallback template", (chapter) => {
    const result = normalizeSituationDraft(buildFallbackSituationDraft(chapter), { chapter, facts }, {
      createId: sequentialIds(),
    });
    expect(SituationCandidateSchema.safeParse(result).success).toBe(true);
  });
});

describe("extractJsonObject", () => {
  it("accepts bare, fenced and prose-wrapped JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('好的，结果如下：{"a":1} 希望有帮助')).toEqual({ a: 1 });
  });

  it("rejects output without JSON", () => {
    expect(() => extractJsonObject("抱歉，我无法完成")).toThrow(AiNormalizeError);
  });
});

describe("engine accepts normalized candidates", () => {
  const intent: Intent = {
    rawText: intentContext.rawText,
    goals: ["帮助家庭经营"],
    priorities: ["家庭责任"],
    constraints: [],
    currentActions: ["拍第一条视频"],
    confirmedAt: timestamp,
  };

  function playDay8(createId: () => string): { state: GameState; deps: EngineDependencies } {
    const deps: EngineDependencies = { createId, now: () => timestamp };
    let state = createInitialGameState(deps);
    state = transitionGameState(state, { type: "CONFIRM_INTENT", intent }, deps);
    const candidate = normalizeSituationDraft(
      { triggerFactIndexes: [1, 2] },
      { chapter: "DAY_8", facts: state.facts },
      { createId },
    );
    const possibility = candidate.possibilities.find((item) => item.kind === "UNEXPECTED")!;
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: candidate.variants.UNEXPECTED, selectedPossibilityId: possibility.id },
      deps,
    );
    return { state, deps };
  }

  it("records a DAY_8 Situation whose model-provided triggers were discarded", () => {
    const { state } = playDay8(sequentialIds());
    expect(state.currentStage).toBe("SITUATION_READY");
    expect(state.situations[0]!.situation.triggerFactIds).toEqual([]);
  });

  it("links a MONTH_7 Situation to an existing Fact and rejects an unknown one", () => {
    const createId = sequentialIds();
    const played = playDay8(createId);
    const { deps } = played;
    let { state } = played;
    const situation = state.situations[0]!.situation;
    const action = situation.availableActions[0]!;
    const decision: Decision = {
      id: createId(),
      situationId: situation.id,
      selectedActionId: action.id,
      selectedActionKind: "PRESET",
      isKeyDecision: false,
      decidedAt: timestamp,
    };
    state = transitionGameState(state, { type: "RECORD_DECISION", decision }, deps);
    const outcome: ResolvedOutcome = {
      id: createId(),
      decisionId: decision.id,
      narrative: "和家人商量后拍完了第一条视频。",
      gains: [],
      costs: [],
      addedFacts: [
        {
          kind: "CREATION",
          statement: "完成第一条店铺视频",
          source: "GAME_SIMULATION",
          causalReasons: ["PLAYER_DECISION"],
          causedByDecisionIds: [decision.id],
          dependsOnFactIds: [],
        },
      ],
      unresolvedConsequences: [],
      validation: "ACCEPTED",
    };
    state = transitionGameState(state, { type: "APPLY_OUTCOME", outcome }, deps);

    const candidate = normalizeSituationDraft(
      { triggerFactIndexes: [5] },
      { chapter: "MONTH_7", facts: state.facts },
      { createId },
    );
    const variant = candidate.variants.MOMENTUM;
    expect(variant.triggerFactIds).toEqual([state.facts[0]!.id]);

    const selectedPossibilityId = candidate.possibilities[0]!.id;
    const next = transitionGameState(state, { type: "ADD_SITUATION", situation: variant, selectedPossibilityId }, deps);
    expect(next.situations[1]!.situation.triggerFactIds).toEqual([state.facts[0]!.id]);

    const forged = { ...variant, triggerFactIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"] };
    expect(() =>
      transitionGameState(state, { type: "ADD_SITUATION", situation: forged, selectedPossibilityId }, deps),
    ).toThrowError(expect.objectContaining({ code: "INVALID_FACT_REFERENCE" }));
  });
});

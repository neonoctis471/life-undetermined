import { describe, expect, it } from "vitest";

import {
  GAME_STATE_SCHEMA_VERSION,
  GameStateSchema,
  LifeComparisonSchema,
  LifePathSchema,
  PlayedSituationSchema,
} from "@/game-state/contracts";

const ids = {
  game: "11111111-1111-4111-8111-111111111111",
  situation: "22222222-2222-4222-8222-222222222222",
  momentum: "33333333-3333-4333-8333-333333333333",
  unexpected: "44444444-4444-4444-8444-444444444444",
  action: "55555555-5555-4555-8555-555555555555",
};
const timestamp = "2026-09-09T12:00:00.000Z";

const situation = {
  id: ids.situation,
  chapter: "DAY_8",
  timeLabel: "毕业后的第 8 天",
  triggerFactIds: [],
  forbiddenFactKinds: [],
  tensions: ["家庭责任与个人探索"],
  possibilities: [
    {
      id: ids.momentum,
      kind: "MOMENTUM",
      title: "顺势发展的可能",
      summary: "事情稍微顺了一些。",
    },
    {
      id: ids.unexpected,
      kind: "UNEXPECTED",
      title: "意料之外的变化",
      summary: "原来的安排被打断。",
    },
  ],
  concreteContext: "一个具体情境。",
  availableActions: [{ id: ids.action, kind: "PRESET", label: "先沟通" }],
  externalConditions: [],
};

const emptyState = {
  schemaVersion: GAME_STATE_SCHEMA_VERSION,
  gameId: ids.game,
  currentStage: "CREATED",
  intent: null,
  facts: [],
  situations: [],
  decisions: [],
  outcomes: [],
  keyDecisionSnapshot: null,
  fiveYearLife: null,
  parallelLife: null,
  comparison: null,
  updatedAt: timestamp,
};

describe("lightweight game state contracts", () => {
  it("accepts a new empty local game", () => {
    expect(GameStateSchema.parse(emptyState)).toEqual(emptyState);
  });

  it.each(["INTENT_CONFIRMED", "SITUATION_READY", "DECISION_RECORDED", "OUTCOME_RESOLVED", "LONG_TERM_READY", "REUNION_READY", "FORK_READY", "COMPARISON_READY", "COMPLETED"])("rejects empty history at %s", (currentStage) => {
    expect(GameStateSchema.safeParse({ ...emptyState, currentStage }).success).toBe(false);
  });

  it("rejects incompatible schema versions and unknown fields", () => {
    expect(GameStateSchema.safeParse({ ...emptyState, schemaVersion: 2 }).success).toBe(false);
    expect(GameStateSchema.safeParse({ ...emptyState, secret: "must-not-exist" }).success).toBe(false);
  });

  it("requires a played situation to select one of its own possibilities", () => {
    expect(PlayedSituationSchema.safeParse({ situation, selectedPossibilityId: ids.momentum }).success).toBe(true);
    expect(PlayedSituationSchema.safeParse({ situation, selectedPossibilityId: "66666666-6666-4666-8666-666666666666" }).success).toBe(false);
  });

  it("accepts concise life paths and three-way comparisons", () => {
    expect(LifePathSchema.safeParse({
      timeline: [
        { label: "一年后", summary: "开始形成稳定节奏。" },
        { label: "五年后", summary: "仍在经营，也保留创作。" },
      ],
      currentState: "主要参与家庭经营，偶尔接拍摄。",
      reunionAnswer: "现在主要在家里的店，也会拍点东西。",
      commemorativeFacts: ["完成过多个作品"],
    }).success).toBe(true);
    expect(LifeComparisonSchema.safeParse({
      changedByDecision: ["作品数量"],
      unchanged: ["生活城市"],
      external: ["市场变化"],
    }).success).toBe(true);
  });
});

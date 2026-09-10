import { describe, expect, it } from "vitest";

import { GameEventSchema } from "@/contracts/game";

const timestamp = "2026-09-09T12:00:00.000Z";
const ids = {
  event: "11111111-1111-4111-8111-111111111111",
  game: "22222222-2222-4222-8222-222222222222",
  branch: "33333333-3333-4333-8333-333333333333",
  initialBranch: "44444444-4444-4444-8444-444444444444",
  situation: "55555555-5555-4555-8555-555555555555",
  decision: "66666666-6666-4666-8666-666666666666",
  outcome: "77777777-7777-4777-8777-777777777777",
  fact: "88888888-8888-4888-8888-888888888888",
  snapshot: "99999999-9999-4999-8999-999999999999",
  action: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  momentum: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  unexpected: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  targetBranch: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  share: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
};

const event = (type: string, payload: unknown) => ({
  id: ids.event,
  gameId: ids.game,
  branchId: ids.branch,
  eventVersion: 1,
  occurredAt: timestamp,
  idempotencyKey: `${type.toLowerCase()}-001`,
  type,
  payload,
});

const intent = (rawText = "先找工作，同时学习新技能。") => ({
  rawText,
  goals: ["找到工作"],
  priorities: ["经济安全"],
  constraints: [],
  currentActions: ["投递简历"],
  confirmedAt: timestamp,
});

const factProposal = () => ({
  kind: "CREATION",
  statement: "完成第一条视频",
  source: "GAME_SIMULATION",
  causalReasons: ["PLAYER_DECISION"],
  causedByDecisionIds: [ids.decision],
  dependsOnFactIds: [],
});

const fact = () => ({
  ...factProposal(),
  id: ids.fact,
  occurredAt: timestamp,
});

const possibilities = () => [
  {
    id: ids.momentum,
    kind: "MOMENTUM",
    title: "顺势发展的可能",
    summary: "评论里有人询问店里的情况。",
  },
  {
    id: ids.unexpected,
    kind: "UNEXPECTED",
    title: "意料之外的变化",
    summary: "店里突然忙起来，原计划被打断。",
  },
];

const situation = () => ({
  id: ids.situation,
  chapter: "DAY_8",
  timeLabel: "毕业后的第 8 天",
  triggerFactIds: [ids.fact],
  forbiddenFactKinds: [],
  tensions: ["家庭时间与个人探索"],
  possibilities: possibilities(),
  concreteContext: "下午五点半，店里突然来了客人。",
  availableActions: [{ id: ids.action, kind: "PRESET", label: "先帮忙" }],
  externalConditions: [],
});

const decision = () => ({
  id: ids.decision,
  situationId: ids.situation,
  selectedActionId: ids.action,
  selectedActionKind: "PRESET",
  isKeyDecision: false,
  decidedAt: timestamp,
});

const outcome = (validation: string = "ACCEPTED") => ({
  id: ids.outcome,
  decisionId: ids.decision,
  narrative: "你与家人协商出二十分钟，完成了第一次拍摄。",
  gains: ["完成第一次拍摄"],
  costs: ["成片质量低于预期"],
  addedFacts: [factProposal()],
  unresolvedConsequences: ["家人仍有顾虑"],
  validation,
});

const snapshot = () => ({
  id: ids.snapshot,
  gameId: ids.game,
  branchId: ids.branch,
  eventVersion: 1,
  intent: intent(),
  activeFactIds: [ids.fact],
  relationshipSummary: [{ actor: "家人", status: "愿意暂时配合" }],
  worldContext: {
    familyContext: "参与家庭经营",
    economicStartingPoint: "尚无内容收入",
    skills: ["基础剪辑"],
    relationships: ["与家人共同经营"],
    externalEvents: [],
    worldSeed: "seed-demo-001",
  },
  keyDecisionId: ids.decision,
  createdAt: timestamp,
});

const validEvents: Array<[string, unknown]> = [
  ["GAME_CREATED", event("GAME_CREATED", { initialBranchId: ids.initialBranch })],
  ["INTENT_CONFIRMED", event("INTENT_CONFIRMED", intent())],
  ["SITUATION_CREATED", event("SITUATION_CREATED", situation())],
  ["DECISION_MADE", event("DECISION_MADE", decision())],
  ["OUTCOME_RESOLVED", event("OUTCOME_RESOLVED", outcome())],
  ["FACTS_ADDED", event("FACTS_ADDED", { facts: [fact()] })],
  ["YEARS_SIMULATED", event("YEARS_SIMULATED", { summary: "四年后回看。", facts: [fact()] })],
  ["SNAPSHOT_CREATED", event("SNAPSHOT_CREATED", snapshot())],
  [
    "LIFE_FORKED",
    event("LIFE_FORKED", {
      sourceBranchId: ids.branch,
      targetBranchId: ids.targetBranch,
      snapshotId: ids.snapshot,
      replacementDecisionId: ids.decision,
    }),
  ],
  ["SHARE_CREATED", event("SHARE_CREATED", { shareId: ids.share, slug: "share-result-abcdefghijkl" })],
];

describe("authoritative event contract", () => {
  it.each(validEvents)("accepts the %s event variant", (_type, value) => {
    expect(GameEventSchema.safeParse(value).success).toBe(true);
  });

  it("rejects unknown event types and fractional or negative versions", () => {
    const valid = event("INTENT_CONFIRMED", intent());

    expect(GameEventSchema.safeParse({ ...valid, type: "FACTS_REWRITTEN" }).success).toBe(false);
    expect(GameEventSchema.safeParse({ ...valid, eventVersion: -1 }).success).toBe(false);
    expect(GameEventSchema.safeParse({ ...valid, eventVersion: 1.5 }).success).toBe(false);
  });

  it("rejects unknown envelope and payload keys", () => {
    expect(
      GameEventSchema.safeParse({
        ...event("GAME_CREATED", { initialBranchId: ids.initialBranch }),
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(
      GameEventSchema.safeParse(
        event("GAME_CREATED", {
          initialBranchId: ids.initialBranch,
          unexpected: true,
        }),
      ).success,
    ).toBe(false);
  });

  it("keeps proposed facts and authoritative facts on opposite sides of the boundary", () => {
    expect(
      GameEventSchema.safeParse(
        event("OUTCOME_RESOLVED", {
          ...outcome(),
          addedFacts: [{ ...factProposal(), id: ids.fact, occurredAt: timestamp }],
        }),
      ).success,
    ).toBe(false);
    expect(
      GameEventSchema.safeParse(event("FACTS_ADDED", { facts: [factProposal()] })).success,
    ).toBe(false);
  });

  it.each(["PENDING", "REJECTED"])(
    "rejects %s validation in an authoritative outcome event",
    (validation) => {
      expect(
        GameEventSchema.safeParse(event("OUTCOME_RESOLVED", outcome(validation))).success,
      ).toBe(false);
    },
  );

  it.each([
    ["missing causal triggers", { triggerFactIds: [] }],
    [
      "duplicate possibility kinds",
      {
        possibilities: [
          possibilities()[0],
          {
            ...possibilities()[1],
            kind: "MOMENTUM",
            title: "顺势发展的可能",
          },
        ],
      },
    ],
    [
      "a possibility title that disagrees with its kind",
      {
        possibilities: [
          { ...possibilities()[0], title: "意料之外的变化" },
          possibilities()[1],
        ],
      },
    ],
  ])("rejects a situation event with %s", (_label, override) => {
    expect(
      GameEventSchema.safeParse(
        event("SITUATION_CREATED", { ...situation(), ...override }),
      ).success,
    ).toBe(false);
  });
});

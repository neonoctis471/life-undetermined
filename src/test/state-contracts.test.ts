import { describe, expect, it } from "vitest";

import {
  DecisionSchema,
  FactProposalSchema,
  FactSchema,
  IntentSchema,
  OutcomeSchema,
  SituationSchema,
  SnapshotSchema,
} from "@/contracts/game";

const ids = {
  game: "11111111-1111-4111-8111-111111111111",
  branch: "22222222-2222-4222-8222-222222222222",
  situation: "33333333-3333-4333-8333-333333333333",
  decision: "44444444-4444-4444-8444-444444444444",
  outcome: "55555555-5555-4555-8555-555555555555",
  fact: "66666666-6666-4666-8666-666666666666",
  snapshot: "77777777-7777-4777-8777-777777777777",
  action: "88888888-8888-4888-8888-888888888888",
  possibility: "99999999-9999-4999-8999-999999999999",
};

const timestamp = "2026-09-09T12:00:00.000Z";

describe("six game-state schemas", () => {
  it("accepts a multi-goal Intent and preserves raw text", () => {
    const intent = IntentSchema.parse({
      rawText: "回家帮家里，同时学习剪辑并尝试做视频。",
      goals: ["帮助家庭经营", "尝试内容创作"],
      priorities: ["家庭责任", "控制投入风险"],
      constraints: ["每天可支配时间有限"],
      currentActions: ["制作第一条店铺视频"],
      confirmedAt: timestamp,
    });

    expect(intent.rawText).toContain("回家");
    expect(intent.goals).toHaveLength(2);
  });

  it("requires Facts to carry provenance and causal reasons", () => {
    const fact = FactSchema.parse({
      id: ids.fact,
      kind: "CREATION",
      statement: "完成第一条视频",
      occurredAt: timestamp,
      source: "GAME_SIMULATION",
      causalReasons: ["PLAYER_DECISION"],
      causedByDecisionIds: [ids.decision],
      dependsOnFactIds: [],
    });

    expect(fact.kind).toBe("CREATION");
    expect(FactProposalSchema.safeParse({ kind: "CREATION" }).success).toBe(false);
  });

  it("accepts a Situation with two non-evaluative possibilities", () => {
    const situation = SituationSchema.parse({
      id: ids.situation,
      chapter: "DAY_8",
      timeLabel: "毕业后的第 8 天",
      triggerFactIds: [],
      forbiddenFactKinds: [],
      tensions: ["家庭时间与个人探索"],
      possibilities: [
        {
          id: ids.possibility,
          kind: "MOMENTUM",
          title: "顺势发展的可能",
          summary: "评论里有人询问店里的情况。",
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          kind: "UNEXPECTED",
          title: "意料之外的变化",
          summary: "店里突然忙起来，原计划被打断。",
        },
      ],
      concreteContext: "下午五点半，店里突然来了客人。",
      availableActions: [
        {
          id: ids.action,
          kind: "PRESET",
          label: "先帮忙，关店以后再拍",
        },
      ],
      externalConditions: [],
    });

    expect(situation.possibilities).toHaveLength(2);
  });

  it("requires a custom action when the custom placeholder is selected", () => {
    const invalid = DecisionSchema.safeParse({
      id: ids.decision,
      situationId: ids.situation,
      selectedActionId: ids.action,
      selectedActionKind: "CUSTOM_PLACEHOLDER",
      isKeyDecision: false,
      decidedAt: timestamp,
    });

    expect(invalid.success).toBe(false);
  });

  it("accepts an Outcome as proposed changes rather than a full state", () => {
    const outcome = OutcomeSchema.parse({
      id: ids.outcome,
      decisionId: ids.decision,
      narrative: "你与家人协商出二十分钟，视频完成得有些仓促。",
      gains: ["完成第一次拍摄"],
      costs: ["成片质量低于预期"],
      addedFacts: [
        {
          kind: "CREATION",
          statement: "完成第一条视频",
          source: "GAME_SIMULATION",
          causalReasons: ["PLAYER_DECISION"],
          causedByDecisionIds: [ids.decision],
          dependsOnFactIds: [],
        },
      ],
      unresolvedConsequences: ["家人仍未完全理解这项尝试"],
      validation: "PENDING",
    });

    expect(outcome.addedFacts).toHaveLength(1);
    expect("state" in outcome).toBe(false);
  });

  it("requires Snapshot to pin an event version and WorldContext", () => {
    const snapshot = SnapshotSchema.parse({
      id: ids.snapshot,
      gameId: ids.game,
      branchId: ids.branch,
      eventVersion: 7,
      intent: {
        rawText: "先回家帮忙，同时尝试做视频。",
        goals: ["帮助家庭经营"],
        priorities: ["家庭责任"],
        constraints: [],
        currentActions: ["尝试拍摄"],
        confirmedAt: timestamp,
      },
      activeFactIds: [ids.fact],
      relationshipSummary: [
        { actor: "家人", status: "愿意暂时配合，但仍有顾虑" },
      ],
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

    expect(snapshot.eventVersion).toBe(7);
  });
});

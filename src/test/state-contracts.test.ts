import { describe, expect, it } from "vitest";

import {
  DecisionSchema,
  FactProposalSchema,
  FactSchema,
  IntentSchema,
  OutcomeSchema,
  ResolvedOutcomeSchema,
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
  it("accepts a multi-goal Intent and preserves raw text exactly", () => {
    const intent = IntentSchema.parse({
      rawText: "  回家帮家里，同时学习剪辑并尝试做视频。  ",
      goals: ["帮助家庭经营", "尝试内容创作"],
      priorities: ["家庭责任", "控制投入风险"],
      constraints: ["每天可支配时间有限"],
      currentActions: ["制作第一条店铺视频"],
      confirmedAt: timestamp,
    });

    expect(intent.rawText).toBe("  回家帮家里，同时学习剪辑并尝试做视频。  ");
    expect(intent.goals).toHaveLength(2);
  });

  it("accepts 4,000 raw characters but rejects empty, whitespace-only and longer input", () => {
    const validIntent = {
      rawText: "x".repeat(4_000),
      goals: ["找到工作"],
      priorities: ["经济安全"],
      constraints: [],
      currentActions: ["投递简历"],
      confirmedAt: timestamp,
    };

    expect(IntentSchema.parse(validIntent).rawText).toHaveLength(4_000);
    expect(IntentSchema.safeParse({ ...validIntent, rawText: "" }).success).toBe(false);
    expect(IntentSchema.safeParse({ ...validIntent, rawText: " \n\t " }).success).toBe(false);
    expect(
      IntentSchema.safeParse({ ...validIntent, rawText: "x".repeat(4_001) }).success,
    ).toBe(false);
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
      triggerFactIds: [ids.fact],
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

  it("requires between one and sixteen causal trigger facts", () => {
    const baseSituation = {
      id: ids.situation,
      chapter: "DAY_8",
      timeLabel: "毕业后的第 8 天",
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
    } as const;

    const maximumTriggerFacts = Array.from({ length: 16 }, (_, index) =>
      `${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );

    expect(
      SituationSchema.safeParse({ ...baseSituation, triggerFactIds: maximumTriggerFacts }).success,
    ).toBe(true);
    expect(
      SituationSchema.safeParse({ ...baseSituation, triggerFactIds: [] }).success,
    ).toBe(false);
    expect(
      SituationSchema.safeParse({
        ...baseSituation,
        triggerFactIds: [
          ...maximumTriggerFacts,
          "ffffffff-ffff-4fff-8fff-ffffffffffff",
        ],
      }).success,
    ).toBe(false);
  });

  it("couples each possibility kind to its canonical title", () => {
    const invalid = SituationSchema.safeParse({
      id: ids.situation,
      chapter: "DAY_8",
      timeLabel: "毕业后的第 8 天",
      triggerFactIds: [ids.fact],
      forbiddenFactKinds: [],
      tensions: ["家庭时间与个人探索"],
      possibilities: [
        {
          id: ids.possibility,
          kind: "MOMENTUM",
          title: "意料之外的变化",
          summary: "错误地混合了类型和标题。",
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          kind: "UNEXPECTED",
          title: "顺势发展的可能",
          summary: "错误地混合了类型和标题。",
        },
      ],
      concreteContext: "下午五点半，店里突然来了客人。",
      availableActions: [{ id: ids.action, kind: "PRESET", label: "先帮忙" }],
      externalConditions: [],
    });

    expect(invalid.success).toBe(false);
  });

  it("requires exactly one momentum and one unexpected possibility", () => {
    const invalid = SituationSchema.safeParse({
      id: ids.situation,
      chapter: "DAY_8",
      timeLabel: "毕业后的第 8 天",
      triggerFactIds: [ids.fact],
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
          kind: "MOMENTUM",
          title: "顺势发展的可能",
          summary: "又一个顺势发展的可能。",
        },
      ],
      concreteContext: "下午五点半，店里突然来了客人。",
      availableActions: [{ id: ids.action, kind: "PRESET", label: "先帮忙" }],
      externalConditions: [],
    });

    expect(invalid.success).toBe(false);
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

  it("accepts only the action field allowed by the selected decision kind", () => {
    const decision = {
      id: ids.decision,
      situationId: ids.situation,
      selectedActionId: ids.action,
      reason: "先保证当天的经营不受影响。",
      isKeyDecision: false,
      decidedAt: timestamp,
    };

    expect(
      DecisionSchema.safeParse({ ...decision, selectedActionKind: "PRESET" }).success,
    ).toBe(true);
    expect(
      DecisionSchema.safeParse({
        ...decision,
        selectedActionKind: "PRESET",
        customAction: "偷偷加入自定义动作",
      }).success,
    ).toBe(false);
    expect(
      DecisionSchema.safeParse({
        ...decision,
        selectedActionKind: "CUSTOM_PLACEHOLDER",
        customAction: "先沟通，再安排二十分钟完成拍摄",
      }).success,
    ).toBe(true);
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

  it("restricts resolved outcomes to accepted or fallback validation", () => {
    const resolvedOutcome = {
      id: ids.outcome,
      decisionId: ids.decision,
      narrative: "你与家人协商出二十分钟，视频完成得有些仓促。",
      gains: ["完成第一次拍摄"],
      costs: ["成片质量低于预期"],
      addedFacts: [],
      unresolvedConsequences: [],
    };

    for (const validation of ["ACCEPTED", "FALLBACK"] as const) {
      expect(ResolvedOutcomeSchema.safeParse({ ...resolvedOutcome, validation }).success).toBe(
        true,
      );
    }

    for (const validation of ["PENDING", "REJECTED"] as const) {
      expect(ResolvedOutcomeSchema.safeParse({ ...resolvedOutcome, validation }).success).toBe(
        false,
      );
      expect(OutcomeSchema.safeParse({ ...resolvedOutcome, validation }).success).toBe(true);
    }
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

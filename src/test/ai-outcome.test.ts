import { describe, expect, it } from "vitest";

import { buildFallbackOutcomeDraft } from "@/ai/fallbacks";
import {
  MAX_OUTCOME_FACTS,
  normalizeOutcomeDraft,
  normalizeSituationDraft,
  resolveCausalEvidence,
} from "@/ai/normalize";
import { ResolvedOutcomeSchema, type Decision, type Intent, type ResolvedOutcome } from "@/contracts/game";
import {
  GameStateSchema,
  createInitialGameState,
  transitionGameState,
  type EngineDependencies,
  type GameState,
} from "@/game-state";

const timestamp = "2026-09-12T09:00:00.000Z";

function sequentialIds() {
  let next = 0;
  return () => {
    next += 1;
    return `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`;
  };
}

const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const F2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const context = {
  decisionId: D,
  facts: [{ id: F1 }, { id: F2 }],
  actionLabel: "和家里商量留二十分钟",
  validation: "ACCEPTED" as const,
};

describe("resolveCausalEvidence", () => {
  it("attaches the current Decision for PLAYER_DECISION", () => {
    expect(resolveCausalEvidence(["PLAYER_DECISION"], [], context)).toEqual({
      causalReasons: ["PLAYER_DECISION"],
      causedByDecisionIds: [D],
      dependsOnFactIds: [],
    });
    expect(resolveCausalEvidence(["player_decision"], [], context).causedByDecisionIds).toEqual([D]);
  });

  it("maps PRIOR_FACT indexes and drops the reason when nothing maps", () => {
    expect(resolveCausalEvidence(["PRIOR_FACT"], [2, 9], context)).toEqual({
      causalReasons: ["PRIOR_FACT"],
      causedByDecisionIds: [],
      dependsOnFactIds: [F2],
    });
    expect(resolveCausalEvidence(["PRIOR_FACT"], [0, 9], context)).toEqual({
      causalReasons: ["PLAYER_DECISION"],
      causedByDecisionIds: [D],
      dependsOnFactIds: [],
    });
  });

  it("always drops EXTERNAL_EVENT because no external event id exists", () => {
    expect(resolveCausalEvidence(["EXTERNAL_EVENT"], [], context).causalReasons).toEqual(["PLAYER_DECISION"]);
    expect(resolveCausalEvidence(["EXTERNAL_EVENT", "PRIOR_FACT"], [1], context)).toEqual({
      causalReasons: ["PRIOR_FACT"],
      causedByDecisionIds: [],
      dependsOnFactIds: [F1],
    });
  });

  it("keeps MIXED_CAUSE only with two evidence kinds, otherwise degrades it", () => {
    expect(resolveCausalEvidence(["MIXED_CAUSE"], [1], context)).toEqual({
      causalReasons: ["MIXED_CAUSE"],
      causedByDecisionIds: [D],
      dependsOnFactIds: [F1],
    });
    expect(resolveCausalEvidence(["MIXED_CAUSE"], [], context)).toEqual({
      causalReasons: ["PLAYER_DECISION"],
      causedByDecisionIds: [D],
      dependsOnFactIds: [],
    });
  });

  it("falls back to PLAYER_DECISION when every claim is unusable", () => {
    expect(resolveCausalEvidence(["lucky", ""], [5], context).causalReasons).toEqual(["PLAYER_DECISION"]);
  });
});

describe("normalizeOutcomeDraft", () => {
  it("injects ids and server-side validation, ignoring model-supplied authority fields", () => {
    const result = normalizeOutcomeDraft(
      {
        id: "model-id",
        decisionId: "model-decision",
        validation: "PENDING",
        narrative: "家人答应晚饭前给你二十分钟。",
        gains: ["完成第一条视频"],
        facts: [
          {
            id: "model-fact-id",
            kind: "creation",
            statement: "完成第一条店铺视频",
            source: "ZHIHU_ADAPTED",
            causalReasons: ["PLAYER_DECISION"],
          },
        ],
      },
      context,
      { createId: sequentialIds() },
    );

    expect(ResolvedOutcomeSchema.safeParse(result).success).toBe(true);
    expect(result.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(result.decisionId).toBe(D);
    expect(result.validation).toBe("ACCEPTED");
    expect(result.addedFacts[0]).toEqual({
      kind: "CREATION",
      statement: "完成第一条店铺视频",
      source: "GAME_SIMULATION",
      causalReasons: ["PLAYER_DECISION"],
      causedByDecisionIds: [D],
      dependsOnFactIds: [],
    });
  });

  it("always yields at least one Fact", () => {
    const fromNarrative = normalizeOutcomeDraft(
      { narrative: "家人答应晚饭前给你二十分钟。视频拍完了。", facts: [] },
      context,
      { createId: sequentialIds() },
    );
    expect(fromNarrative.addedFacts.map(({ statement }) => statement)).toEqual(["家人答应晚饭前给你二十分钟"]);

    const fromNothing = normalizeOutcomeDraft({}, context, { createId: sequentialIds() });
    expect(fromNothing.addedFacts).toHaveLength(1);
    expect(fromNothing.addedFacts[0]!.causedByDecisionIds).toEqual([D]);
  });

  it("accepts string Facts, maps unknown kinds to ACTIVITY and caps the count", () => {
    const result = normalizeOutcomeDraft(
      {
        narrative: "一段叙述。",
        facts: ["仍然没有收入", { kind: "MOOD", statement: "有点累" }, "仍然没有收入", "事实三", "事实四", "事实五", { kind: 3 }],
      },
      context,
      { createId: sequentialIds() },
    );
    expect(result.addedFacts).toHaveLength(MAX_OUTCOME_FACTS);
    expect(result.addedFacts[1]!.kind).toBe("ACTIVITY");
    expect(new Set(result.addedFacts.map(({ statement }) => statement)).size).toBe(MAX_OUTCOME_FACTS);
  });

  it("labels the fallback template as FALLBACK", () => {
    const result = normalizeOutcomeDraft(
      buildFallbackOutcomeDraft(context.actionLabel),
      { ...context, validation: "FALLBACK" },
      { createId: sequentialIds() },
    );
    expect(result.validation).toBe("FALLBACK");
    expect(result.addedFacts.length).toBeGreaterThanOrEqual(1);
  });
});

describe("engine applies normalized Outcomes", () => {
  const intent: Intent = {
    rawText: "回家帮忙，同时尝试拍视频。",
    goals: ["帮助家庭经营"],
    priorities: ["家庭责任"],
    constraints: [],
    currentActions: ["拍第一条视频"],
    confirmedAt: timestamp,
  };

  function recordDecision(state: GameState, deps: EngineDependencies, createId: () => string): { state: GameState; decision: Decision } {
    const situation = state.situations.at(-1)!.situation;
    const decision: Decision = {
      id: createId(),
      situationId: situation.id,
      selectedActionId: situation.availableActions[0]!.id,
      selectedActionKind: "PRESET",
      isKeyDecision: false,
      decidedAt: timestamp,
    };
    return { state: transitionGameState(state, { type: "RECORD_DECISION", decision }, deps), decision };
  }

  it("runs DAY_8 → MONTH_7 with Facts linked only through normalized evidence", () => {
    const createId = sequentialIds();
    const deps: EngineDependencies = { createId, now: () => timestamp };
    let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);

    const day8 = normalizeSituationDraft({}, { chapter: "DAY_8", facts: [] }, { createId });
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: day8.variants.MOMENTUM, selectedPossibilityId: day8.possibilities[0]!.id },
      deps,
    );
    const first = recordDecision(state, deps, createId);
    const outcome1 = normalizeOutcomeDraft(
      {
        narrative: "拍完了第一条视频。",
        facts: [
          { kind: "CREATION", statement: "完成第一条店铺视频", causalReasons: ["PLAYER_DECISION"] },
          // Unbacked claims: EXTERNAL_EVENT has no id and index 3 does not exist yet.
          { kind: "RELATIONSHIP", statement: "家人愿意暂时配合", causalReasons: ["MIXED_CAUSE", "EXTERNAL_EVENT"], dependsOnFactIndexes: [3] },
        ],
      },
      { decisionId: first.decision.id, facts: first.state.facts, actionLabel: "先沟通", validation: "ACCEPTED" },
      { createId },
    );
    state = transitionGameState(first.state, { type: "APPLY_OUTCOME", outcome: outcome1 }, deps);
    expect(state.currentStage).toBe("OUTCOME_RESOLVED");
    expect(state.facts).toHaveLength(2);

    const month7 = normalizeSituationDraft({ triggerFactIndexes: [2] }, { chapter: "MONTH_7", facts: state.facts }, { createId });
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: month7.variants.UNEXPECTED, selectedPossibilityId: month7.possibilities[1]!.id },
      deps,
    );
    const second = recordDecision(state, deps, createId);
    const outcome2 = normalizeOutcomeDraft(
      {
        narrative: "附近店主看过视频后来找你。",
        facts: [
          { kind: "EMPLOYMENT", statement: "附近店主请你帮忙拍视频", causalReasons: ["PRIOR_FACT", "PLAYER_DECISION"], dependsOnFactIndexes: [1, 7] },
        ],
      },
      { decisionId: second.decision.id, facts: second.state.facts, actionLabel: "先沟通", validation: "ACCEPTED" },
      { createId },
    );
    state = transitionGameState(second.state, { type: "APPLY_OUTCOME", outcome: outcome2 }, deps);

    const latest = state.facts.at(-1)!;
    expect(latest.dependsOnFactIds).toEqual([state.facts[0]!.id]);
    expect(latest.causedByDecisionIds).toEqual([second.decision.id]);
    expect(GameStateSchema.safeParse(state).success).toBe(true);
  });

  it("rejects a raw PLAYER_DECISION claim without evidence (why normalize is required)", () => {
    const createId = sequentialIds();
    const deps: EngineDependencies = { createId, now: () => timestamp };
    let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
    const day8 = normalizeSituationDraft({}, { chapter: "DAY_8", facts: [] }, { createId });
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: day8.variants.MOMENTUM, selectedPossibilityId: day8.possibilities[0]!.id },
      deps,
    );
    const { state: recorded, decision } = recordDecision(state, deps, createId);
    const raw: ResolvedOutcome = {
      id: createId(),
      decisionId: decision.id,
      narrative: "一段叙述。",
      gains: [],
      costs: [],
      addedFacts: [
        {
          kind: "ACTIVITY",
          statement: "完成一件事",
          source: "GAME_SIMULATION",
          causalReasons: ["PLAYER_DECISION"],
          causedByDecisionIds: [],
          dependsOnFactIds: [],
        },
      ],
      unresolvedConsequences: [],
      validation: "ACCEPTED",
    };

    expect(() => transitionGameState(recorded, { type: "APPLY_OUTCOME", outcome: raw }, deps)).toThrowError(
      expect.objectContaining({ code: "INVALID_STATE" }),
    );
  });
});

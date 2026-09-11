import { describe, expect, it } from "vitest";

import type { Decision, FactKind, Intent, ResolvedOutcome, Situation } from "@/contracts/game";
import {
  GameStateSchema,
  createInitialGameState,
  transitionGameState,
  type EngineDependencies,
  type GameState,
} from "@/game-state";
import {
  FALLBACK_ECONOMIC_STARTING_POINT,
  FALLBACK_FAMILY_CONTEXT,
  buildKeyDecisionSnapshot,
} from "@/game/key-snapshot";

const timestamp = "2026-09-12T08:00:00.000Z";

function makeDeps(): EngineDependencies {
  let next = 0;
  return {
    createId: () => {
      next += 1;
      return `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`;
    },
    now: () => timestamp,
  };
}

const familyIntent: Intent = {
  rawText: "回家帮父母看店，同时学剪辑。",
  goals: ["帮父母经营店铺", "学剪辑"],
  priorities: ["家庭责任"],
  constraints: ["不想投入太多钱"],
  currentActions: ["拍第一条视频"],
  confirmedAt: timestamp,
};

type Chapter = "DAY_8" | "MONTH_7" | "YEAR_4";

function addSituation(state: GameState, chapter: Chapter, deps: EngineDependencies): GameState {
  const situation: Situation = {
    id: deps.createId(),
    chapter,
    timeLabel: chapter,
    triggerFactIds: chapter === "DAY_8" ? [] : [state.facts.at(-1)!.id],
    forbiddenFactKinds: [],
    tensions: ["时间分配"],
    possibilities: [
      { id: deps.createId(), kind: "MOMENTUM", title: "顺势发展的可能", summary: "有一点进展。" },
      { id: deps.createId(), kind: "UNEXPECTED", title: "意料之外的变化", summary: "安排被打断。" },
    ],
    concreteContext: "一个具体情境。",
    availableActions: [{ id: deps.createId(), kind: "PRESET", label: "先沟通" }],
    externalConditions: [],
  };
  return transitionGameState(
    state,
    { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0]!.id },
    deps,
  );
}

function makeDecision(state: GameState, deps: EngineDependencies, isKeyDecision: boolean): Decision {
  const situation = state.situations.at(-1)!.situation;
  return {
    id: deps.createId(),
    situationId: situation.id,
    selectedActionId: situation.availableActions[0]!.id,
    selectedActionKind: "PRESET",
    isKeyDecision,
    decidedAt: timestamp,
  };
}

function applyOutcome(
  state: GameState,
  deps: EngineDependencies,
  facts: { kind: FactKind; statement: string }[],
): GameState {
  const decisionId = state.decisions.at(-1)!.id;
  const outcome: ResolvedOutcome = {
    id: deps.createId(),
    decisionId,
    narrative: "事情往前走了一步。",
    gains: [],
    costs: [],
    addedFacts: facts.map((fact) => ({
      ...fact,
      source: "GAME_SIMULATION",
      causalReasons: ["PLAYER_DECISION"],
      causedByDecisionIds: [decisionId],
      dependsOnFactIds: [],
    })),
    unresolvedConsequences: [],
    validation: "ACCEPTED",
  };
  return transitionGameState(state, { type: "APPLY_OUTCOME", outcome }, deps);
}

function playNonKeyChapter(
  state: GameState,
  chapter: Chapter,
  deps: EngineDependencies,
  facts: { kind: FactKind; statement: string }[],
): GameState {
  let next = addSituation(state, chapter, deps);
  next = transitionGameState(next, { type: "RECORD_DECISION", decision: makeDecision(next, deps, false) }, deps);
  return applyOutcome(next, deps, facts);
}

function readyForYear4(deps: EngineDependencies, intent: Intent = familyIntent): { beforeMonth7: GameState; state: GameState } {
  let state = createInitialGameState(deps);
  state = transitionGameState(state, { type: "CONFIRM_INTENT", intent }, deps);
  state = playNonKeyChapter(state, "DAY_8", deps, [
    { kind: "CREATION", statement: "完成第一条店铺视频" },
    { kind: "RELATIONSHIP", statement: "父母愿意暂时配合拍摄" },
  ]);
  const beforeMonth7 = state;
  state = playNonKeyChapter(state, "MONTH_7", deps, [
    { kind: "SKILL", statement: "能独立剪完一条三分钟视频" },
    { kind: "FINANCE", statement: "第一次收到 300 元拍摄费" },
    { kind: "EXTERNAL", statement: "附近商圈开始改造，客流下降" },
  ]);
  return { beforeMonth7, state: addSituation(state, "YEAR_4", deps) };
}

describe("buildKeyDecisionSnapshot", () => {
  it("captures a YEAR_4 Snapshot that RECORD_DECISION accepts", () => {
    const deps = makeDeps();
    const { state } = readyForYear4(deps);
    const decision = makeDecision(state, deps, true);
    const snapshot = buildKeyDecisionSnapshot(state, decision.id, deps);

    expect(snapshot.intent).toEqual(state.intent);
    expect(snapshot.activeFactIds).toEqual(state.facts.map(({ id }) => id));
    expect(snapshot.eventVersion).toBe(3 + 2 + 2);
    expect(snapshot.worldContext.worldSeed).toBe(state.gameId);
    expect(snapshot.worldContext.familyContext).toContain("帮父母经营店铺");
    expect(snapshot.worldContext.familyContext).toContain("父母愿意暂时配合拍摄");
    expect(snapshot.worldContext.economicStartingPoint).toContain("第一次收到 300 元拍摄费");
    expect(snapshot.worldContext.skills).toEqual(["能独立剪完一条三分钟视频"]);
    expect(snapshot.worldContext.relationships).toEqual(["父母愿意暂时配合拍摄"]);
    expect(snapshot.worldContext.externalEvents).toEqual(["附近商圈开始改造，客流下降"]);
    expect(snapshot.worldContext).not.toHaveProperty("city");

    const recorded = transitionGameState(
      state,
      { type: "RECORD_DECISION", decision, keyDecisionSnapshot: snapshot },
      deps,
    );
    expect(recorded.keyDecisionSnapshot?.id).toBe(snapshot.id);

    const completed = applyOutcome(recorded, deps, [{ kind: "EMPLOYMENT", statement: "开始稳定接拍摄订单" }]);
    expect(completed.currentStage).toBe("LONG_TERM_READY");
    expect(GameStateSchema.safeParse(completed).success).toBe(true);
  });

  it("uses non-empty fallbacks when nothing is known", () => {
    const deps = makeDeps();
    let state = createInitialGameState(deps);
    state = transitionGameState(
      state,
      {
        type: "CONFIRM_INTENT",
        intent: { ...familyIntent, goals: ["考研"], priorities: ["上岸"], constraints: [], currentActions: ["报名"] },
      },
      deps,
    );
    state = addSituation(state, "DAY_8", deps);
    const decision = makeDecision(state, deps, true);
    const snapshot = buildKeyDecisionSnapshot(state, decision.id, deps);

    expect(snapshot.worldContext.familyContext).toBe(FALLBACK_FAMILY_CONTEXT);
    expect(snapshot.worldContext.economicStartingPoint).toBe(FALLBACK_ECONOMIC_STARTING_POINT);
    expect(snapshot.activeFactIds).toEqual([]);
    expect(() =>
      transitionGameState(state, { type: "RECORD_DECISION", decision, keyDecisionSnapshot: snapshot }, deps),
    ).not.toThrow();
  });

  it("is rejected by the engine when built from stale Facts", () => {
    const deps = makeDeps();
    const { beforeMonth7, state } = readyForYear4(deps);
    const decision = makeDecision(state, deps, true);
    const stale = buildKeyDecisionSnapshot(beforeMonth7, decision.id, deps);

    expect(() =>
      transitionGameState(state, { type: "RECORD_DECISION", decision, keyDecisionSnapshot: stale }, deps),
    ).toThrowError(expect.objectContaining({ code: "KEY_SNAPSHOT_MISMATCH" }));
  });

  it("is required for the third Decision when no key Decision exists yet", () => {
    const deps = makeDeps();
    const { state } = readyForYear4(deps);

    expect(() =>
      transitionGameState(state, { type: "RECORD_DECISION", decision: makeDecision(state, deps, false) }, deps),
    ).toThrowError(expect.objectContaining({ code: "KEY_SNAPSHOT_REQUIRED" }));
  });
});

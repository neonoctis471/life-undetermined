import { describe, expect, it } from "vitest";

import type { Decision, Intent, ResolvedOutcome, Situation, Snapshot } from "@/contracts/game";
import { GameStateError } from "@/game-state/errors";
import { GameStateSchema, type GameState } from "@/game-state/contracts";
import { createGameStorage } from "@/game-state/storage";
import {
  createInitialGameState,
  transitionGameState,
  type EngineDependencies,
  type GameAction,
} from "@/game-state/engine";

const timestamp = "2026-09-09T12:00:00.000Z";
const ids = {
  game: "11111111-1111-4111-8111-111111111111",
  fact: "22222222-2222-4222-8222-222222222222",
  situation: "33333333-3333-4333-8333-333333333333",
  momentum: "44444444-4444-4444-8444-444444444444",
  unexpected: "55555555-5555-4555-8555-555555555555",
  action: "66666666-6666-4666-8666-666666666666",
  decision: "77777777-7777-4777-8777-777777777777",
  outcome: "88888888-8888-4888-8888-888888888888",
};

function makeDeps(): EngineDependencies {
  const createId = (() => {
    const values = [ids.game, ids.fact, ids.fact, ids.fact];
    return () => values.shift() ?? "99999999-9999-4999-8999-999999999999";
  })();
  return { createId, now: () => timestamp };
}

const intent: Intent = {
  rawText: "回家帮忙，同时尝试拍视频。",
  goals: ["帮助家庭经营", "尝试内容创作"],
  priorities: ["家庭责任"],
  constraints: ["可支配时间有限"],
  currentActions: ["拍摄第一条视频"],
  confirmedAt: timestamp,
};

const makeSituation = (chapter: Situation["chapter"], triggerFactIds: string[]): Situation => ({
  id: ids.situation,
  chapter,
  timeLabel: chapter,
  triggerFactIds,
  forbiddenFactKinds: [],
  tensions: ["时间分配"],
  possibilities: [
    { id: ids.momentum, kind: "MOMENTUM", title: "顺势发展的可能", summary: "有一点进展。" },
    { id: ids.unexpected, kind: "UNEXPECTED", title: "意料之外的变化", summary: "安排被打断。" },
  ],
  concreteContext: "一个具体情境。",
  availableActions: [{ id: ids.action, kind: "PRESET", label: "先沟通" }],
  externalConditions: [],
});

const decision: Decision = {
  id: ids.decision,
  situationId: ids.situation,
  selectedActionId: ids.action,
  selectedActionKind: "PRESET",
  isKeyDecision: false,
  decidedAt: timestamp,
};

const outcome: ResolvedOutcome = {
  id: ids.outcome,
  decisionId: ids.decision,
  narrative: "沟通后获得了一小段时间。",
  gains: ["完成尝试"],
  costs: ["时间更紧张"],
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
  unresolvedConsequences: [],
  validation: "ACCEPTED",
};

describe("lightweight game state engine", () => {
  it("creates a validated empty game and confirms Intent", () => {
    const deps = makeDeps();
    const created = createInitialGameState(deps);
    const confirmed = transitionGameState(created, { type: "CONFIRM_INTENT", intent }, deps);

    expect(created.currentStage).toBe("CREATED");
    expect(confirmed.currentStage).toBe("INTENT_CONFIRMED");
    expect(confirmed.intent?.rawText).toBe(intent.rawText);
  });

  it("rejects an unknown runtime action with a stable state error", () => {
    const deps = makeDeps();
    const unknownAction = { type: "DELETE_EVERYTHING" } as unknown as GameAction;

    expect(() => transitionGameState(createInitialGameState(deps), unknownAction, deps)).toThrowError(
      expect.objectContaining({ code: "INVALID_STATE" }),
    );
  });

  it("maps malformed input state validation to a stable state error", () => {
    const deps = makeDeps();
    const invalidState = {
      ...createInitialGameState(deps),
      currentStage: "BROKEN_STAGE",
    } as unknown as ReturnType<typeof createInitialGameState>;

    expect(() =>
      transitionGameState(invalidState, { type: "CONFIRM_INTENT", intent }, deps),
    ).toThrowError(expect.objectContaining({ code: "INVALID_STATE" }));
  });

  it("maps malformed action payload validation to a stable state error", () => {
    const deps = makeDeps();
    const invalidIntent = { ...intent, rawText: "" };

    expect(() =>
      transitionGameState(
        createInitialGameState(deps),
        { type: "CONFIRM_INTENT", intent: invalidIntent },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_STATE" }));
  });

  it("runs DAY_8 through Situation, Decision, Outcome and authoritative Facts", () => {
    const deps = makeDeps();
    let state = transitionGameState(
      createInitialGameState(deps),
      { type: "CONFIRM_INTENT", intent },
      deps,
    );
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: makeSituation("DAY_8", []), selectedPossibilityId: ids.momentum },
      deps,
    );
    state = transitionGameState(state, { type: "RECORD_DECISION", decision }, deps);
    state = transitionGameState(state, { type: "APPLY_OUTCOME", outcome }, deps);

    expect(state.currentStage).toBe("OUTCOME_RESOLVED");
    expect(state.facts).toHaveLength(1);
    expect(state.facts[0]).toMatchObject({
      id: ids.fact,
      statement: "完成第一条视频",
      occurredAt: timestamp,
    });
  });

  it("rejects out-of-order actions, unknown actions and trigger Facts not in state", () => {
    const deps = makeDeps();
    const created = createInitialGameState(deps);
    expect(() =>
      transitionGameState(created, { type: "RECORD_DECISION", decision }, deps),
    ).toThrow(GameStateError);

    let confirmed = transitionGameState(created, { type: "CONFIRM_INTENT", intent }, deps);
    confirmed = transitionGameState(
      confirmed,
      { type: "ADD_SITUATION", situation: makeSituation("DAY_8", []), selectedPossibilityId: ids.momentum },
      deps,
    );
    confirmed = transitionGameState(confirmed, { type: "RECORD_DECISION", decision }, deps);
    confirmed = transitionGameState(confirmed, { type: "APPLY_OUTCOME", outcome }, deps);
    expect(() =>
      transitionGameState(
        confirmed,
        {
          type: "ADD_SITUATION",
          situation: makeSituation("MONTH_7", ["99999999-9999-4999-8999-999999999999"]),
          selectedPossibilityId: ids.momentum,
        },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_FACT_REFERENCE" }));
    expect(() =>
      transitionGameState(
        confirmed,
        { type: "ADD_SITUATION", situation: makeSituation("MONTH_7", []), selectedPossibilityId: ids.momentum },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_FACT_REFERENCE" }));
  });

  it("rejects a Decision whose action does not belong to the latest Situation", () => {
    const deps = makeDeps();
    let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: makeSituation("DAY_8", []), selectedPossibilityId: ids.momentum },
      deps,
    );
    expect(() =>
      transitionGameState(
        state,
        { type: "RECORD_DECISION", decision: { ...decision, selectedActionId: ids.fact } },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_ACTION_REFERENCE" }));
  });

  it("requires a matching pre-decision Snapshot for the single key Decision", () => {
    const deps = makeDeps();
    let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: makeSituation("DAY_8", []), selectedPossibilityId: ids.momentum },
      deps,
    );
    expect(() =>
      transitionGameState(
        state,
        { type: "RECORD_DECISION", decision: { ...decision, isKeyDecision: true } },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "KEY_SNAPSHOT_REQUIRED" }));
  });

  const loops = [
    {
      situation: "10000000-0000-4000-8000-000000000001",
      momentum: "10000000-0000-4000-8000-000000000002",
      unexpected: "10000000-0000-4000-8000-000000000003",
      action: "10000000-0000-4000-8000-000000000004",
      decision: "10000000-0000-4000-8000-000000000005",
      outcome: "10000000-0000-4000-8000-000000000006",
      fact: "10000000-0000-4000-8000-000000000007",
    },
    {
      situation: "20000000-0000-4000-8000-000000000001",
      momentum: "20000000-0000-4000-8000-000000000002",
      unexpected: "20000000-0000-4000-8000-000000000003",
      action: "20000000-0000-4000-8000-000000000004",
      decision: "20000000-0000-4000-8000-000000000005",
      outcome: "20000000-0000-4000-8000-000000000006",
      fact: "20000000-0000-4000-8000-000000000007",
    },
    {
      situation: "30000000-0000-4000-8000-000000000001",
      momentum: "30000000-0000-4000-8000-000000000002",
      unexpected: "30000000-0000-4000-8000-000000000003",
      action: "30000000-0000-4000-8000-000000000004",
      decision: "30000000-0000-4000-8000-000000000005",
      outcome: "30000000-0000-4000-8000-000000000006",
      fact: "30000000-0000-4000-8000-000000000007",
    },
  ] as const;

  function makeThreeLoopDeps(): EngineDependencies {
    const generated = [ids.game, ...loops.map(({ fact }) => fact)];
    return {
      createId: () => generated.shift() ?? "90000000-0000-4000-8000-000000000001",
      now: () => timestamp,
    };
  }

  function makeDistinctSituation(
    index: number,
    chapter: Situation["chapter"],
    triggerFactIds: string[],
  ): Situation {
    const value = loops[index]!;
    return {
      id: value.situation,
      chapter,
      timeLabel: `第 ${index + 1} 个情境`,
      triggerFactIds,
      forbiddenFactKinds: [],
      tensions: ["时间分配"],
      possibilities: [
        { id: value.momentum, kind: "MOMENTUM", title: "顺势发展的可能", summary: "出现新的进展。" },
        { id: value.unexpected, kind: "UNEXPECTED", title: "意料之外的变化", summary: "原计划受到影响。" },
      ],
      concreteContext: `第 ${index + 1} 个具体情境。`,
      availableActions: [{ id: value.action, kind: "PRESET", label: "先沟通再行动" }],
      externalConditions: [],
    };
  }

  function makeDistinctDecision(
    index: number,
    situation: Situation,
    isKeyDecision = false,
  ): Decision {
    const value = loops[index]!;
    return {
      id: value.decision,
      situationId: situation.id,
      selectedActionId: value.action,
      selectedActionKind: "PRESET",
      isKeyDecision,
      decidedAt: timestamp,
    };
  }

  function makeDistinctOutcome(index: number, selectedDecision: Decision): ResolvedOutcome {
    const value = loops[index]!;
    return {
      id: value.outcome,
      decisionId: selectedDecision.id,
      narrative: `第 ${index + 1} 次选择产生了具体结果。`,
      gains: ["获得一些经验"],
      costs: ["消耗了一些时间"],
      addedFacts: [
        {
          kind: "ACTIVITY",
          statement: `完成第 ${index + 1} 次行动`,
          source: "GAME_SIMULATION",
          causalReasons: ["PLAYER_DECISION"],
          causedByDecisionIds: [selectedDecision.id],
          dependsOnFactIds: [],
        },
      ],
      unresolvedConsequences: [],
      validation: "ACCEPTED",
    };
  }

  function makeLifePath(label: string) {
    return {
      timeline: [
        { label: "一年后", summary: `${label}开始形成节奏。` },
        { label: "五年后", summary: `${label}走到了新的状态。` },
      ],
      currentState: `${label}的当前生活状态。`,
      reunionAnswer: `${label}在同学聚会上的回答。`,
      commemorativeFacts: [`${label}真正发生过的事情`],
    };
  }

  function makeSnapshotFor(state: ReturnType<typeof createInitialGameState>, keyDecision: Decision): Snapshot {
    return {
      id: "40000000-0000-4000-8000-000000000001",
      gameId: state.gameId,
      branchId: "40000000-0000-4000-8000-000000000002",
      eventVersion: 0,
      intent: state.intent!,
      activeFactIds: state.facts.map(({ id }) => id),
      relationshipSummary: [{ actor: "家人", status: "仍在协商分工" }],
      worldContext: {
        familyContext: "参与家庭经营",
        economicStartingPoint: "没有内容收入",
        skills: ["基础剪辑"],
        relationships: ["与家人共同经营"],
        externalEvents: [],
        worldSeed: "demo-seed-0001",
      },
      keyDecisionId: keyDecision.id,
      createdAt: timestamp,
    };
  }

  function makeStateAtKeyDecision() {
    const deps = makeThreeLoopDeps();
    let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
    const situation = makeDistinctSituation(0, "DAY_8", []);
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0]!.id },
      deps,
    );
    const keyDecision = makeDistinctDecision(0, situation, true);
    const snapshot = makeSnapshotFor(state, keyDecision);
    return { stateAtSituation: state, keyDecision, snapshot, deps };
  }

  function finishRemainingLoops(
    stateAtFirstDecision: ReturnType<typeof createInitialGameState>,
    deps: EngineDependencies,
  ) {
    let state = transitionGameState(
      stateAtFirstDecision,
      { type: "APPLY_OUTCOME", outcome: makeDistinctOutcome(0, stateAtFirstDecision.decisions[0]!) },
      deps,
    );
    for (const [index, chapter] of (["MONTH_7", "YEAR_4"] as const).entries()) {
      const loopIndex = index + 1;
      const situation = makeDistinctSituation(loopIndex, chapter, [state.facts.at(-1)!.id]);
      const selectedDecision = makeDistinctDecision(loopIndex, situation);
      state = transitionGameState(
        state,
        { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0]!.id },
        deps,
      );
      state = transitionGameState(state, { type: "RECORD_DECISION", decision: selectedDecision }, deps);
      state = transitionGameState(state, { type: "APPLY_OUTCOME", outcome: makeDistinctOutcome(loopIndex, selectedDecision) }, deps);
    }
    return state;
  }

  function makeStateAtDecision() {
    const deps = makeThreeLoopDeps();
    let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
    const situation = makeDistinctSituation(0, "DAY_8", []);
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0]!.id },
      deps,
    );
    state = transitionGameState(state, { type: "RECORD_DECISION", decision: makeDistinctDecision(0, situation) }, deps);
    return { stateAtDecision: state, deps };
  }

  it("runs exactly three ordered loops without mutating prior states", () => {
    const deps = makeThreeLoopDeps();
    let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
    const originalConfirmed = structuredClone(state);

    for (const [index, chapter] of (["DAY_8", "MONTH_7", "YEAR_4"] as const).entries()) {
      const triggerFactIds = index === 0 ? [] : [state.facts.at(-1)!.id];
      const situation = makeDistinctSituation(index, chapter, triggerFactIds);
      const decision = makeDistinctDecision(index, situation, index === 2);
      const outcome = makeDistinctOutcome(index, decision);

      state = transitionGameState(
        state,
        { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0]!.id },
        deps,
      );
      if (index === 2) {
        const before = structuredClone(state);
        expect(() => transitionGameState(state, {
          type: "RECORD_DECISION", decision: { ...decision, isKeyDecision: false },
        }, deps)).toThrowError(expect.objectContaining({ code: "KEY_SNAPSHOT_REQUIRED" }));
        expect(state).toEqual(before);
      }
      state = transitionGameState(state, {
        type: "RECORD_DECISION", decision,
        ...(decision.isKeyDecision ? { keyDecisionSnapshot: makeSnapshotFor(state, decision) } : {}),
      }, deps);
      state = transitionGameState(state, { type: "APPLY_OUTCOME", outcome }, deps);
    }

    expect(state.situations.map(({ situation }) => situation.chapter)).toEqual(["DAY_8", "MONTH_7", "YEAR_4"]);
    expect(state.currentStage).toBe("LONG_TERM_READY");
    expect(state.facts).toHaveLength(3);
    expect(originalConfirmed).toEqual(expect.objectContaining({ facts: [], situations: [], decisions: [], outcomes: [] }));
    expect(() =>
      transitionGameState(
        state,
        { type: "ADD_SITUATION", situation: makeDistinctSituation(2, "YEAR_4", [state.facts[0]!.id]), selectedPossibilityId: state.situations[0]!.selectedPossibilityId },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_STAGE" }));
    state = transitionGameState(state, { type: "SET_FIVE_YEAR_LIFE", life: makeLifePath("original") }, deps);
    state = transitionGameState(state, { type: "OPEN_FORK" }, deps);
    state = transitionGameState(state, { type: "SET_PARALLEL_LIFE", life: makeLifePath("parallel") }, deps);
    state = transitionGameState(state, { type: "SET_COMPARISON", comparison: { changedByDecision: [], unchanged: [], external: [] } }, deps);
    expect(transitionGameState(state, { type: "COMPLETE" }, deps).currentStage).toBe("COMPLETED");
  });

  it("captures one key Snapshot and completes one parallel comparison", () => {
    const { stateAtSituation, keyDecision, snapshot, deps } = makeStateAtKeyDecision();
    let state = transitionGameState(
      stateAtSituation,
      { type: "RECORD_DECISION", decision: keyDecision, keyDecisionSnapshot: snapshot },
      deps,
    );
    expect(state.keyDecisionSnapshot).toEqual(snapshot);

    state = finishRemainingLoops(state, deps);
    const originalFacts = structuredClone(state.facts);
    const originalLife = makeLifePath("原来的五年");
    const parallelLife = makeLifePath("另一种可能");
    const comparison = {
      changedByDecision: ["作品数量"],
      unchanged: ["生活城市"],
      external: ["市场变化"],
    };

    state = transitionGameState(state, { type: "SET_FIVE_YEAR_LIFE", life: originalLife }, deps);
    expect(state.currentStage).toBe("REUNION_READY");
    state = transitionGameState(state, { type: "OPEN_FORK" }, deps);
    state = transitionGameState(state, { type: "SET_PARALLEL_LIFE", life: parallelLife }, deps);
    state = transitionGameState(state, { type: "SET_COMPARISON", comparison }, deps);
    state = transitionGameState(state, { type: "COMPLETE" }, deps);

    expect(state.currentStage).toBe("COMPLETED");
    expect(state.facts).toEqual(originalFacts);
    expect(state.fiveYearLife).toEqual(originalLife);
    expect(state.parallelLife).toEqual(parallelLife);
    expect(state.comparison).toEqual(comparison);
  });

  const corruptions: [string, (state: GameState) => void][] = [
    ["missing Intent", (s) => { s.intent = null; }],
    ["wrong chapter order", (s) => { s.situations[1]!.situation.chapter = "YEAR_4"; }],
    ["missing Decision", (s) => { s.decisions.pop(); }],
    ["missing Outcome", (s) => { s.outcomes.pop(); }],
    ["missing Situation", (s) => { s.situations.pop(); }],
    ["duplicate Situation", (s) => { s.situations[1]!.situation.id = s.situations[0]!.situation.id; }],
    ["duplicate Decision", (s) => { s.decisions[1]!.id = s.decisions[0]!.id; }],
    ["duplicate Outcome", (s) => { s.outcomes[1]!.id = s.outcomes[0]!.id; }],
    ["duplicate Fact", (s) => { s.facts[1]!.id = s.facts[0]!.id; }],
    ["dangling Decision Situation", (s) => { s.decisions[0]!.situationId = ids.fact; }],
    ["wrong Decision action", (s) => { s.decisions[0]!.selectedActionId = ids.fact; }],
    ["dangling Outcome Decision", (s) => { s.outcomes[0]!.decisionId = ids.fact; }],
    ["dangling trigger Fact", (s) => { s.situations[1]!.situation.triggerFactIds = [ids.fact]; }],
    ["future trigger Fact", (s) => { s.situations[1]!.situation.triggerFactIds = [s.facts[2]!.id]; }],
    ["missing later trigger", (s) => { s.situations[1]!.situation.triggerFactIds = []; }],
    ["dangling Fact Decision", (s) => { s.facts[0]!.causedByDecisionIds = [ids.fact]; }],
    ["dangling Fact dependency", (s) => { s.facts[0]!.dependsOnFactIds = [ids.fact]; }],
    ["dangling superseded Fact", (s) => { s.facts[0]!.supersedesFactId = ids.fact; }],
    ["missing authoritative Fact", (s) => { s.facts.pop(); }],
    ["missing key Snapshot", (s) => { s.keyDecisionSnapshot = null; }],
    ["duplicate key Decision", (s) => { s.decisions[1]!.isKeyDecision = true; }],
    ["Snapshot wrong game", (s) => { s.keyDecisionSnapshot!.gameId = ids.fact; }],
    ["Snapshot wrong Decision", (s) => { s.keyDecisionSnapshot!.keyDecisionId = ids.fact; }],
    ["Snapshot wrong Intent", (s) => { s.keyDecisionSnapshot!.intent.rawText = "other"; }],
    ["Snapshot future Fact", (s) => { s.keyDecisionSnapshot!.activeFactIds = [s.facts[0]!.id]; }],
    ["missing original life", (s) => { s.fiveYearLife = null; }],
    ["premature parallel life", (s) => { s.parallelLife = makeLifePath("parallel"); }],
    ["premature comparison", (s) => { s.comparison = { changedByDecision: [], unchanged: [], external: [] }; }],
    ["incomplete comparison stage", (s) => { s.currentStage = "COMPARISON_READY"; }],
    ["incomplete completed stage", (s) => { s.currentStage = "COMPLETED"; }],
  ];

  it.each(corruptions)("rejects %s in contracts, restoration and engine input", (_name, corrupt) => {
    const { stateAtSituation, keyDecision, snapshot, deps } = makeStateAtKeyDecision();
    let state = transitionGameState(stateAtSituation, { type: "RECORD_DECISION", decision: keyDecision, keyDecisionSnapshot: snapshot }, deps);
    state = finishRemainingLoops(state, deps);
    state = transitionGameState(state, { type: "SET_FIVE_YEAR_LIFE", life: makeLifePath("original") }, deps);
    expect(GameStateSchema.safeParse(state).success).toBe(true);
    corrupt(state);
    expect(GameStateSchema.safeParse(state).success).toBe(false);
    expect(() => transitionGameState(state, { type: "OPEN_FORK" }, deps)).toThrowError(expect.objectContaining({ code: "INVALID_STATE" }));
    let raw: string | null = JSON.stringify(state);
    const storage = createGameStorage({ getItem: () => raw, setItem: () => undefined, removeItem: () => { raw = null; } });
    expect(storage.load()).toEqual({ status: "discarded", reason: "INVALID_SCHEMA" });
    expect(raw).toBeNull();
  });

  it("rejects a key Snapshot whose Intent differs from the confirmed Intent", () => {
    const { stateAtSituation, keyDecision, snapshot, deps } = makeStateAtKeyDecision();
    const mismatchedSnapshot = {
      ...snapshot,
      intent: { ...snapshot.intent, rawText: "这是另一个已确认意图。" },
    };

    expect(() =>
      transitionGameState(
        stateAtSituation,
        {
          type: "RECORD_DECISION",
          decision: keyDecision,
          keyDecisionSnapshot: mismatchedSnapshot,
        },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "KEY_SNAPSHOT_MISMATCH" }));
  });

  it("requires key Snapshot active Facts to exactly match the pre-decision state", () => {
    const { stateAtSituation, keyDecision, snapshot, deps } = makeStateAtKeyDecision();

    expect(() =>
      transitionGameState(
        stateAtSituation,
        {
          type: "RECORD_DECISION",
          decision: keyDecision,
          keyDecisionSnapshot: {
            ...snapshot,
            activeFactIds: [ids.fact],
          },
        },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_FACT_REFERENCE" }));
  });

  it("rejects a key Snapshot that omits an existing pre-decision Fact", () => {
    const { stateAtDecision, deps } = makeStateAtDecision();
    let state = transitionGameState(
      stateAtDecision,
      { type: "APPLY_OUTCOME", outcome: makeDistinctOutcome(0, stateAtDecision.decisions[0]!) },
      deps,
    );
    const situation = makeDistinctSituation(1, "MONTH_7", [state.facts[0]!.id]);
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0]!.id },
      deps,
    );
    const keyDecision = makeDistinctDecision(1, situation, true);

    expect(() =>
      transitionGameState(
        state,
        {
          type: "RECORD_DECISION",
          decision: keyDecision,
          keyDecisionSnapshot: { ...makeSnapshotFor(state, keyDecision), activeFactIds: [] },
        },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "KEY_SNAPSHOT_MISMATCH" }));
  });

  it("rejects Outcome Fact proposals that reference a Decision outside current history", () => {
    const { stateAtDecision, deps } = makeStateAtDecision();
    const validOutcome = makeDistinctOutcome(0, stateAtDecision.decisions[0]!);

    expect(() =>
      transitionGameState(
        stateAtDecision,
        {
          type: "APPLY_OUTCOME",
          outcome: {
            ...validOutcome,
            addedFacts: [
              {
                ...validOutcome.addedFacts[0]!,
                causedByDecisionIds: [ids.decision],
              },
            ],
          },
        },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_DECISION_REFERENCE" }));
  });

  it("rejects Outcome Fact proposals that depend on a Fact outside current state", () => {
    const { stateAtDecision, deps } = makeStateAtDecision();
    const validOutcome = makeDistinctOutcome(0, stateAtDecision.decisions[0]!);

    expect(() =>
      transitionGameState(
        stateAtDecision,
        {
          type: "APPLY_OUTCOME",
          outcome: {
            ...validOutcome,
            addedFacts: [
              {
                ...validOutcome.addedFacts[0]!,
                dependsOnFactIds: [ids.fact],
              },
            ],
          },
        },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_FACT_REFERENCE" }));
  });

  it("rejects a Fact kind forbidden by the current Situation without mutating state", () => {
    const { stateAtDecision, deps } = makeStateAtDecision();
    const forbiddenState = structuredClone(stateAtDecision);
    forbiddenState.situations[0]!.situation.forbiddenFactKinds = ["ACTIVITY"];
    const before = structuredClone(forbiddenState);
    let generatedIds = 0;

    expect(() => transitionGameState(
      forbiddenState,
      { type: "APPLY_OUTCOME", outcome: makeDistinctOutcome(0, forbiddenState.decisions[0]!) },
      { ...deps, createId: () => { generatedIds += 1; return loops[0]!.fact; } },
    )).toThrowError(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(generatedIds).toBe(0);
    expect(forbiddenState).toEqual(before);
  });

  it("rejects a Fact proposal that supersedes an unknown Fact without mutating state", () => {
    const { stateAtDecision, deps } = makeStateAtDecision();
    const proposal = makeDistinctOutcome(0, stateAtDecision.decisions[0]!);
    proposal.addedFacts[0]!.supersedesFactId = ids.fact;
    const before = structuredClone(stateAtDecision);
    let generatedIds = 0;

    expect(() => transitionGameState(
      stateAtDecision,
      { type: "APPLY_OUTCOME", outcome: proposal },
      { ...deps, createId: () => { generatedIds += 1; return loops[0]!.fact; } },
    )).toThrowError(expect.objectContaining({ code: "INVALID_FACT_REFERENCE" }));
    expect(generatedIds).toBe(0);
    expect(stateAtDecision).toEqual(before);
  });

  it.each([
    ["PLAYER_DECISION", { causedByDecisionIds: [] }],
    ["PRIOR_FACT", { causedByDecisionIds: [], dependsOnFactIds: [] }],
    ["EXTERNAL_EVENT", { causedByDecisionIds: [], externalEventId: undefined }],
    ["MIXED_CAUSE", { causedByDecisionIds: [loops[0]!.decision], dependsOnFactIds: [], externalEventId: undefined }],
  ] satisfies [
    ResolvedOutcome["addedFacts"][number]["causalReasons"][number],
    Partial<ResolvedOutcome["addedFacts"][number]>,
  ][])("rejects %s without its required causal evidence before creating Facts", (reason, evidence) => {
    const { stateAtDecision, deps } = makeStateAtDecision();
    const outcomeWithInvalidEvidence = makeDistinctOutcome(0, stateAtDecision.decisions[0]!);
    outcomeWithInvalidEvidence.addedFacts = [{
      ...outcomeWithInvalidEvidence.addedFacts[0]!,
      causalReasons: [reason],
      ...evidence,
    }];
    const before = structuredClone(stateAtDecision);
    let generatedIds = 0;

    expect(() => transitionGameState(
      stateAtDecision,
      { type: "APPLY_OUTCOME", outcome: outcomeWithInvalidEvidence },
      { ...deps, createId: () => { generatedIds += 1; return loops[0]!.fact; } },
    )).toThrowError(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(generatedIds).toBe(0);
    expect(stateAtDecision).toEqual(before);
  });

  it("accepts a mixed-cause Fact with two kinds of causal evidence", () => {
    const { stateAtDecision, deps } = makeStateAtDecision();
    const mixedOutcome = makeDistinctOutcome(0, stateAtDecision.decisions[0]!);
    mixedOutcome.addedFacts = [{
      ...mixedOutcome.addedFacts[0]!,
      causalReasons: ["MIXED_CAUSE"],
      externalEventId: "50000000-0000-4000-8000-000000000001",
    }];

    const next = transitionGameState(
      stateAtDecision,
      { type: "APPLY_OUTCOME", outcome: mixedOutcome },
      deps,
    );

    expect(next.facts[0]).toMatchObject({
      causalReasons: ["MIXED_CAUSE"],
      causedByDecisionIds: [loops[0]!.decision],
      externalEventId: "50000000-0000-4000-8000-000000000001",
    });
  });

  it("rejects generated Fact IDs that collide with existing Facts", () => {
    const { stateAtDecision, deps } = makeStateAtDecision();
    let state = transitionGameState(
      stateAtDecision,
      { type: "APPLY_OUTCOME", outcome: makeDistinctOutcome(0, stateAtDecision.decisions[0]!) },
      deps,
    );
    const situation = makeDistinctSituation(1, "MONTH_7", [state.facts[0]!.id]);
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0]!.id },
      deps,
    );
    state = transitionGameState(
      state,
      { type: "RECORD_DECISION", decision: makeDistinctDecision(1, situation) },
      deps,
    );

    expect(() =>
      transitionGameState(
        state,
        { type: "APPLY_OUTCOME", outcome: makeDistinctOutcome(1, state.decisions.at(-1)!) },
        { createId: () => state.facts[0]!.id, now: () => timestamp },
      ),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_ENTITY" }));
  });

  it("rejects duplicate generated Fact IDs within one Outcome", () => {
    const { stateAtDecision } = makeStateAtDecision();
    const validOutcome = makeDistinctOutcome(0, stateAtDecision.decisions[0]!);

    expect(() =>
      transitionGameState(
        stateAtDecision,
        {
          type: "APPLY_OUTCOME",
          outcome: {
            ...validOutcome,
            addedFacts: [validOutcome.addedFacts[0]!, validOutcome.addedFacts[0]!],
          },
        },
        { createId: () => loops[0]!.fact, now: () => timestamp },
      ),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE_ENTITY" }));
  });

  it("maps malformed runtime actions and generated initial state to stable state errors", () => {
    const deps = makeDeps();

    expect(() =>
      transitionGameState(createInitialGameState(deps), null as unknown as GameAction, deps),
    ).toThrowError(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(() =>
      createInitialGameState({ createId: () => "not-a-uuid", now: () => timestamp }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_STATE" }));
  });

  it("rejects an Outcome without authoritative Facts without changing state", () => {
    const { stateAtDecision, deps } = makeStateAtDecision();
    const before = structuredClone(stateAtDecision);

    expect(() =>
      transitionGameState(
        stateAtDecision,
        {
          type: "APPLY_OUTCOME",
          outcome: {
            ...makeDistinctOutcome(0, stateAtDecision.decisions[0]!),
            addedFacts: [],
          },
        },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_STATE" }));
    expect(stateAtDecision).toEqual(before);
  });

  it("does not append an invalid Outcome or partial Facts", () => {
    const { stateAtDecision, deps } = makeStateAtDecision();
    const before = structuredClone(stateAtDecision);
    expect(() =>
      transitionGameState(
        stateAtDecision,
        { type: "APPLY_OUTCOME", outcome: { ...outcome, addedFacts: [{ ...outcome.addedFacts[0]!, statement: "" }] } },
        deps,
      ),
    ).toThrow();
    expect(stateAtDecision).toEqual(before);
  });
});

import { describe, expect, it } from "vitest";

import type { Decision, Intent, ResolvedOutcome, Situation } from "@/contracts/game";
import { chapterRecaps, factsInSnapshot, forkPointAt, forkPoints, openingChoiceLine } from "@/game/flow";
import { buildKeyDecisionSnapshot } from "@/game/key-snapshot";
import { GameStateSchema } from "@/game-state/contracts";
import { createInitialGameState, transitionGameState, type EngineDependencies } from "@/game-state/engine";

/*
 * Rewinding any of the three turns. The engine keeps one pre-decision Snapshot
 * per Decision; these cover that they stay aligned with `decisions`, that each
 * one freezes only the Facts that existed before its turn, and that a save from
 * before the feature still loads with its single legacy fork point.
 */

const timestamp = "2026-09-12T12:00:00.000Z";
const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

function makeDeps(): EngineDependencies {
  let next = 100;
  return { createId: () => uuid((next += 1)), now: () => timestamp };
}

const intent: Intent = {
  rawText: "回家帮忙，同时尝试拍视频。",
  goals: ["帮助家庭经营"],
  priorities: ["家庭责任"],
  constraints: ["可支配时间有限"],
  currentActions: ["拍摄第一条视频"],
  confirmedAt: timestamp,
};

const CHAPTERS = ["DAY_8", "MONTH_7", "YEAR_4"] as const;
const LABELS = ["第 8 天", "第 7 个月", "第 4 年"] as const;
const ACTIONS = ["先沟通", "先自己做", "先放一放"] as const;

const situationFor = (loop: number, triggerFactIds: string[]): Situation => ({
  id: uuid(10 + loop),
  chapter: CHAPTERS[loop]!,
  timeLabel: LABELS[loop]!,
  triggerFactIds,
  forbiddenFactKinds: [],
  tensions: ["时间分配"],
  possibilities: [
    { id: uuid(20 + loop), kind: "MOMENTUM", title: "顺势发展的可能", summary: "有一点进展。" },
    { id: uuid(30 + loop), kind: "UNEXPECTED", title: "意料之外的变化", summary: "安排被打断。" },
  ],
  concreteContext: `第 ${loop + 1} 个情境。`,
  availableActions: [
    { id: uuid(40 + loop), kind: "PRESET", label: ACTIONS[loop]! },
    { id: uuid(50 + loop), kind: "PRESET", label: "换个做法" },
  ],
  externalConditions: [],
});

const decisionFor = (loop: number, situation: Situation): Decision => ({
  id: uuid(60 + loop),
  situationId: situation.id,
  selectedActionId: situation.availableActions[0]!.id,
  selectedActionKind: "PRESET",
  // The last turn stays the legacy key Decision; rewinding no longer depends on it.
  isKeyDecision: loop === 2,
  decidedAt: timestamp,
});

const outcomeFor = (loop: number, decision: Decision): ResolvedOutcome => ({
  id: uuid(70 + loop),
  decisionId: decision.id,
  narrative: `第 ${loop + 1} 次的结果。`,
  gains: ["有一点收获"],
  costs: ["花掉一些时间"],
  addedFacts: [
    {
      kind: "CREATION",
      statement: `第 ${loop + 1} 条视频完成了`,
      source: "GAME_SIMULATION",
      causalReasons: ["PLAYER_DECISION"],
      causedByDecisionIds: [decision.id],
      dependsOnFactIds: [],
    },
  ],
  unresolvedConsequences: [],
  validation: "ACCEPTED",
});

/** Plays three full loops the way the play page does: a Snapshot every turn. */
function playThreeLoops(options: { snapshotEveryTurn?: boolean } = {}) {
  const everyTurn = options.snapshotEveryTurn ?? true;
  const deps = makeDeps();
  let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
  for (let loop = 0; loop < 3; loop += 1) {
    const situation = situationFor(loop, state.facts.slice(-1).map(({ id }) => id));
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0]!.id },
      deps,
    );
    const decision = decisionFor(loop, situation);
    const snapshot = buildKeyDecisionSnapshot(state, decision.id, deps);
    state = transitionGameState(
      state,
      {
        type: "RECORD_DECISION",
        decision,
        keyDecisionSnapshot: decision.isKeyDecision ? snapshot : undefined,
        decisionSnapshot: everyTurn ? snapshot : undefined,
      },
      deps,
    );
    state = transitionGameState(state, { type: "APPLY_OUTCOME", outcome: outcomeFor(loop, decision) }, deps);
  }
  return { state, deps };
}

describe("rewinding any of the three turns", () => {
  it("captures one Snapshot per Decision, in order", () => {
    const { state } = playThreeLoops();
    expect(state.decisionSnapshots).toHaveLength(3);
    expect(state.decisionSnapshots.map(({ keyDecisionId }) => keyDecisionId)).toEqual(
      state.decisions.map(({ id }) => id),
    );
  });

  it("offers all three turns as fork points, not just the key one", () => {
    const { state } = playThreeLoops();
    const points = forkPoints(state);
    expect(points).toHaveLength(3);
    expect(points.map(({ situation }) => situation.timeLabel)).toEqual([...LABELS]);
    expect(points.map(({ label }) => label)).toEqual([...ACTIONS]);
    expect(points.filter(({ decision }) => decision.isKeyDecision)).toHaveLength(1);
  });

  it("freezes each turn against only the Facts that existed before it", () => {
    const { state } = playThreeLoops();
    const counts = forkPoints(state).map((point) => factsInSnapshot(state, point.snapshot).length);
    // Each loop adds exactly one Fact, so turn N sees N earlier Facts.
    expect(counts).toEqual([0, 1, 2]);
    expect(factsInSnapshot(state, forkPointAt(state, 1)!.snapshot).map(({ statement }) => statement)).toEqual([
      "第 1 条视频完成了",
    ]);
  });

  it("still reaches the comparison once a turn is rewound", () => {
    const { state } = playThreeLoops();
    expect(state.currentStage).toBe("LONG_TERM_READY");
    expect(GameStateSchema.safeParse(state).success).toBe(true);
  });

  it("refuses a Snapshot that does not belong to the Decision being recorded", () => {
    const deps = makeDeps();
    let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
    const situation = situationFor(0, []);
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0]!.id },
      deps,
    );
    const decision = decisionFor(0, situation);
    const forSomeoneElse = buildKeyDecisionSnapshot(state, uuid(999), deps);
    expect(() =>
      transitionGameState(state, { type: "RECORD_DECISION", decision, decisionSnapshot: forSomeoneElse }, deps),
    ).toThrowError(expect.objectContaining({ code: "KEY_SNAPSHOT_MISMATCH" }));
  });

  it("refuses to let the Snapshots fall out of step with the Decisions", () => {
    // Skipping turn 1's Snapshot and supplying turn 2's would misalign the array,
    // so a later rewind would restore the wrong turn.
    const deps = makeDeps();
    let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
    const first = situationFor(0, []);
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: first, selectedPossibilityId: first.possibilities[0]!.id },
      deps,
    );
    const firstDecision = decisionFor(0, first);
    state = transitionGameState(state, { type: "RECORD_DECISION", decision: firstDecision }, deps);
    state = transitionGameState(state, { type: "APPLY_OUTCOME", outcome: outcomeFor(0, firstDecision) }, deps);

    const second = situationFor(1, state.facts.slice(-1).map(({ id }) => id));
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: second, selectedPossibilityId: second.possibilities[0]!.id },
      deps,
    );
    const secondDecision = decisionFor(1, second);
    expect(() =>
      transitionGameState(
        state,
        {
          type: "RECORD_DECISION",
          decision: secondDecision,
          decisionSnapshot: buildKeyDecisionSnapshot(state, secondDecision.id, deps),
        },
        deps,
      ),
    ).toThrowError(expect.objectContaining({ code: "KEY_SNAPSHOT_MISMATCH" }));
  });

  it("will not let a later turn silently drop its Snapshot", () => {
    const deps = makeDeps();
    let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
    const first = situationFor(0, []);
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: first, selectedPossibilityId: first.possibilities[0]!.id },
      deps,
    );
    const firstDecision = decisionFor(0, first);
    state = transitionGameState(
      state,
      { type: "RECORD_DECISION", decision: firstDecision, decisionSnapshot: buildKeyDecisionSnapshot(state, firstDecision.id, deps) },
      deps,
    );
    state = transitionGameState(state, { type: "APPLY_OUTCOME", outcome: outcomeFor(0, firstDecision) }, deps);

    const second = situationFor(1, state.facts.slice(-1).map(({ id }) => id));
    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: second, selectedPossibilityId: second.possibilities[0]!.id },
      deps,
    );
    expect(() =>
      transitionGameState(state, { type: "RECORD_DECISION", decision: decisionFor(1, second) }, deps),
    ).toThrowError(expect.objectContaining({ code: "KEY_SNAPSHOT_REQUIRED" }));
  });
});

describe("saves written before rewinding was opened up", () => {
  it("loads, and offers the single legacy fork point", () => {
    const { state } = playThreeLoops({ snapshotEveryTurn: false });
    expect(state.decisionSnapshots).toEqual([]);

    // Exactly the shape such a save has on disk: no decisionSnapshots key at all.
    const legacy: Record<string, unknown> = { ...state };
    delete legacy.decisionSnapshots;
    const reloaded = GameStateSchema.parse(legacy);
    expect(reloaded.decisionSnapshots).toEqual([]);

    const points = forkPoints(reloaded);
    expect(points).toHaveLength(1);
    expect(points[0]!.decision.isKeyDecision).toBe(true);
    expect(points[0]!.situation.timeLabel).toBe("第 4 年");
  });
});

/*
 * Reading a stop again. The journey track is the only way back into what
 * already happened, so these cover that it offers exactly the stops the player
 * has reached, that each one carries that turn's own situation, choice and
 * outcome, and that an empty list never becomes an empty heading.
 */
describe("looking back at a stop on the track", () => {
  it("offers nothing before the player has written anything down", () => {
    const recaps = chapterRecaps(createInitialGameState(makeDeps()));
    expect(recaps).toHaveLength(6);
    expect(recaps.every((entry) => entry === null)).toBe(true);
  });

  it("opens the first stop as soon as the intent is confirmed, and no others", () => {
    const deps = makeDeps();
    const state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
    const recaps = chapterRecaps(state);
    expect(recaps.map((entry) => entry !== null)).toEqual([true, false, false, false, false, false]);
    expect(recaps[0]?.[0]).toEqual({ heading: "你当时写下的打算", lines: [intent.rawText] });
  });

  it("opens one stop per turn played, and leaves the two endings shut", () => {
    const { state } = playThreeLoops();
    expect(chapterRecaps(state).map((entry) => entry !== null)).toEqual([true, true, true, true, false, false]);
  });

  it("gives each stop its own turn, not the latest one", () => {
    const { state } = playThreeLoops();
    const recaps = chapterRecaps(state);
    for (const [offset, label] of [
      [0, "第 1 个情境。"],
      [1, "第 2 个情境。"],
      [2, "第 3 个情境。"],
    ] as const) {
      const sections = recaps[offset + 1];
      expect(sections?.find(({ heading }) => heading === "当时的处境")?.lines).toEqual([label]);
      expect(sections?.find(({ heading }) => heading === "你的选择")?.lines).toEqual([ACTIONS[offset]]);
      expect(sections?.find(({ heading }) => heading === "后来发生了")?.lines).toEqual([`第 ${offset + 1} 次的结果。`]);
    }
  });

  it("leaves out a heading rather than showing it empty", () => {
    const { state } = playThreeLoops();
    const headings = chapterRecaps(state)[1]?.map(({ heading }) => heading) ?? [];
    expect(headings).toContain("收获");
    expect(headings).toContain("代价");
    // The fixture resolves every turn with no unresolved consequences.
    expect(headings).not.toContain("仍然没有答案的部分");
  });

  it("never reports a section with no lines in it", () => {
    const { state } = playThreeLoops();
    for (const sections of chapterRecaps(state)) {
      for (const section of sections ?? []) expect(section.lines.length).toBeGreaterThan(0);
    }
  });
});

/*
 * The opening move is the one thing the player decides before the first chapter
 * exists, and it reaches the model through the same previousChoices list the
 * later chapters use. For DAY_8 that list is otherwise empty.
 */
describe("the opening move handed to the first chapter", () => {
  it("is written in the same shape as a later chapter's choice", () => {
    expect(openingChoiceLine("先拍一条试水视频发出去")).toBe("毕业后第一件事：先拍一条试水视频发出去");
  });

  it("trims what the player typed", () => {
    expect(openingChoiceLine("  先把店里的日常摸清楚  ")).toBe("毕业后第一件事：先把店里的日常摸清楚");
  });

  it("stays inside the 160-character field even when the player writes an essay", () => {
    const line = openingChoiceLine("拍视频".repeat(80));
    expect(line.length).toBeLessThanOrEqual(160);
  });

  it("returns nothing for blank input, so no empty line is sent", () => {
    expect(openingChoiceLine("   ")).toBe("");
    expect(openingChoiceLine("")).toBe("");
  });
});

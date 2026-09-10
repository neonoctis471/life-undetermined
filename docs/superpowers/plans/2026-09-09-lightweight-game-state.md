# Lightweight Game State and localStorage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser-owned, runtime-validated game state, deterministic transition engine, localStorage persistence, and framework-neutral store that later AI, Zhihu, and frontend work can safely consume.

**Architecture:** Keep runtime contracts under `src/game-state/contracts.ts`, pure transition rules under `src/game-state/engine.ts`, browser persistence behind a small `StorageLike` port, and orchestration in a framework-neutral store. The engine is the only unit allowed to turn an accepted Outcome into authoritative Facts; storage validates both writes and reads and never contains service credentials.

**Tech Stack:** TypeScript 6 strict mode, Zod 4, Vitest 4, browser localStorage through a dependency-injected `StorageLike` interface, existing Next.js 16 project and contracts.

## Global Constraints

- This batch makes no AI, Zhihu, database, Supabase, account, sharing, or network call.
- A run contains exactly three main Situation loops in this order: `DAY_8`, `MONTH_7`, `YEAR_4`.
- The first Situation may be caused by confirmed Intent without an existing Fact; later Situations require at least one valid Fact reference.
- The engine, not callers or an LLM, decides when proposed Facts become authoritative Facts.
- Existing Facts are append-only within this Demo; no transition deletes or edits a Fact.
- At most one Decision is marked key and it must capture the pre-decision Snapshot in the same transition.
- localStorage stores only game data under the fixed key `zhihu-five-years-game:v1`; it never stores API keys, provider credentials, prompts, or raw provider responses.
- Invalid, incompatible, or oversized local data is discarded without crashing the page; clearing affects only the fixed game key.
- The implementation remains framework-neutral: no React hook or visual component is part of this batch.
- Every task follows test-driven development and ends with an independent commit.

---

## File Structure

```text
src/game-state/
  contracts.ts   # Lightweight GameState, played situation, life path and comparison schemas
  errors.ts      # Stable transition/storage error codes
  engine.ts      # New-game factory and pure state transition function
  storage.ts     # Runtime-validated localStorage adapter
  store.ts       # In-memory current state + persistence + subscriptions
  index.ts       # Public exports
src/test/
  game-state-contracts.test.ts
  game-state-engine.test.ts
  game-state-storage.test.ts
  game-state-store.test.ts
```

Existing `src/contracts/game/*` remains the source for Intent, Fact, Situation, Decision, Outcome and Snapshot. `src/contracts/game/situation.ts` receives one narrow correction so a first Situation can legally be triggered by Intent before any Fact exists.

### Task 1: Lightweight State Contracts

**Files:**
- Create: `src/game-state/contracts.ts`
- Create: `src/test/game-state-contracts.test.ts`
- Modify: `src/contracts/game/situation.ts`
- Modify: `src/test/state-contracts.test.ts`

**Interfaces:**
- Consumes: `IntentSchema`, `FactSchema`, `SituationSchema`, `DecisionSchema`, `ResolvedOutcomeSchema`, `SnapshotSchema`, `GamePhaseSchema`, `IdSchema`, `ShortTextSchema`, `LongTextSchema`, `TimestampSchema`.
- Produces: `GAME_STATE_SCHEMA_VERSION`, `MAX_MAIN_SITUATIONS`, `PlayedSituationSchema`, `LifePathSchema`, `LifeComparisonSchema`, `GameStateSchema` and their inferred TypeScript types.

- [x] **Step 1: Change the Situation contract test to express the first-chapter exception**

Replace the existing `requires between one and sixteen causal trigger facts` test in `src/test/state-contracts.test.ts` with:

```ts
it("allows Intent to trigger DAY_8 but still caps causal trigger facts at sixteen", () => {
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
      { id: ids.action, kind: "PRESET", label: "先帮忙，关店以后再拍" },
    ],
    externalConditions: [],
  } as const;

  const maximumTriggerFacts = Array.from({ length: 16 }, (_, index) =>
    `${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
  );

  expect(SituationSchema.safeParse({ ...baseSituation, triggerFactIds: [] }).success).toBe(true);
  expect(
    SituationSchema.safeParse({ ...baseSituation, triggerFactIds: maximumTriggerFacts }).success,
  ).toBe(true);
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
```

- [x] **Step 2: Run the changed contract test and verify the new valid case fails**

Run:

```powershell
npm run test:run -- src/test/state-contracts.test.ts
```

Expected: FAIL because `SituationSchema` still requires at least one trigger Fact.

- [x] **Step 3: Allow zero structural trigger IDs in the base Situation schema**

In `src/contracts/game/situation.ts`, change only the trigger array declaration to:

```ts
triggerFactIds: z.array(IdSchema).max(16),
```

The semantic rule for later chapters belongs in the Game State Engine because it depends on chapter and current Facts.

- [x] **Step 4: Add failing lightweight GameState schema tests**

Create `src/test/game-state-contracts.test.ts`:

```ts
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

  it("rejects incompatible schema versions and unknown fields", () => {
    expect(GameStateSchema.safeParse({ ...emptyState, schemaVersion: 2 }).success).toBe(false);
    expect(GameStateSchema.safeParse({ ...emptyState, secret: "must-not-exist" }).success).toBe(false);
  });

  it("requires a played situation to select one of its own possibilities", () => {
    expect(
      PlayedSituationSchema.safeParse({ situation, selectedPossibilityId: ids.momentum }).success,
    ).toBe(true);
    expect(
      PlayedSituationSchema.safeParse({
        situation,
        selectedPossibilityId: "66666666-6666-4666-8666-666666666666",
      }).success,
    ).toBe(false);
  });

  it("accepts concise life paths and three-way comparisons", () => {
    expect(
      LifePathSchema.safeParse({
        timeline: [
          { label: "一年后", summary: "开始形成稳定节奏。" },
          { label: "五年后", summary: "仍在经营，也保留创作。" },
        ],
        currentState: "主要参与家庭经营，偶尔接拍摄。",
        reunionAnswer: "现在主要在家里的店，也会拍点东西。",
        commemorativeFacts: ["完成过多个作品"],
      }).success,
    ).toBe(true);
    expect(
      LifeComparisonSchema.safeParse({
        changedByDecision: ["作品数量"],
        unchanged: ["生活城市"],
        external: ["市场变化"],
      }).success,
    ).toBe(true);
  });
});
```

- [x] **Step 5: Run the new test and verify the missing module failure**

Run:

```powershell
npm run test:run -- src/test/game-state-contracts.test.ts
```

Expected: FAIL because `@/game-state/contracts` does not exist.

- [x] **Step 6: Implement the lightweight contracts**

Create `src/game-state/contracts.ts`:

```ts
import { z } from "zod";

import {
  DecisionSchema,
  FactSchema,
  GamePhaseSchema,
  IdSchema,
  IntentSchema,
  LongTextSchema,
  ResolvedOutcomeSchema,
  ShortTextSchema,
  SituationSchema,
  SnapshotSchema,
  TimestampSchema,
} from "@/contracts/game";

export const GAME_STATE_SCHEMA_VERSION = 1 as const;
export const MAX_MAIN_SITUATIONS = 3 as const;

export const PlayedSituationSchema = z
  .object({
    situation: SituationSchema,
    selectedPossibilityId: IdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.situation.possibilities.some(({ id }) => id === value.selectedPossibilityId)) {
      context.addIssue({
        code: "custom",
        path: ["selectedPossibilityId"],
        message: "selected possibility must belong to the situation",
      });
    }
  });

export const TimelinePointSchema = z
  .object({
    label: ShortTextSchema,
    summary: LongTextSchema,
  })
  .strict();

export const LifePathSchema = z
  .object({
    timeline: z.array(TimelinePointSchema).min(2).max(6),
    currentState: LongTextSchema,
    reunionAnswer: LongTextSchema,
    commemorativeFacts: z.array(ShortTextSchema).min(1).max(24),
  })
  .strict();

export const LifeComparisonSchema = z
  .object({
    changedByDecision: z.array(ShortTextSchema).max(16),
    unchanged: z.array(ShortTextSchema).max(16),
    external: z.array(ShortTextSchema).max(16),
  })
  .strict();

export const GameStateSchema = z
  .object({
    schemaVersion: z.literal(GAME_STATE_SCHEMA_VERSION),
    gameId: IdSchema,
    currentStage: GamePhaseSchema,
    intent: IntentSchema.nullable(),
    facts: z.array(FactSchema).max(256),
    situations: z.array(PlayedSituationSchema).max(MAX_MAIN_SITUATIONS),
    decisions: z.array(DecisionSchema).max(MAX_MAIN_SITUATIONS),
    outcomes: z.array(ResolvedOutcomeSchema).max(MAX_MAIN_SITUATIONS),
    keyDecisionSnapshot: SnapshotSchema.nullable(),
    fiveYearLife: LifePathSchema.nullable(),
    parallelLife: LifePathSchema.nullable(),
    comparison: LifeComparisonSchema.nullable(),
    updatedAt: TimestampSchema,
  })
  .strict();

export type PlayedSituation = z.infer<typeof PlayedSituationSchema>;
export type TimelinePoint = z.infer<typeof TimelinePointSchema>;
export type LifePath = z.infer<typeof LifePathSchema>;
export type LifeComparison = z.infer<typeof LifeComparisonSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
```

- [x] **Step 7: Verify contracts and commit**

Run:

```powershell
npm run test:run -- src/test/state-contracts.test.ts src/test/game-state-contracts.test.ts
npm run typecheck
```

Expected: both test files pass and TypeScript exits 0.

Commit:

```powershell
git add src/contracts/game/situation.ts src/game-state/contracts.ts src/test/state-contracts.test.ts src/test/game-state-contracts.test.ts
git commit -m "feat: add lightweight game state contracts"
```

### Task 2: Deterministic Game State Engine

**Files:**
- Create: `src/game-state/errors.ts`
- Create: `src/game-state/engine.ts`
- Create: `src/test/game-state-engine.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Intent`, `Situation`, `Decision`, `ResolvedOutcome`, `Snapshot`, `LifePath`, `LifeComparison`.
- Produces: `GameStateError`, `GameStateErrorCode`, `EngineDependencies`, `GameAction`, `createInitialGameState(deps)` and `transitionGameState(state, action, deps)`.

- [x] **Step 1: Write failing transition tests**

Create `src/test/game-state-engine.test.ts` with deterministic ID and time factories and the following cases:

```ts
import { describe, expect, it } from "vitest";

import type { Decision, Intent, ResolvedOutcome, Situation, Snapshot } from "@/contracts/game";
import { GameStateError } from "@/game-state/errors";
import {
  createInitialGameState,
  transitionGameState,
  type EngineDependencies,
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

    const confirmed = transitionGameState(created, { type: "CONFIRM_INTENT", intent }, deps);
    expect(() =>
      transitionGameState(
        confirmed,
        { type: "ADD_SITUATION", situation: makeSituation("MONTH_7", [ids.fact]), selectedPossibilityId: ids.momentum },
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
});
```

- [x] **Step 2: Run the engine test and verify missing-module failures**

Run:

```powershell
npm run test:run -- src/test/game-state-engine.test.ts
```

Expected: FAIL because `@/game-state/errors` and `@/game-state/engine` do not exist.

- [x] **Step 3: Add stable state error codes**

Create `src/game-state/errors.ts`:

```ts
export type GameStateErrorCode =
  | "INVALID_STATE"
  | "INVALID_STAGE"
  | "INVALID_CHAPTER"
  | "INVALID_FACT_REFERENCE"
  | "INVALID_SITUATION_REFERENCE"
  | "INVALID_ACTION_REFERENCE"
  | "INVALID_DECISION_REFERENCE"
  | "DUPLICATE_ENTITY"
  | "KEY_SNAPSHOT_REQUIRED"
  | "KEY_SNAPSHOT_MISMATCH"
  | "KEY_DECISION_ALREADY_EXISTS"
  | "FINAL_RESULT_MISSING";

export class GameStateError extends Error {
  constructor(
    public readonly code: GameStateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GameStateError";
  }
}
```

- [x] **Step 4: Implement the pure engine and complete the three-loop/final-stage tests**

Create `src/game-state/engine.ts`. Define these exact public action variants:

```ts
import type {
  Decision,
  Intent,
  ResolvedOutcome,
  Situation,
  Snapshot,
} from "@/contracts/game";
import {
  DecisionSchema,
  FactSchema,
  IntentSchema,
  ResolvedOutcomeSchema,
  SituationSchema,
  SnapshotSchema,
} from "@/contracts/game";

import {
  GAME_STATE_SCHEMA_VERSION,
  GameStateSchema,
  LifeComparisonSchema,
  LifePathSchema,
  MAX_MAIN_SITUATIONS,
  type GameState,
  type LifeComparison,
  type LifePath,
} from "./contracts";
import { GameStateError } from "./errors";

export interface EngineDependencies {
  createId(): string;
  now(): string;
}

export type GameAction =
  | { type: "CONFIRM_INTENT"; intent: Intent }
  | { type: "ADD_SITUATION"; situation: Situation; selectedPossibilityId: string }
  | { type: "RECORD_DECISION"; decision: Decision; keyDecisionSnapshot?: Snapshot }
  | { type: "APPLY_OUTCOME"; outcome: ResolvedOutcome }
  | { type: "SET_FIVE_YEAR_LIFE"; life: LifePath }
  | { type: "OPEN_FORK" }
  | { type: "SET_PARALLEL_LIFE"; life: LifePath }
  | { type: "SET_COMPARISON"; comparison: LifeComparison }
  | { type: "COMPLETE" };

const chapters = ["DAY_8", "MONTH_7", "YEAR_4"] as const;

export function createInitialGameState(deps: EngineDependencies): GameState {
  return GameStateSchema.parse({
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    gameId: deps.createId(),
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
    updatedAt: deps.now(),
  });
}

export function transitionGameState(
  input: GameState,
  action: GameAction,
  deps: EngineDependencies,
): GameState {
  const state = GameStateSchema.parse(input);
  const now = deps.now();

  switch (action.type) {
    case "CONFIRM_INTENT": {
      requireStage(state, ["CREATED"]);
      return parseNext({ ...state, intent: IntentSchema.parse(action.intent), currentStage: "INTENT_CONFIRMED", updatedAt: now });
    }
    case "ADD_SITUATION": {
      requireStage(state, ["INTENT_CONFIRMED", "OUTCOME_RESOLVED"]);
      if (state.situations.length >= MAX_MAIN_SITUATIONS) {
        throw new GameStateError("INVALID_STAGE", "all main situations already exist");
      }
      const situation = SituationSchema.parse(action.situation);
      if (situation.chapter !== chapters[state.outcomes.length]) {
        throw new GameStateError("INVALID_CHAPTER", "situation chapter is out of order");
      }
      if (situation.chapter !== "DAY_8" && situation.triggerFactIds.length === 0) {
        throw new GameStateError("INVALID_FACT_REFERENCE", "later situations require a trigger Fact");
      }
      const factIds = new Set(state.facts.map(({ id }) => id));
      if (situation.triggerFactIds.some((id) => !factIds.has(id))) {
        throw new GameStateError("INVALID_FACT_REFERENCE", "situation references an unknown Fact");
      }
      if (!situation.possibilities.some(({ id }) => id === action.selectedPossibilityId)) {
        throw new GameStateError("INVALID_SITUATION_REFERENCE", "selected possibility does not belong to situation");
      }
      assertUnique(state.situations.map(({ situation }) => situation.id), situation.id);
      return parseNext({
        ...state,
        situations: [...state.situations, { situation, selectedPossibilityId: action.selectedPossibilityId }],
        currentStage: "SITUATION_READY",
        updatedAt: now,
      });
    }
    case "RECORD_DECISION": {
      requireStage(state, ["SITUATION_READY"]);
      const decision = DecisionSchema.parse(action.decision);
      const latest = state.situations.at(-1)?.situation;
      if (!latest || decision.situationId !== latest.id) {
        throw new GameStateError("INVALID_SITUATION_REFERENCE", "Decision must reference the latest Situation");
      }
      const actionInSituation = latest.availableActions.find(({ id }) => id === decision.selectedActionId);
      if (!actionInSituation || actionInSituation.kind !== decision.selectedActionKind) {
        throw new GameStateError("INVALID_ACTION_REFERENCE", "Decision action is not available in the Situation");
      }
      assertUnique(state.decisions.map(({ id }) => id), decision.id);
      let keyDecisionSnapshot = state.keyDecisionSnapshot;
      if (decision.isKeyDecision) {
        if (keyDecisionSnapshot) {
          throw new GameStateError("KEY_DECISION_ALREADY_EXISTS", "only one key Decision is allowed");
        }
        if (!action.keyDecisionSnapshot) {
          throw new GameStateError("KEY_SNAPSHOT_REQUIRED", "key Decision requires a pre-decision Snapshot");
        }
        const snapshot = SnapshotSchema.parse(action.keyDecisionSnapshot);
        if (snapshot.gameId !== state.gameId || snapshot.keyDecisionId !== decision.id) {
          throw new GameStateError("KEY_SNAPSHOT_MISMATCH", "Snapshot does not match game and key Decision");
        }
        if (snapshot.activeFactIds.some((id) => !state.facts.some((fact) => fact.id === id))) {
          throw new GameStateError("INVALID_FACT_REFERENCE", "Snapshot references an unknown active Fact");
        }
        keyDecisionSnapshot = snapshot;
      } else if (action.keyDecisionSnapshot) {
        throw new GameStateError("KEY_SNAPSHOT_MISMATCH", "non-key Decision cannot capture a key Snapshot");
      }
      return parseNext({ ...state, decisions: [...state.decisions, decision], keyDecisionSnapshot, currentStage: "DECISION_RECORDED", updatedAt: now });
    }
    case "APPLY_OUTCOME": {
      requireStage(state, ["DECISION_RECORDED"]);
      const outcome = ResolvedOutcomeSchema.parse(action.outcome);
      const latestDecision = state.decisions.at(-1);
      if (!latestDecision || outcome.decisionId !== latestDecision.id) {
        throw new GameStateError("INVALID_DECISION_REFERENCE", "Outcome must reference the latest Decision");
      }
      assertUnique(state.outcomes.map(({ id }) => id), outcome.id);
      const addedFacts = outcome.addedFacts.map((proposal) =>
        FactSchema.parse({ ...proposal, id: deps.createId(), occurredAt: now }),
      );
      const currentStage = state.outcomes.length + 1 === MAX_MAIN_SITUATIONS ? "LONG_TERM_READY" : "OUTCOME_RESOLVED";
      return parseNext({ ...state, outcomes: [...state.outcomes, outcome], facts: [...state.facts, ...addedFacts], currentStage, updatedAt: now });
    }
    case "SET_FIVE_YEAR_LIFE":
      requireStage(state, ["LONG_TERM_READY"]);
      return parseNext({ ...state, fiveYearLife: LifePathSchema.parse(action.life), currentStage: "REUNION_READY", updatedAt: now });
    case "OPEN_FORK":
      requireStage(state, ["REUNION_READY"]);
      if (!state.keyDecisionSnapshot) throw new GameStateError("KEY_SNAPSHOT_REQUIRED", "parallel life requires a key Snapshot");
      return parseNext({ ...state, currentStage: "FORK_READY", updatedAt: now });
    case "SET_PARALLEL_LIFE":
      requireStage(state, ["FORK_READY"]);
      return parseNext({ ...state, parallelLife: LifePathSchema.parse(action.life), updatedAt: now });
    case "SET_COMPARISON":
      requireStage(state, ["FORK_READY"]);
      if (!state.parallelLife) throw new GameStateError("FINAL_RESULT_MISSING", "comparison requires a parallel life");
      return parseNext({ ...state, comparison: LifeComparisonSchema.parse(action.comparison), currentStage: "COMPARISON_READY", updatedAt: now });
    case "COMPLETE":
      requireStage(state, ["COMPARISON_READY"]);
      if (!state.fiveYearLife || !state.parallelLife || !state.comparison) {
        throw new GameStateError("FINAL_RESULT_MISSING", "completed game requires both lives and comparison");
      }
      return parseNext({ ...state, currentStage: "COMPLETED", updatedAt: now });
  }
}

function requireStage(state: GameState, allowed: GameState["currentStage"][]): void {
  if (!allowed.includes(state.currentStage)) {
    throw new GameStateError("INVALID_STAGE", `action is not allowed during ${state.currentStage}`);
  }
}

function assertUnique(existing: string[], next: string): void {
  if (existing.includes(next)) throw new GameStateError("DUPLICATE_ENTITY", `duplicate id: ${next}`);
}

function parseNext(value: unknown): GameState {
  const result = GameStateSchema.safeParse(value);
  if (!result.success) throw new GameStateError("INVALID_STATE", result.error.message);
  return result.data;
}
```

Add a table-driven test that uses three distinct UUID sets and the following exact transition/assertion structure. Each helper returns the same schema-valid shape already shown above, replacing only its IDs, chapter, trigger Fact IDs and text labels:

```ts
it("runs exactly three ordered loops without mutating prior states", () => {
  const deps = makeThreeLoopDeps();
  let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
  const originalConfirmed = structuredClone(state);

  for (const [index, chapter] of (["DAY_8", "MONTH_7", "YEAR_4"] as const).entries()) {
    const triggerFactIds = index === 0 ? [] : [state.facts.at(-1)!.id];
    const situation = makeDistinctSituation(index, chapter, triggerFactIds);
    const decision = makeDistinctDecision(index, situation);
    const outcome = makeDistinctOutcome(index, decision);

    state = transitionGameState(
      state,
      { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0].id },
      deps,
    );
    state = transitionGameState(state, { type: "RECORD_DECISION", decision }, deps);
    state = transitionGameState(state, { type: "APPLY_OUTCOME", outcome }, deps);
  }

  expect(state.situations.map(({ situation }) => situation.chapter)).toEqual(["DAY_8", "MONTH_7", "YEAR_4"]);
  expect(state.currentStage).toBe("LONG_TERM_READY");
  expect(state.facts).toHaveLength(3);
  expect(originalConfirmed).toEqual(expect.objectContaining({ facts: [], situations: [], decisions: [], outcomes: [] }));
  expect(() =>
    transitionGameState(
      state,
      { type: "ADD_SITUATION", situation: makeDistinctSituation(3, "YEAR_4", [state.facts[0]!.id]), selectedPossibilityId: state.situations[0]!.selectedPossibilityId },
      deps,
    ),
  ).toThrowError(expect.objectContaining({ code: "INVALID_STAGE" }));
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
```

Add these deterministic helpers directly above the three tests:

```ts
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

function makeStateAtKeyDecision() {
  const deps = makeThreeLoopDeps();
  let state = transitionGameState(createInitialGameState(deps), { type: "CONFIRM_INTENT", intent }, deps);
  const situation = makeDistinctSituation(0, "DAY_8", []);
  state = transitionGameState(
    state,
    { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0].id },
    deps,
  );
  const keyDecision = makeDistinctDecision(0, situation, true);
  const snapshot: Snapshot = {
    id: "40000000-0000-4000-8000-000000000001",
    gameId: state.gameId,
    branchId: "40000000-0000-4000-8000-000000000002",
    eventVersion: 0,
    intent,
    activeFactIds: [],
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
      { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0].id },
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
    { type: "ADD_SITUATION", situation, selectedPossibilityId: situation.possibilities[0].id },
    deps,
  );
  state = transitionGameState(state, { type: "RECORD_DECISION", decision: makeDistinctDecision(0, situation) }, deps);
  return { stateAtDecision: state, deps };
}
```

- [x] **Step 5: Run engine tests and commit**

Run:

```powershell
npm run test:run -- src/test/game-state-engine.test.ts
npm run typecheck
```

Expected: engine tests pass and TypeScript exits 0.

Commit:

```powershell
git add src/game-state/errors.ts src/game-state/engine.ts src/test/game-state-engine.test.ts
git commit -m "feat: add deterministic game state engine"
```

### Task 3: Runtime-Validated localStorage Adapter

**Files:**
- Create: `src/game-state/storage.ts`
- Create: `src/test/game-state-storage.test.ts`

**Interfaces:**
- Consumes: `GameState`, `GameStateSchema`.
- Produces: `GAME_STORAGE_KEY`, `MAX_GAME_STATE_BYTES`, `StorageLike`, `GameStorage`, `LoadGameResult`, `GameStorageError`, `createGameStorage(storage)`.

- [x] **Step 1: Write failing persistence tests**

Create `src/test/game-state-storage.test.ts` using this in-memory storage:

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { createInitialGameState } from "@/game-state/engine";
import {
  GAME_STORAGE_KEY,
  GameStorageError,
  createGameStorage,
  type StorageLike,
} from "@/game-state/storage";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const timestamp = "2026-09-09T12:00:00.000Z";
const gameId = "11111111-1111-4111-8111-111111111111";

describe("game localStorage adapter", () => {
  let browserStorage: MemoryStorage;

  beforeEach(() => { browserStorage = new MemoryStorage(); });

  it("saves and restores a runtime-validated GameState", () => {
    const storage = createGameStorage(browserStorage);
    const state = createInitialGameState({ createId: () => gameId, now: () => timestamp });

    storage.save(state);

    expect(storage.load()).toEqual({ status: "restored", state });
  });

  it("returns empty when the fixed key does not exist", () => {
    expect(createGameStorage(browserStorage).load()).toEqual({ status: "empty" });
  });

  it.each([
    ["INVALID_JSON", "{"],
    ["INVALID_SCHEMA", JSON.stringify({ schemaVersion: 999 })],
  ] as const)("discards %s data without touching other keys", (reason, raw) => {
    browserStorage.setItem(GAME_STORAGE_KEY, raw);
    browserStorage.setItem("another-app", "keep-me");

    expect(createGameStorage(browserStorage).load()).toEqual({ status: "discarded", reason });
    expect(browserStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(browserStorage.getItem("another-app")).toBe("keep-me");
  });

  it("clears only the game key", () => {
    browserStorage.setItem(GAME_STORAGE_KEY, "game");
    browserStorage.setItem("another-app", "keep-me");
    createGameStorage(browserStorage).clear();
    expect(browserStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(browserStorage.getItem("another-app")).toBe("keep-me");
  });

  it("rejects invalid writes and maps quota failures to a stable error", () => {
    const storage = createGameStorage(browserStorage);
    expect(() => storage.save({ schemaVersion: 999 } as never)).toThrow(GameStorageError);

    const quotaStorage: StorageLike = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => { throw new DOMException("full", "QuotaExceededError"); },
    };
    expect(() => createGameStorage(quotaStorage).save(
      createInitialGameState({ createId: () => gameId, now: () => timestamp }),
    )).toThrowError(expect.objectContaining({ code: "WRITE_FAILED" }));
  });
});
```

- [x] **Step 2: Run the storage test and verify the missing-module failure**

Run:

```powershell
npm run test:run -- src/test/game-state-storage.test.ts
```

Expected: FAIL because `@/game-state/storage` does not exist.

- [x] **Step 3: Implement the storage adapter**

Create `src/game-state/storage.ts`:

```ts
import { GameStateSchema, type GameState } from "./contracts";

export const GAME_STORAGE_KEY = "zhihu-five-years-game:v1";
export const MAX_GAME_STATE_BYTES = 1_000_000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadGameResult =
  | { status: "empty" }
  | { status: "restored"; state: GameState }
  | { status: "discarded"; reason: "INVALID_JSON" | "INVALID_SCHEMA" | "TOO_LARGE" };

export type GameStorageErrorCode = "INVALID_STATE" | "STATE_TOO_LARGE" | "READ_FAILED" | "WRITE_FAILED";

export class GameStorageError extends Error {
  constructor(public readonly code: GameStorageErrorCode, message: string) {
    super(message);
    this.name = "GameStorageError";
  }
}

export interface GameStorage {
  load(): LoadGameResult;
  save(state: GameState): void;
  clear(): void;
}

export function createGameStorage(
  storage: StorageLike,
  options: { maxBytes?: number } = {},
): GameStorage {
  const maxBytes = options.maxBytes ?? MAX_GAME_STATE_BYTES;
  return {
    load() {
      let raw: string | null;
      try {
        raw = storage.getItem(GAME_STORAGE_KEY);
      } catch {
        throw new GameStorageError("READ_FAILED", "unable to read local game state");
      }
      if (raw === null) return { status: "empty" };
      if (new TextEncoder().encode(raw).byteLength > maxBytes) {
        storage.removeItem(GAME_STORAGE_KEY);
        return { status: "discarded", reason: "TOO_LARGE" };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        storage.removeItem(GAME_STORAGE_KEY);
        return { status: "discarded", reason: "INVALID_JSON" };
      }
      const result = GameStateSchema.safeParse(parsed);
      if (!result.success) {
        storage.removeItem(GAME_STORAGE_KEY);
        return { status: "discarded", reason: "INVALID_SCHEMA" };
      }
      return { status: "restored", state: result.data };
    },
    save(state) {
      const result = GameStateSchema.safeParse(state);
      if (!result.success) throw new GameStorageError("INVALID_STATE", "refusing to save invalid game state");
      const raw = JSON.stringify(result.data);
      if (new TextEncoder().encode(raw).byteLength > maxBytes) {
        throw new GameStorageError("STATE_TOO_LARGE", "local game state exceeds one megabyte");
      }
      try {
        storage.setItem(GAME_STORAGE_KEY, raw);
      } catch {
        throw new GameStorageError("WRITE_FAILED", "unable to save local game state");
      }
    },
    clear() {
      storage.removeItem(GAME_STORAGE_KEY);
    },
  };
}
```

Add these exact tests below the existing storage tests:

```ts
it("discards oversized stored data", () => {
  browserStorage.setItem(GAME_STORAGE_KEY, "x".repeat(33));
  expect(createGameStorage(browserStorage, { maxBytes: 32 }).load()).toEqual({
    status: "discarded",
    reason: "TOO_LARGE",
  });
  expect(browserStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
});

it("refuses to write a valid state above the configured byte cap", () => {
  const state = createInitialGameState({ createId: () => gameId, now: () => timestamp });
  expect(() => createGameStorage(browserStorage, { maxBytes: 8 }).save(state)).toThrowError(
    expect.objectContaining({ code: "STATE_TOO_LARGE" }),
  );
});

it("maps browser read failures without deleting unrelated data", () => {
  const failingStorage: StorageLike = {
    getItem: () => { throw new DOMException("blocked", "SecurityError"); },
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  expect(() => createGameStorage(failingStorage).load()).toThrowError(
    expect.objectContaining({ code: "READ_FAILED" }),
  );
});
```

- [x] **Step 4: Verify storage and commit**

Run:

```powershell
npm run test:run -- src/test/game-state-storage.test.ts
npm run typecheck
```

Expected: storage tests pass and TypeScript exits 0.

Commit:

```powershell
git add src/game-state/storage.ts src/test/game-state-storage.test.ts
git commit -m "feat: persist validated game state locally"
```

### Task 4: Framework-Neutral Persistent Store

**Files:**
- Create: `src/game-state/store.ts`
- Create: `src/game-state/index.ts`
- Create: `src/test/game-state-store.test.ts`

**Interfaces:**
- Consumes: `GameStorage`, `EngineDependencies`, `GameAction`, `GameState`, `createInitialGameState`, `transitionGameState`.
- Produces: `GameStateStore`, `RestoreStatus`, `createGameStateStore(options)` and the stable public exports from `src/game-state/index.ts`.

- [x] **Step 1: Write failing store integration tests**

Create `src/test/game-state-store.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { Intent } from "@/contracts/game";
import { createGameStateStore } from "@/game-state/store";
import type { GameStorage } from "@/game-state/storage";

const timestamp = "2026-09-09T12:00:00.000Z";
const gameIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];
const intent: Intent = {
  rawText: "先回家帮忙。",
  goals: ["帮助家庭"],
  priorities: ["家庭责任"],
  constraints: [],
  currentActions: ["回家"],
  confirmedAt: timestamp,
};

function memoryGameStorage(): GameStorage & { saved: unknown[]; cleared: number } {
  let stored: ReturnType<GameStorage["load"]> = { status: "empty" };
  return {
    saved: [],
    cleared: 0,
    load: () => stored,
    save(state) {
      this.saved.push(state);
      stored = { status: "restored", state };
    },
    clear() {
      this.cleared += 1;
      stored = { status: "empty" };
    },
  };
}

describe("persistent game state store", () => {
  it("creates and saves a new game when no save exists", () => {
    const storage = memoryGameStorage();
    const store = createGameStateStore({
      storage,
      engine: { createId: () => gameIds[0], now: () => timestamp },
    });

    expect(store.restoreStatus).toBe("created");
    expect(store.getState().gameId).toBe(gameIds[0]);
    expect(storage.saved).toHaveLength(1);
  });

  it("dispatches through the engine, saves once and notifies subscribers", () => {
    const storage = memoryGameStorage();
    const store = createGameStateStore({ storage, engine: { createId: () => gameIds[0], now: () => timestamp } });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    const next = store.dispatch({ type: "CONFIRM_INTENT", intent });

    expect(next.currentStage).toBe("INTENT_CONFIRMED");
    expect(storage.saved).toHaveLength(2);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    store.reset();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("restores an existing game without replacing it", () => {
    const storage = memoryGameStorage();
    const first = createGameStateStore({ storage, engine: { createId: () => gameIds[0], now: () => timestamp } });
    first.dispatch({ type: "CONFIRM_INTENT", intent });
    const restored = createGameStateStore({ storage, engine: { createId: () => gameIds[1], now: () => timestamp } });

    expect(restored.restoreStatus).toBe("restored");
    expect(restored.getState().gameId).toBe(gameIds[0]);
    expect(restored.getState().currentStage).toBe("INTENT_CONFIRMED");
  });

  it("resets only the game save and immediately persists a fresh game", () => {
    const storage = memoryGameStorage();
    let index = 0;
    const store = createGameStateStore({ storage, engine: { createId: () => gameIds[index++]!, now: () => timestamp } });

    const fresh = store.reset();

    expect(storage.cleared).toBe(1);
    expect(fresh.gameId).toBe(gameIds[1]);
    expect(fresh.currentStage).toBe("CREATED");
  });
});
```

- [x] **Step 2: Run the store test and verify the missing-module failure**

Run:

```powershell
npm run test:run -- src/test/game-state-store.test.ts
```

Expected: FAIL because `@/game-state/store` does not exist.

- [x] **Step 3: Implement the store**

Create `src/game-state/store.ts`:

```ts
import type { GameState } from "./contracts";
import {
  createInitialGameState,
  transitionGameState,
  type EngineDependencies,
  type GameAction,
} from "./engine";
import type { GameStorage } from "./storage";

export type RestoreStatus = "created" | "restored" | "discarded";
export type GameStateListener = (state: GameState) => void;

export interface GameStateStore {
  readonly restoreStatus: RestoreStatus;
  getState(): GameState;
  dispatch(action: GameAction): GameState;
  reset(): GameState;
  subscribe(listener: GameStateListener): () => void;
}

export function createGameStateStore(options: {
  storage: GameStorage;
  engine: EngineDependencies;
}): GameStateStore {
  const loaded = options.storage.load();
  let restoreStatus: RestoreStatus = loaded.status === "restored" ? "restored" : loaded.status === "discarded" ? "discarded" : "created";
  let state = loaded.status === "restored" ? loaded.state : createInitialGameState(options.engine);
  const listeners = new Set<GameStateListener>();

  if (loaded.status !== "restored") options.storage.save(state);

  const publish = () => listeners.forEach((listener) => listener(state));

  return {
    get restoreStatus() { return restoreStatus; },
    getState: () => state,
    dispatch(action) {
      const next = transitionGameState(state, action, options.engine);
      options.storage.save(next);
      state = next;
      publish();
      return state;
    },
    reset() {
      options.storage.clear();
      state = createInitialGameState(options.engine);
      restoreStatus = "created";
      options.storage.save(state);
      publish();
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

Important atomicity rule: assign `state = next` only after `storage.save(next)` succeeds. Add a test whose `save` throws and assert that `getState()` still returns the pre-dispatch state and listeners were not notified.

- [x] **Step 4: Export the supported public surface**

Create `src/game-state/index.ts`:

```ts
export * from "./contracts";
export * from "./engine";
export * from "./errors";
export * from "./storage";
export * from "./store";
```

- [x] **Step 5: Verify store integration and commit**

Run:

```powershell
npm run test:run -- src/test/game-state-store.test.ts
npm run typecheck
```

Expected: store tests pass and TypeScript exits 0.

Commit:

```powershell
git add src/game-state/store.ts src/game-state/index.ts src/test/game-state-store.test.ts
git commit -m "feat: add persistent game state store"
```

### Task 5: First-Batch Acceptance and Documentation

**Files:**
- Modify: `docs/superpowers/plans/2026-09-09-lightweight-game-state.md`

**Interfaces:**
- Consumes: all contracts, engine, storage and store behavior from Tasks 1–4.
- Produces: verified first-batch completion evidence and a clean branch ready for the AI Adapter plan.

- [x] **Step 1: Run focused behavior tests**

Run:

```powershell
npm run test:run -- src/test/game-state-contracts.test.ts src/test/game-state-engine.test.ts src/test/game-state-storage.test.ts src/test/game-state-store.test.ts
```

Expected: all four focused test files pass with no network calls.

- [x] **Step 2: Run the complete quality suite**

Run:

```powershell
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

Expected: all commands exit 0; coverage includes `src/game-state`; Next.js production build succeeds.

- [x] **Step 3: Verify security and repository scope**

Run:

```powershell
git check-ignore .secrets/zhihu-access-secret.dpapi .secrets/openai-next-api-key.dpapi
rg -l --glob '!.secrets/**' --glob '!*.dpapi' '(?i)sk-[a-z0-9]{20,}|\b[a-f0-9]{40}\b' .
rg -n 'localStorage|StorageLike|GAME_STORAGE_KEY' src/game-state src/test
git diff --check
git status --short
```

Expected:

- both encrypted credential files are ignored;
- secret scan prints no project file;
- localStorage appears only behind `StorageLike` and its tests;
- `git diff --check` prints nothing;
- status contains only intended first-batch changes and the plan completion edit.

- [x] **Step 4: Record exact verification evidence in this plan**

Change completed checkboxes to `- [x]` and append a `## Verification Record` section containing each command, exit code, test count and build result. Do not copy secrets, environment values, full prompts or provider responses.

- [x] **Step 5: Commit acceptance evidence**

Run:

```powershell
git add docs/superpowers/plans/2026-09-09-lightweight-game-state.md
git commit -m "docs: record lightweight game state completion"
git status --short
git log --oneline -7
```

Expected: working tree is clean and the contract, engine, storage, store and acceptance commits are visible.

## Verification Record

- `npm run test:run -- src/test/game-state-contracts.test.ts src/test/game-state-engine.test.ts src/test/game-state-storage.test.ts src/test/game-state-store.test.ts` — exit 0; 4 files and 40 tests passed.
- `npm run lint` — exit 0; ESLint completed with no reported errors.
- `npm run typecheck` — exit 0; TypeScript completed with no reported errors.
- `npm run test:coverage` — exit 0; 9 files and 86 tests passed. Overall coverage: 95.31% statements, 90.08% branches, 98% functions, and 96.5% lines; `src/game-state` is included (94% statements).
- `npm run build` — exit 0; Next.js production build compiled successfully and generated the `/_not-found` and `/api/v1/health` routes.
- `git check-ignore .secrets/zhihu-access-secret.dpapi .secrets/openai-next-api-key.dpapi` — exit 0; both encrypted credential paths are ignored.
- `rg -l --glob '!.secrets/**' --glob '!*.dpapi' '(?i)sk-[a-z0-9]{20,}|\\b[a-f0-9]{40}\\b' .` — exit 1; no matching project files were found.
- `rg -n 'localStorage|StorageLike|GAME_STORAGE_KEY' src/game-state src/test` — exit 0; storage access is limited to `src/game-state/storage.ts` through `StorageLike` and its tests.
- `git diff --check` — exit 0; no whitespace errors after restoring build-generated configuration edits.
- `git status --short` — exit 0; before the acceptance commit, only the completed plan and task acceptance report are intended documentation changes; a final clean status is recorded after committing.

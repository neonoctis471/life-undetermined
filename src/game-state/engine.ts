import type {
  Decision,
  Intent,
  ResolvedOutcome,
  Situation,
  Snapshot,
} from "@/contracts/game";
import type { ZodType } from "zod";
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
  return parseNext({
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
  const state = parseInput(GameStateSchema, input, "game state");
  const runtimeAction = action as { type?: unknown } | null;
  if (!runtimeAction || typeof runtimeAction !== "object" || typeof runtimeAction.type !== "string") {
    throw new GameStateError("INVALID_STATE", "game action failed schema validation");
  }
  const now = deps.now();

  switch (action.type) {
    case "CONFIRM_INTENT": {
      requireStage(state, ["CREATED"]);
      return parseNext({ ...state, intent: parseInput(IntentSchema, action.intent, "Intent"), currentStage: "INTENT_CONFIRMED", updatedAt: now });
    }
    case "ADD_SITUATION": {
      requireStage(state, ["INTENT_CONFIRMED", "OUTCOME_RESOLVED"]);
      if (state.situations.length >= MAX_MAIN_SITUATIONS) {
        throw new GameStateError("INVALID_STAGE", "all main situations already exist");
      }
      const situation = parseInput(SituationSchema, action.situation, "Situation");
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
      const decision = parseInput(DecisionSchema, action.decision, "Decision");
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
        const snapshot = parseInput(SnapshotSchema, action.keyDecisionSnapshot, "Snapshot");
        if (
          snapshot.gameId !== state.gameId ||
          snapshot.keyDecisionId !== decision.id ||
          !sameIntent(snapshot.intent, state.intent)
        ) {
          throw new GameStateError("KEY_SNAPSHOT_MISMATCH", "Snapshot does not match game and key Decision");
        }
        if (snapshot.activeFactIds.some((id) => !state.facts.some((fact) => fact.id === id))) {
          throw new GameStateError("INVALID_FACT_REFERENCE", "Snapshot references an unknown active Fact");
        }
        if (!sameStringArray(snapshot.activeFactIds, state.facts.map(({ id }) => id))) {
          throw new GameStateError("KEY_SNAPSHOT_MISMATCH", "Snapshot active Facts do not match the pre-decision state");
        }
        keyDecisionSnapshot = snapshot;
      } else if (action.keyDecisionSnapshot) {
        throw new GameStateError("KEY_SNAPSHOT_MISMATCH", "non-key Decision cannot capture a key Snapshot");
      }
      return parseNext({ ...state, decisions: [...state.decisions, decision], keyDecisionSnapshot, currentStage: "DECISION_RECORDED", updatedAt: now });
    }
    case "APPLY_OUTCOME": {
      requireStage(state, ["DECISION_RECORDED"]);
      const outcome = parseInput(ResolvedOutcomeSchema, action.outcome, "ResolvedOutcome");
      if (outcome.addedFacts.length === 0) {
        throw new GameStateError("INVALID_STATE", "Outcome must add an authoritative Fact");
      }
      const latestDecision = state.decisions.at(-1);
      if (!latestDecision || outcome.decisionId !== latestDecision.id) {
        throw new GameStateError("INVALID_DECISION_REFERENCE", "Outcome must reference the latest Decision");
      }
      assertUnique(state.outcomes.map(({ id }) => id), outcome.id);
      const decisionIds = new Set(state.decisions.map(({ id }) => id));
      const factIds = new Set(state.facts.map(({ id }) => id));
      for (const proposal of outcome.addedFacts) {
        if (proposal.causedByDecisionIds.some((id) => !decisionIds.has(id))) {
          throw new GameStateError("INVALID_DECISION_REFERENCE", "Fact proposal references an unknown Decision");
        }
        if (proposal.dependsOnFactIds.some((id) => !factIds.has(id))) {
          throw new GameStateError("INVALID_FACT_REFERENCE", "Fact proposal references an unknown Fact");
        }
      }
      const generatedFactIds = new Set(factIds);
      const addedFacts = outcome.addedFacts.map((proposal) => {
        const id = deps.createId();
        if (generatedFactIds.has(id)) {
          throw new GameStateError("DUPLICATE_ENTITY", "generated Fact id already exists");
        }
        generatedFactIds.add(id);
        return parseInput(FactSchema, { ...proposal, id, occurredAt: now }, "generated Fact");
      });
      const currentStage = state.outcomes.length + 1 === MAX_MAIN_SITUATIONS ? "LONG_TERM_READY" : "OUTCOME_RESOLVED";
      return parseNext({ ...state, outcomes: [...state.outcomes, outcome], facts: [...state.facts, ...addedFacts], currentStage, updatedAt: now });
    }
    case "SET_FIVE_YEAR_LIFE":
      requireStage(state, ["LONG_TERM_READY"]);
      return parseNext({ ...state, fiveYearLife: parseInput(LifePathSchema, action.life, "five-year LifePath"), currentStage: "REUNION_READY", updatedAt: now });
    case "OPEN_FORK":
      requireStage(state, ["REUNION_READY"]);
      if (!state.keyDecisionSnapshot) throw new GameStateError("KEY_SNAPSHOT_REQUIRED", "parallel life requires a key Snapshot");
      return parseNext({ ...state, currentStage: "FORK_READY", updatedAt: now });
    case "SET_PARALLEL_LIFE":
      requireStage(state, ["FORK_READY"]);
      return parseNext({ ...state, parallelLife: parseInput(LifePathSchema, action.life, "parallel LifePath"), updatedAt: now });
    case "SET_COMPARISON":
      requireStage(state, ["FORK_READY"]);
      if (!state.parallelLife) throw new GameStateError("FINAL_RESULT_MISSING", "comparison requires a parallel life");
      return parseNext({ ...state, comparison: parseInput(LifeComparisonSchema, action.comparison, "LifeComparison"), currentStage: "COMPARISON_READY", updatedAt: now });
    case "COMPLETE":
      requireStage(state, ["COMPARISON_READY"]);
      if (!state.fiveYearLife || !state.parallelLife || !state.comparison) {
        throw new GameStateError("FINAL_RESULT_MISSING", "completed game requires both lives and comparison");
      }
      return parseNext({ ...state, currentStage: "COMPLETED", updatedAt: now });
    default: {
      const exhaustiveAction: never = action;
      const actionType = (exhaustiveAction as { type?: unknown }).type;
      throw new GameStateError("INVALID_STATE", `unknown game action: ${String(actionType)}`);
    }
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
  if (!result.success) throw new GameStateError("INVALID_STATE", "resulting game state failed schema validation");
  return result.data;
}

function parseInput<T>(schema: ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new GameStateError("INVALID_STATE", `${label} failed schema validation`);
  }
  return result.data;
}

function sameIntent(left: Intent, right: Intent | null): boolean {
  return (
    right !== null &&
    left.rawText === right.rawText &&
    left.confirmedAt === right.confirmedAt &&
    sameStringArray(left.goals, right.goals) &&
    sameStringArray(left.priorities, right.priorities) &&
    sameStringArray(left.constraints, right.constraints) &&
    sameStringArray(left.currentActions, right.currentActions)
  );
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

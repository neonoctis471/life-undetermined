import type { ChoiceSummary, IntentCandidate, MainChapter } from "@/ai/contracts";
import type { Action, Decision, Fact, Intent, Situation, Snapshot } from "@/contracts/game";
import type { GameState } from "@/game-state";

import { describeDecisionAction } from "./labels";

/* Application-layer helpers shared by the play page; the engine stays the authority. */

export const MAIN_CHAPTERS: readonly MainChapter[] = ["DAY_8", "MONTH_7", "YEAR_4"];

const clip = (text: string, maxLength: number) => (text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text);

export function toIntentCandidate(intent: Intent): IntentCandidate {
  return {
    rawText: intent.rawText,
    goals: intent.goals,
    priorities: intent.priorities,
    constraints: intent.constraints,
    currentActions: intent.currentActions,
  };
}

/** The chapter the next Situation must belong to, or null after three Outcomes. */
export function nextChapter(state: GameState): MainChapter | null {
  return MAIN_CHAPTERS[state.outcomes.length] ?? null;
}

function situationOf(state: GameState, decision: Decision): Situation | undefined {
  return state.situations.find((played) => played.situation.id === decision.situationId)?.situation;
}

/** Short "when: what I chose" lines for prompts. */
export function previousChoices(state: GameState): string[] {
  return state.decisions.slice(-3).map((decision) => {
    const situation = situationOf(state, decision);
    return clip(situation ? `${situation.timeLabel}：${describeDecisionAction(decision, situation)}` : "之前的一个决定", 150);
  });
}

/** YEAR_4 carries the key Decision unless an earlier Decision already does. */
export function isKeyDecisionTurn(state: GameState, situation: Situation): boolean {
  return situation.chapter === "YEAR_4" && state.keyDecisionSnapshot === null;
}

export function buildDecision(input: {
  id: string;
  decidedAt: string;
  situation: Situation;
  action: Action;
  customAction?: string;
  isKeyDecision: boolean;
}): Decision {
  const base = {
    id: input.id,
    situationId: input.situation.id,
    selectedActionId: input.action.id,
    isKeyDecision: input.isKeyDecision,
    decidedAt: input.decidedAt,
  };
  return input.action.kind === "CUSTOM_PLACEHOLDER"
    ? { ...base, selectedActionKind: "CUSTOM_PLACEHOLDER", customAction: (input.customAction ?? "").trim() }
    : { ...base, selectedActionKind: "PRESET" };
}

export interface KeyDecisionContext {
  decision: Decision;
  situation: Situation;
  label: string;
}

export function keyDecisionContext(state: GameState): KeyDecisionContext | null {
  const decision = state.decisions.find(({ isKeyDecision }) => isKeyDecision);
  const situation = decision ? situationOf(state, decision) : undefined;
  return decision && situation ? { decision, situation, label: describeDecisionAction(decision, situation) } : null;
}

function summarize(decision: Decision, situation: Situation): ChoiceSummary {
  return {
    timeLabel: situation.timeLabel,
    situation: clip(situation.concreteContext, 600),
    action: clip(describeDecisionAction(decision, situation), 400),
    isKeyDecision: decision.isKeyDecision,
  };
}

/** Prompt-only summaries of the three Decisions for SIMULATE_LIFE(FIVE_YEARS). */
export function choiceSummaries(state: GameState): ChoiceSummary[] {
  return state.decisions.flatMap((decision) => {
    const situation = situationOf(state, decision);
    return situation ? [summarize(decision, situation)] : [];
  });
}

export function keyChoiceSummary(state: GameState): ChoiceSummary | null {
  const key = keyDecisionContext(state);
  return key ? summarize(key.decision, key.situation) : null;
}

/** The Facts active before the key Decision, in the Snapshot's order. */
export function snapshotFacts(state: GameState): Fact[] {
  return factsInSnapshot(state, state.keyDecisionSnapshot);
}

/** The Facts a given Snapshot froze, in GameState order. */
export function factsInSnapshot(state: GameState, snapshot: Snapshot | null): Fact[] {
  const active = new Set(snapshot?.activeFactIds ?? []);
  return state.facts.filter(({ id }) => active.has(id));
}

/** One Decision the player may rewind to, with everything a counterfactual needs. */
export interface ForkPoint {
  index: number;
  decision: Decision;
  situation: Situation;
  label: string;
  snapshot: Snapshot;
}

/*
 * Every Decision that carries a pre-decision Snapshot can be rewound. Saves
 * written before per-Decision Snapshots existed only have the single legacy
 * key Snapshot, so those games still offer exactly one fork point.
 */
export function forkPoints(state: GameState): ForkPoint[] {
  const points = state.decisions.flatMap<ForkPoint>((decision, index) => {
    const situation = situationOf(state, decision);
    const snapshot =
      state.decisionSnapshots[index] ??
      (decision.isKeyDecision && state.keyDecisionSnapshot?.keyDecisionId === decision.id
        ? state.keyDecisionSnapshot
        : null);
    return situation && snapshot
      ? [{ index, decision, situation, label: describeDecisionAction(decision, situation), snapshot }]
      : [];
  });
  return points;
}

export function forkPointAt(state: GameState, index: number): ForkPoint | null {
  return forkPoints(state).find((point) => point.index === index) ?? null;
}

/** The summary of the Decision being replaced; it is the key choice of this rewind. */
export function forkChoiceSummary(point: ForkPoint): ChoiceSummary {
  return { ...summarize(point.decision, point.situation), isKeyDecision: true };
}

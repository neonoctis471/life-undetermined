import type { IntentCandidate, MainChapter } from "@/ai/contracts";
import type { Action, Decision, Intent, Situation } from "@/contracts/game";
import type { GameState } from "@/game-state";

import { describeDecisionAction } from "./labels";

/* Application-layer helpers shared by the play page; the engine stays the authority. */

export const MAIN_CHAPTERS: readonly MainChapter[] = ["DAY_8", "MONTH_7", "YEAR_4"];

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

/** Short "when: what I chose" lines for prompts. */
export function previousChoices(state: GameState): string[] {
  return state.decisions.slice(-3).map((decision) => {
    const situation = state.situations.find((played) => played.situation.id === decision.situationId)?.situation;
    const label = situation ? `${situation.timeLabel}：${describeDecisionAction(decision, situation)}` : "之前的一个决定";
    return label.length > 150 ? `${label.slice(0, 149)}…` : label;
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

import type { Decision, Situation } from "@/contracts/game";

/** The text of what the player actually chose: a preset label or their own words. */
export function describeDecisionAction(decision: Decision, situation: Situation): string {
  if (decision.selectedActionKind === "CUSTOM_PLACEHOLDER") return decision.customAction;
  return situation.availableActions.find(({ id }) => id === decision.selectedActionId)?.label ?? "按自己的判断行动";
}

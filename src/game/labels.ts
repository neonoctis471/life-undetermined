import type { Decision, ReflectionKind, Situation } from "@/contracts/game";

/**
 * Headings for what an experience left behind. Deliberately plain nouns — these
 * name a kind of trace, not an achievement, and must never read as a reward.
 */
export const REFLECTION_LABELS: Record<ReflectionKind, string> = {
  METHOD: "处理事情的方式",
  PERSPECTIVE: "新的视角",
  SELF_KNOWLEDGE: "对自己的了解",
  RELATIONSHIP: "人际与沟通",
  REALITY: "现实经验",
  RESOURCE: "资源与机会",
  COST: "付出的代价",
  EXPOSED: "暴露出的问题",
  FIRST_TIME: "第一次",
};

/** The text of what the player actually chose: a preset label or their own words. */
export function describeDecisionAction(decision: Decision, situation: Situation): string {
  if (decision.selectedActionKind === "CUSTOM_PLACEHOLDER") return decision.customAction;
  return situation.availableActions.find(({ id }) => id === decision.selectedActionId)?.label ?? "按自己的判断行动";
}

/**
 * Zhihu's own way of writing a vote count: plain up to ten thousand, then 万
 * to one decimal. The exact figure past that point tells the reader nothing —
 * what matters is the order of magnitude.
 */
export function formatVoteCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0";
  const whole = Math.floor(count);
  if (whole < 10_000) return String(whole);
  const wan = whole / 10_000;
  // 12.0 万 reads as a rounding artefact; 12 万 is what a reader expects.
  return `${wan.toFixed(1).replace(/\.0$/, "")} 万`;
}

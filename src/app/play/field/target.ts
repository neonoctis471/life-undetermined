import type { GameState } from "@/game-state";

/*
 * The line field is the player's life drawn on a five-year axis. Everything
 * left of "now" has happened and collapses into one line; everything right of
 * it is still undetermined and fans out. This pure function derives the
 * field's target shape from GameState plus a few transient UI facts; the
 * engine only animates towards it.
 */

/** +1 = upper bundle (顺势发展), -1 = lower bundle (意料之外). */
export type Side = -1 | 0 | 1;

export type FieldWait = "none" | "understanding" | "situation" | "outcome" | "five-years" | "rewind";

export interface FieldUi {
  /** The opening screen: no plan yet, the whole field is undetermined. */
  heroOpen: boolean;
  /** The AI understanding is on screen, waiting for confirmation. */
  understood: boolean;
  /** The next chapter's possibilities are on screen (after reading an Outcome). */
  viewingNextChapter: boolean;
  possibilitiesReady: boolean;
  hovered: Side;
  wait: FieldWait;
}

export interface FactMark {
  u: number;
}

export interface FieldTarget {
  layout: "hero" | "story";
  /** Position of the present on the axis (0..1). */
  now: number;
  /** While waiting, the present drifts towards this position without reaching it. */
  creep: number;
  /** 0 = shapeless (no present yet), 1 = past collapsed and future fanned. */
  pinch: number;
  /** Width of the undetermined future. Narrows as Facts accumulate. */
  spread: number;
  /** 0..1 split of the future into the two possibility bundles. */
  split: number;
  emphasis: Side;
  chosen: Side;
  facts: FactMark[];
  /** The solid point of the key decision, once it exists. */
  keyU: number | null;
  /** 0..1 the future re-opening from the key point into two bundles. */
  fork: number;
  /** 0..1 the two bundles collapsing into two lines (black and green). */
  duel: number;
  /** Flow speed and turbulence; higher while time is passing. */
  energy: number;
}

/** Positions on the axis: the early chapters get room, the years after the key point too. */
export const TIMELINE = {
  start: 0.03,
  DAY_8: 0.1,
  MONTH_7: 0.32,
  year1: 0.4,
  year3: 0.55,
  YEAR_4: 0.62,
  year5: 0.88,
} as const;

const CHAPTER_U: Record<string, number> = {
  DAY_8: TIMELINE.DAY_8,
  MONTH_7: TIMELINE.MONTH_7,
  YEAR_4: TIMELINE.YEAR_4,
};
const CHAPTER_ORDER = [TIMELINE.DAY_8, TIMELINE.MONTH_7, TIMELINE.YEAR_4];
const FACTS_FOR_NARROWEST_FUTURE = 12;

function factMarks(state: GameState): FactMark[] {
  const marks: FactMark[] = [];
  state.outcomes.forEach((outcome, index) => {
    const chapter = state.situations[index]?.situation.chapter;
    const base = (chapter && CHAPTER_U[chapter]) ?? TIMELINE.start;
    outcome.addedFacts.forEach((_fact, order) => marks.push({ u: base + 0.013 * (order + 1) }));
  });
  return marks;
}

function latestSide(state: GameState): Side {
  const played = state.situations.at(-1);
  const kind = played?.situation.possibilities.find(({ id }) => id === played.selectedPossibilityId)?.kind;
  return kind === "MOMENTUM" ? 1 : kind === "UNEXPECTED" ? -1 : 0;
}

export function deriveFieldTarget(state: GameState, ui: FieldUi): FieldTarget {
  const settled = Math.min(state.facts.length / FACTS_FOR_NARROWEST_FUTURE, 1);
  const base: FieldTarget = {
    layout: "story",
    now: TIMELINE.start,
    creep: TIMELINE.start,
    pinch: 1,
    spread: 0.95 - 0.5 * settled,
    split: 0,
    emphasis: 0,
    chosen: 0,
    facts: factMarks(state),
    keyU: state.keyDecisionSnapshot ? TIMELINE.YEAR_4 : null,
    fork: 0,
    duel: 0,
    energy: 0.35,
  };
  const at = (now: number, extra: Partial<FieldTarget> = {}): FieldTarget => ({ ...base, now, creep: now, ...extra });
  const chapter = state.situations.at(-1)?.situation.chapter;
  const chapterU = (chapter && CHAPTER_U[chapter]) ?? TIMELINE.start;
  const side = latestSide(state);

  switch (state.currentStage) {
    case "CREATED":
      if (ui.heroOpen) return at(0, { layout: "hero", pinch: 0, spread: 1, facts: [], energy: 0.5 });
      return at(TIMELINE.start, {
        pinch: ui.understood ? 0.6 : 0.2,
        spread: 1,
        facts: [],
        energy: ui.wait === "understanding" ? 0.95 : 0.5,
      });
    case "INTENT_CONFIRMED":
      return at(TIMELINE.DAY_8, {
        split: ui.possibilitiesReady ? 1 : 0.2,
        emphasis: ui.hovered,
        energy: ui.wait === "situation" ? 0.9 : 0.4,
      });
    case "SITUATION_READY":
      return at(chapterU, { split: 1, emphasis: side, chosen: side });
    case "DECISION_RECORDED":
      // Time passes while the Outcome is being written.
      return { ...at(chapterU, { split: 0.5, emphasis: side, chosen: side, energy: 0.95 }), creep: chapterU + 0.03 };
    case "OUTCOME_RESOLVED": {
      const nextU = CHAPTER_ORDER[state.outcomes.length] ?? TIMELINE.YEAR_4;
      const after = chapterU + 0.03;
      if (!ui.viewingNextChapter) return at(after);
      if (!ui.possibilitiesReady) return { ...at(after, { energy: 0.9 }), creep: nextU };
      return at(nextU, { split: 1, emphasis: ui.hovered });
    }
    case "LONG_TERM_READY":
      if (ui.wait === "five-years") return { ...at(TIMELINE.YEAR_4 + 0.03, { energy: 0.95 }), creep: TIMELINE.year5 };
      return at(TIMELINE.YEAR_4 + 0.03);
    case "REUNION_READY":
      return at(TIMELINE.year5, { spread: 0.22 });
    case "FORK_READY":
      // Back to the key point: the future re-opens from there, in two bundles.
      return at(TIMELINE.YEAR_4, { fork: 1, spread: 0.9, energy: ui.wait === "rewind" ? 0.95 : 0.45 });
    case "COMPARISON_READY":
    case "COMPLETED":
      return at(TIMELINE.year5, { fork: 1, duel: 1, spread: 0.7, energy: 0.25 });
  }
}

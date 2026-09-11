import type { ZodType } from "zod";

import {
  FactKindSchema,
  ResolvedOutcomeSchema,
  type Action,
  type CausalReason,
  type Fact,
  type FactKind,
  type FactProposal,
  type Possibility,
  type ResolvedOutcome,
  type Situation,
} from "@/contracts/game";
import type { TimelinePoint } from "@/game-state/contracts";

import {
  AiDraftFactSchema,
  AiDraftIntentSchema,
  AiDraftLifeSchema,
  AiDraftOutcomeSchema,
  AiDraftSituationSchema,
  AiDraftTimelinePointSchema,
  SimulateLifeResultSchema,
  SituationCandidateSchema,
  UnderstandIntentResultSchema,
  type LifeSimulationMode,
  type MainChapter,
  type SimulateLifeResult,
  type SituationCandidate,
  type UnderstandIntentResult,
} from "./contracts";

/*
 * normalize() turns a loose model draft into a candidate that passes the strict
 * domain schemas. It injects every authoritative field (ids, fixed titles, time
 * labels, trigger Fact ids, causal evidence) and repairs arrays instead of
 * rejecting the draft.
 */

export class AiNormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNormalizeError";
  }
}

export interface NormalizeDependencies {
  createId(): string;
}

export const CHAPTER_TIME_LABELS: Record<MainChapter, string> = {
  DAY_8: "毕业后的第 8 天",
  MONTH_7: "毕业后的第 7 个月",
  YEAR_4: "毕业后的第 4 年",
};

export const POSSIBILITY_TITLES = {
  MOMENTUM: "顺势发展的可能",
  UNEXPECTED: "意料之外的变化",
} as const;

export const CUSTOM_ACTION_LABEL = "我有自己的办法";
export const MAX_PRESET_ACTIONS = 4;
export const MAX_OUTCOME_FACTS = 4;
export const MAX_TIMELINE_POINTS = 6;
export const MAX_COMMEMORATIVE_FACTS = 24;
const MIN_TIMELINE_POINTS = 2;
const MAX_COMPARISON_ITEMS = 8;
const MAX_TRIGGER_FACTS = 4;
const MAX_FACT_DEPENDENCIES = 8;

const LIMITS = {
  listItem: 40,
  action: 30,
  condition: 60,
  summary: 600,
  scene: 1_200,
  narrative: 1_200,
  factStatement: 120,
  timelineLabel: 40,
  timelineSummary: 500,
  lifeState: 800,
  reunion: 300,
  memory: 60,
} as const;

const DEFAULT_GOAL = "按自己的节奏开始毕业后的生活";
const DEFAULT_PRIORITY = "弄清自己真正想要什么";
const DEFAULT_CURRENT_ACTION = "把计划里的第一步具体安排下来";

const DEFAULT_TENSIONS: Record<MainChapter, string> = {
  DAY_8: "新计划和日常安排争夺时间",
  MONTH_7: "已经开始的事需要更多投入",
  YEAR_4: "几年的积累逼近一个取舍",
};

const DEFAULT_POSSIBILITY_SUMMARIES = {
  MOMENTUM: "事情沿着你的打算往前走了一步，也开始向你要更多的时间和精力。",
  UNEXPECTED: "生活没有完全按计划走，一个计划之外的变化打乱了原来的安排。",
} as const;

const DEFAULT_PRESET_ACTIONS = ["先处理眼前最急的事", "停下来和身边的人商量", "按原计划继续，接受一些代价"];

const DEFAULT_TIMELINE_LABELS: Record<LifeSimulationMode, string[]> = {
  FIVE_YEARS: ["第一年", "第二年", "第三年", "第四年", "第五年"],
  COUNTERFACTUAL: ["一个月以后", "一年以后", "三年以后", "五年以后"],
};

const DEFAULT_CURRENT_STATE = "五年过去了，生活还在按自己的节奏往前走。";

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

export interface IntentContext {
  rawText: string;
  selectedPlans: readonly string[];
}

export function normalizeIntentDraft(raw: unknown, context: IntentContext): UnderstandIntentResult {
  const draft = parseDraft(AiDraftIntentSchema, raw);
  const plans = cleanList(context.selectedPlans, { maxItems: 3, maxLength: LIMITS.listItem });

  const goals = orDefault(cleanList(draft.goals, { maxItems: 6, maxLength: LIMITS.listItem }), plans.length ? plans : [DEFAULT_GOAL]);
  const priorities = orDefault(cleanList(draft.priorities, { maxItems: 6, maxLength: LIMITS.listItem }), [DEFAULT_PRIORITY]);
  const constraints = cleanList(draft.constraints, { maxItems: 6, maxLength: LIMITS.listItem });
  const currentActions = orDefault(
    cleanList(draft.currentActions, { maxItems: 4, maxLength: LIMITS.listItem }),
    [DEFAULT_CURRENT_ACTION],
  );
  const summary =
    cleanText(draft.summary, LIMITS.summary) ?? `你打算${goals.join("，")}。眼下最先要做的是：${currentActions[0]}。`;

  return finalGate(
    UnderstandIntentResultSchema,
    { summary, intent: { rawText: context.rawText, goals, priorities, constraints, currentActions } },
    "Intent",
  );
}

// ---------------------------------------------------------------------------
// Situation
// ---------------------------------------------------------------------------

export interface SituationContext {
  chapter: MainChapter;
  /** Facts in authoritative order; prompt index n refers to facts[n - 1]. */
  facts: readonly Pick<Fact, "id">[];
}

export function normalizeSituationDraft(
  raw: unknown,
  context: SituationContext,
  deps: NormalizeDependencies,
): SituationCandidate {
  const draft = parseDraft(AiDraftSituationSchema, raw);
  const momentum = draft.momentum ?? {};
  const unexpected = draft.unexpected ?? {};

  const triggerFactIds = resolveTriggerFactIds(draft.triggerFactIndexes ?? [], context);
  const tensions = orDefault(cleanList(draft.tensions, { maxItems: 3, maxLength: LIMITS.listItem }), [
    DEFAULT_TENSIONS[context.chapter],
  ]);
  const externalConditions = cleanList(draft.externalConditions, { maxItems: 3, maxLength: LIMITS.condition });

  const situationId = deps.createId();
  const possibilities: Possibility[] = [
    {
      id: deps.createId(),
      kind: "MOMENTUM",
      title: POSSIBILITY_TITLES.MOMENTUM,
      summary: cleanText(momentum.summary, LIMITS.summary) ?? DEFAULT_POSSIBILITY_SUMMARIES.MOMENTUM,
    },
    {
      id: deps.createId(),
      kind: "UNEXPECTED",
      title: POSSIBILITY_TITLES.UNEXPECTED,
      summary: cleanText(unexpected.summary, LIMITS.summary) ?? DEFAULT_POSSIBILITY_SUMMARIES.UNEXPECTED,
    },
  ];

  const buildVariant = (
    branch: { summary?: string; scene?: string; actions?: string[]; externalConditions?: string[] },
    fallbackContext: string,
  ): Situation => ({
    id: situationId,
    chapter: context.chapter,
    timeLabel: CHAPTER_TIME_LABELS[context.chapter],
    triggerFactIds: [...triggerFactIds],
    // v1 never lets the model forbid Fact kinds; a later Outcome would be rejected.
    forbiddenFactKinds: [],
    tensions: [...tensions],
    possibilities: possibilities.map((possibility) => ({ ...possibility })),
    concreteContext: cleanText(branch.scene, LIMITS.scene) ?? cleanText(branch.summary, LIMITS.scene) ?? fallbackContext,
    availableActions: buildActions(branch.actions ?? [], deps),
    externalConditions: orDefault(
      cleanList(branch.externalConditions, { maxItems: 3, maxLength: LIMITS.condition }),
      externalConditions,
    ),
  });

  return finalGate(
    SituationCandidateSchema,
    {
      chapter: context.chapter,
      possibilities,
      variants: {
        MOMENTUM: buildVariant(momentum, possibilities[0]!.summary),
        UNEXPECTED: buildVariant(unexpected, possibilities[1]!.summary),
      },
    },
    "Situation",
  );
}

/**
 * Maps 1-based prompt indexes back to real Fact ids. DAY_8 never has triggers;
 * later chapters drop out-of-range indexes and fall back to the latest Fact so
 * the engine's "later Situation needs a trigger Fact" rule always holds.
 */
export function resolveTriggerFactIds(indexes: readonly number[], context: SituationContext): string[] {
  if (context.chapter === "DAY_8") return [];
  const ids = mapFactIndexes(indexes, context.facts, MAX_TRIGGER_FACTS);
  if (ids.length === 0) {
    const latest = context.facts.at(-1);
    if (!latest) throw new AiNormalizeError("later chapters require at least one prior Fact");
    ids.push(latest.id);
  }
  return ids;
}

function buildActions(labels: readonly string[], deps: NormalizeDependencies): Action[] {
  const presets = orDefault(
    cleanList(labels, { maxItems: MAX_PRESET_ACTIONS, maxLength: LIMITS.action, exclude: isCustomActionLabel }),
    DEFAULT_PRESET_ACTIONS,
  );
  return [
    ...presets.map((label) => ({ id: deps.createId(), kind: "PRESET" as const, label })),
    { id: deps.createId(), kind: "CUSTOM_PLACEHOLDER" as const, label: CUSTOM_ACTION_LABEL },
  ];
}

const isCustomActionLabel = (label: string) => /自己的办法|自己的方式|自定义|^其他/.test(label);

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

export interface OutcomeContext {
  decisionId: string;
  /** Facts in authoritative order before this Outcome; index n refers to facts[n - 1]. */
  facts: readonly Pick<Fact, "id">[];
  actionLabel: string;
  /** Set by the server, never by the model. */
  validation: "ACCEPTED" | "FALLBACK";
}

type CausalEvidence = Pick<FactProposal, "causalReasons" | "causedByDecisionIds" | "dependsOnFactIds">;

export function normalizeOutcomeDraft(
  raw: unknown,
  context: OutcomeContext,
  deps: NormalizeDependencies,
): ResolvedOutcome {
  const draft = parseDraft(AiDraftOutcomeSchema, raw);
  const actionLabel = cleanText(context.actionLabel, LIMITS.action) ?? "这个决定";
  const narrative =
    cleanText(draft.narrative, LIMITS.narrative) ?? `你决定「${actionLabel}」，并照着这个决定做了下去。`;

  const addedFacts: FactProposal[] = [];
  for (const item of draft.facts ?? []) {
    const fact = normalizeFactDraft(item, context);
    if (fact && !addedFacts.some(({ statement }) => statement === fact.statement)) addedFacts.push(fact);
    if (addedFacts.length >= MAX_OUTCOME_FACTS) break;
  }
  if (addedFacts.length === 0) {
    // The engine rejects an Outcome without an authoritative Fact.
    addedFacts.push({
      kind: "ACTIVITY",
      statement: firstSentence(narrative) ?? `按「${actionLabel}」处理了这件事`,
      source: "GAME_SIMULATION",
      ...resolveCausalEvidence([], [], context),
    });
  }

  return finalGate(
    ResolvedOutcomeSchema,
    {
      id: deps.createId(),
      decisionId: context.decisionId,
      narrative,
      gains: cleanList(draft.gains, { maxItems: 4, maxLength: LIMITS.listItem }),
      costs: cleanList(draft.costs, { maxItems: 4, maxLength: LIMITS.listItem }),
      addedFacts,
      unresolvedConsequences: cleanList(draft.unresolvedConsequences, { maxItems: 3, maxLength: LIMITS.listItem }),
      validation: context.validation,
    },
    "Outcome",
  );
}

function normalizeFactDraft(item: unknown, context: OutcomeContext): FactProposal | null {
  const candidate = typeof item === "string" ? { statement: item } : item;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const parsed = AiDraftFactSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const statement = cleanText(parsed.data.statement, LIMITS.factStatement);
  if (!statement) return null;
  return {
    kind: normalizeFactKind(parsed.data.kind),
    statement,
    // Outcome Facts are always game simulation; Zhihu content never becomes a Fact.
    source: "GAME_SIMULATION",
    ...resolveCausalEvidence(parsed.data.causalReasons ?? [], parsed.data.dependsOnFactIndexes ?? [], context),
  };
}

/**
 * Keeps only causal claims the server can back with evidence, mirroring the
 * engine's validateCausalEvidence:
 * - PLAYER_DECISION → the current Decision id is attached;
 * - PRIOR_FACT      → kept only if an index maps to an existing Fact;
 * - EXTERNAL_EVENT  → always dropped (models never supply an externalEventId);
 * - MIXED_CAUSE     → kept only with Decision + prior Fact evidence, else degraded;
 * - nothing left    → PLAYER_DECISION.
 */
export function resolveCausalEvidence(
  rawReasons: readonly string[],
  factIndexes: readonly number[],
  context: Pick<OutcomeContext, "decisionId" | "facts">,
): CausalEvidence {
  const requested = new Set(rawReasons.map((reason) => reason.trim().toUpperCase()));
  const priorFactIds = mapFactIndexes(factIndexes, context.facts, MAX_FACT_DEPENDENCIES);
  const reasons: CausalReason[] = [];
  if (requested.has("PLAYER_DECISION")) reasons.push("PLAYER_DECISION");
  if (requested.has("PRIOR_FACT") && priorFactIds.length > 0) reasons.push("PRIOR_FACT");
  if (requested.has("MIXED_CAUSE")) {
    if (priorFactIds.length > 0) reasons.push("MIXED_CAUSE");
    else if (!reasons.includes("PLAYER_DECISION")) reasons.push("PLAYER_DECISION");
  }
  if (reasons.length === 0) reasons.push("PLAYER_DECISION");

  const usesDecision = reasons.includes("PLAYER_DECISION") || reasons.includes("MIXED_CAUSE");
  const usesPriorFacts = reasons.includes("PRIOR_FACT") || reasons.includes("MIXED_CAUSE");
  return {
    causalReasons: reasons,
    causedByDecisionIds: usesDecision ? [context.decisionId] : [],
    dependsOnFactIds: usesPriorFacts ? priorFactIds : [],
  };
}

function normalizeFactKind(value: string | undefined): FactKind {
  const parsed = FactKindSchema.safeParse(value?.trim().toUpperCase());
  return parsed.success ? parsed.data : "ACTIVITY";
}

function firstSentence(text: string): string | undefined {
  const sentence = text.split(/[。！？!?\n]/).find((part) => part.trim().length > 0);
  return cleanText(sentence, 60);
}

// ---------------------------------------------------------------------------
// Life (FIVE_YEARS and COUNTERFACTUAL share one normalizer)
// ---------------------------------------------------------------------------

export interface LifeContext {
  mode: LifeSimulationMode;
  /** Facts the simulation starts from, used only for fallbacks. */
  facts: readonly Pick<Fact, "statement">[];
}

/** Truncates by count and by character length, pads the timeline to 2 points. */
export function normalizeLifeDraft(raw: unknown, context: LifeContext): SimulateLifeResult {
  const draft = parseDraft(AiDraftLifeSchema, raw);
  const labels = DEFAULT_TIMELINE_LABELS[context.mode];

  const timeline: TimelinePoint[] = [];
  for (const item of draft.timeline ?? []) {
    const point = normalizeTimelinePoint(item, labels[timeline.length] ?? `第 ${timeline.length + 1} 段`);
    if (point) timeline.push(point);
    if (timeline.length >= MAX_TIMELINE_POINTS) break;
  }
  const currentState = cleanText(draft.currentState, LIMITS.lifeState) ?? timeline.at(-1)?.summary ?? DEFAULT_CURRENT_STATE;
  if (timeline.length === 0) timeline.push({ label: labels[0]!, summary: summarizeFacts(context.facts) });
  if (timeline.length < MIN_TIMELINE_POINTS) timeline.push({ label: labels.at(-1)!, summary: truncate(currentState, LIMITS.timelineSummary) });

  const reunionAnswer = cleanText(draft.reunionAnswer, LIMITS.reunion) ?? truncate(currentState, LIMITS.reunion);
  const commemorativeFacts = orDefault(
    cleanList(draft.commemorativeFacts, { maxItems: MAX_COMMEMORATIVE_FACTS, maxLength: LIMITS.memory }),
    fallbackMemories(context.facts, timeline),
  );
  const comparisonList = (values: readonly string[] | undefined) =>
    cleanList(values, { maxItems: MAX_COMPARISON_ITEMS, maxLength: LIMITS.memory });
  const comparison =
    context.mode === "COUNTERFACTUAL"
      ? {
          changedByDecision: comparisonList(draft.comparison?.changedByDecision),
          unchanged: comparisonList(draft.comparison?.unchanged),
          external: comparisonList(draft.comparison?.external),
        }
      : null;

  return finalGate(
    SimulateLifeResultSchema,
    { mode: context.mode, life: { timeline, currentState, reunionAnswer, commemorativeFacts }, comparison },
    "LifePath",
  );
}

function normalizeTimelinePoint(item: unknown, fallbackLabel: string): TimelinePoint | null {
  if (typeof item === "string") {
    const summary = cleanText(item, LIMITS.timelineSummary);
    return summary ? { label: fallbackLabel, summary } : null;
  }
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const parsed = AiDraftTimelinePointSchema.safeParse(item);
  if (!parsed.success) return null;
  const point = parsed.data;
  const summary = cleanText(point.summary ?? point.text ?? point.content ?? point.description, LIMITS.timelineSummary);
  if (!summary) return null;
  return { label: cleanText(point.label ?? point.time ?? point.year, LIMITS.timelineLabel) ?? fallbackLabel, summary };
}

function summarizeFacts(facts: readonly Pick<Fact, "statement">[]): string {
  return cleanText(facts.slice(0, 3).map(({ statement }) => statement).join("；"), LIMITS.timelineSummary)
    ?? "日子一天天过去，事情慢慢有了形状。";
}

function fallbackMemories(facts: readonly Pick<Fact, "statement">[], timeline: readonly TimelinePoint[]): string[] {
  const fromFacts = cleanList(facts.map(({ statement }) => statement), { maxItems: MAX_COMMEMORATIVE_FACTS, maxLength: LIMITS.memory });
  if (fromFacts.length > 0) return fromFacts;
  return cleanList(timeline.map(({ label, summary }) => `${label}：${summary}`), { maxItems: MAX_COMMEMORATIVE_FACTS, maxLength: LIMITS.memory });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** 1-based prompt indexes → Fact ids; out-of-range, non-integer and duplicate indexes are dropped. */
function mapFactIndexes(indexes: readonly number[], facts: readonly Pick<Fact, "id">[], max: number): string[] {
  const ids: string[] = [];
  for (const index of indexes) {
    const fact = Number.isInteger(index) && index >= 1 ? facts[index - 1] : undefined;
    if (fact && !ids.includes(fact.id)) ids.push(fact.id);
    if (ids.length >= max) break;
  }
  return ids;
}

export function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return undefined;
  return truncate(text, maxLength);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  let cut = text.slice(0, maxLength - 1);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

const LIST_MARKER = /^\s*(?:[-*•·]\s*|\d{1,2}[.、)）:：](?!\d)\s*|[A-Ea-e][.、)）:：]\s*)/;

function cleanList(
  values: readonly string[] | undefined,
  options: { maxItems: number; maxLength: number; exclude?: (item: string) => boolean },
): string[] {
  const result: string[] = [];
  for (const value of values ?? []) {
    const text = cleanText(typeof value === "string" ? value.replace(LIST_MARKER, "") : value, options.maxLength);
    if (!text || result.includes(text) || options.exclude?.(text)) continue;
    result.push(text);
    if (result.length >= options.maxItems) break;
  }
  return result;
}

function orDefault(values: string[], fallback: readonly string[]): string[] {
  return values.length > 0 ? values : [...fallback];
}

function parseDraft<T>(schema: ZodType<T>, raw: unknown): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AiNormalizeError("model output is not a JSON object");
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new AiNormalizeError("model output failed draft validation");
  return result.data;
}

function finalGate<T>(schema: ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AiNormalizeError(`normalized ${label} failed the strict domain schema`);
  return result.data;
}

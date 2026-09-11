import { z } from "zod";

import {
  DecisionSchema,
  FactSchema,
  IdSchema,
  IntentSchema,
  LongTextSchema,
  PossibilitySchema,
  ResolvedOutcomeSchema,
  ShortTextSchema,
  SituationSchema,
} from "@/contracts/game";

/*
 * Two-layer AI contract.
 *
 * AiDraft* schemas are the loose layer: they never reject an object because a
 * field is missing, mistyped, too long or too short. normalize() then injects
 * ids, timestamps and fixed titles, and the strict domain schemas below are the
 * final gate. Models never produce UUIDs, timestamps or fixed title strings.
 */

// ---------------------------------------------------------------------------
// Loose draft layer
// ---------------------------------------------------------------------------

// Every draft field is optional: in zod v4 a missing key would otherwise fail
// the object even though the transform itself accepts undefined.
const looseText = z.unknown().transform((value): string | undefined => {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}).optional();

const looseTextList = z.unknown().transform((value): string[] => {
  const items = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return items.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (typeof item === "number" && Number.isFinite(item)) return [String(item)];
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const text = record.label ?? record.text ?? record.content ?? record.title;
      if (typeof text === "string") return [text];
    }
    return [];
  });
}).optional();

const looseIndexList = z.unknown().transform((value): number[] => {
  const items = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return items.flatMap((item) => {
    const index = typeof item === "string" ? Number(item.trim()) : item;
    return typeof index === "number" && Number.isInteger(index) ? [index] : [];
  });
}).optional();

const looseArray = z.unknown().transform((value): unknown[] => {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}).optional();

export const AiDraftIntentSchema = z.object({
  summary: looseText,
  goals: looseTextList,
  priorities: looseTextList,
  constraints: looseTextList,
  currentActions: looseTextList,
});

const AiDraftBranchSchema = z
  .unknown()
  .transform((value) => (value && typeof value === "object" ? value : {}))
  .pipe(
    z.object({
      summary: looseText,
      scene: looseText,
      actions: looseTextList,
      externalConditions: looseTextList,
    }),
  )
  .optional();

export const AiDraftSituationSchema = z.object({
  tensions: looseTextList,
  externalConditions: looseTextList,
  triggerFactIndexes: looseIndexList,
  momentum: AiDraftBranchSchema,
  unexpected: AiDraftBranchSchema,
});

export const AiDraftFactSchema = z.object({
  kind: looseText,
  statement: looseText,
  causalReasons: looseTextList,
  dependsOnFactIndexes: looseIndexList,
});

export const AiDraftOutcomeSchema = z.object({
  narrative: looseText,
  gains: looseTextList,
  costs: looseTextList,
  unresolvedConsequences: looseTextList,
  facts: looseArray,
});

export type AiDraftIntent = z.infer<typeof AiDraftIntentSchema>;
export type AiDraftSituation = z.infer<typeof AiDraftSituationSchema>;
export type AiDraftOutcome = z.infer<typeof AiDraftOutcomeSchema>;

// ---------------------------------------------------------------------------
// Strict candidate layer (built from existing domain schemas)
// ---------------------------------------------------------------------------

/** Intent before the player confirms it; the client stamps confirmedAt. */
export const IntentCandidateSchema = IntentSchema.omit({ confirmedAt: true }).strict();
export type IntentCandidate = z.infer<typeof IntentCandidateSchema>;

export const UnderstandIntentResultSchema = z
  .object({
    summary: LongTextSchema,
    intent: IntentCandidateSchema,
  })
  .strict();
export type UnderstandIntentResult = z.infer<typeof UnderstandIntentResultSchema>;

export const MainChapterSchema = z.enum(["DAY_8", "MONTH_7", "YEAR_4"]);
export type MainChapter = z.infer<typeof MainChapterSchema>;

/**
 * One GENERATE_SITUATION call yields both possibilities plus a concrete
 * Situation variant for each, so choosing a possibility needs no second call.
 * Both variants share id, possibilities and triggers; only the scene and
 * actions differ.
 */
export const SituationCandidateSchema = z
  .object({
    chapter: MainChapterSchema,
    possibilities: z.array(PossibilitySchema).length(2),
    variants: z
      .object({
        MOMENTUM: SituationSchema,
        UNEXPECTED: SituationSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const kind of ["MOMENTUM", "UNEXPECTED"] as const) {
      const variant = value.variants[kind];
      if (variant.chapter !== value.chapter) {
        context.addIssue({ code: "custom", path: ["variants", kind, "chapter"], message: "variant chapter mismatch" });
      }
      if (JSON.stringify(variant.possibilities) !== JSON.stringify(value.possibilities)) {
        context.addIssue({ code: "custom", path: ["variants", kind, "possibilities"], message: "variant possibilities mismatch" });
      }
    }
  });
export type SituationCandidate = z.infer<typeof SituationCandidateSchema>;

// ---------------------------------------------------------------------------
// Request / response contracts for POST /api/v1/ai
// ---------------------------------------------------------------------------

export const AI_OPERATIONS = ["UNDERSTAND_INTENT", "GENERATE_SITUATION", "RESOLVE_OUTCOME"] as const;
export const AiOperationSchema = z.enum(AI_OPERATIONS);
export type AiOperation = z.infer<typeof AiOperationSchema>;

export const MAX_RAW_TEXT_LENGTH = 1_200;
const MAX_REQUEST_FACTS = 64;

export const UnderstandIntentRequestSchema = z
  .object({
    operation: z.literal("UNDERSTAND_INTENT"),
    input: z
      .object({
        rawText: z
          .string()
          .max(MAX_RAW_TEXT_LENGTH)
          .refine((value) => value.trim().length > 0, { message: "rawText must not be blank" }),
        selectedPlans: z.array(ShortTextSchema.max(40)).max(12).default([]),
      })
      .strict(),
  })
  .strict();

export const GenerateSituationRequestSchema = z
  .object({
    operation: z.literal("GENERATE_SITUATION"),
    input: z
      .object({
        chapter: MainChapterSchema,
        intent: IntentCandidateSchema,
        facts: z.array(FactSchema).max(MAX_REQUEST_FACTS),
        previousChoices: z.array(ShortTextSchema).max(3).default([]),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.chapter !== "DAY_8" && value.facts.length === 0) {
          context.addIssue({ code: "custom", path: ["facts"], message: "later chapters require prior Facts" });
        }
      }),
  })
  .strict();

export const ResolveOutcomeRequestSchema = z
  .object({
    operation: z.literal("RESOLVE_OUTCOME"),
    input: z
      .object({
        intent: IntentCandidateSchema,
        situation: SituationSchema,
        selectedPossibilityId: IdSchema,
        decision: DecisionSchema,
        facts: z.array(FactSchema).max(MAX_REQUEST_FACTS),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.decision.situationId !== value.situation.id) {
          context.addIssue({ code: "custom", path: ["decision", "situationId"], message: "Decision must reference the Situation" });
        }
        const action = value.situation.availableActions.find(({ id }) => id === value.decision.selectedActionId);
        if (!action || action.kind !== value.decision.selectedActionKind) {
          context.addIssue({ code: "custom", path: ["decision", "selectedActionId"], message: "Decision action is not in the Situation" });
        }
        if (!value.situation.possibilities.some(({ id }) => id === value.selectedPossibilityId)) {
          context.addIssue({ code: "custom", path: ["selectedPossibilityId"], message: "possibility is not in the Situation" });
        }
      }),
  })
  .strict();

export const AiRequestSchema = z.discriminatedUnion("operation", [
  UnderstandIntentRequestSchema,
  GenerateSituationRequestSchema,
  ResolveOutcomeRequestSchema,
]);
export type AiRequest = z.infer<typeof AiRequestSchema>;
export type UnderstandIntentRequest = z.infer<typeof UnderstandIntentRequestSchema>;
export type GenerateSituationRequest = z.infer<typeof GenerateSituationRequestSchema>;
export type ResolveOutcomeRequest = z.infer<typeof ResolveOutcomeRequestSchema>;

/** Whether the content came from the model or from a conservative template. */
export const GenerationSourceSchema = z.enum(["AI", "FALLBACK"]);
export type GenerationSource = z.infer<typeof GenerationSourceSchema>;

export const UnderstandIntentResponseDataSchema = z
  .object({
    operation: z.literal("UNDERSTAND_INTENT"),
    generation: GenerationSourceSchema,
    result: UnderstandIntentResultSchema,
  })
  .strict();

export const GenerateSituationResponseDataSchema = z
  .object({
    operation: z.literal("GENERATE_SITUATION"),
    generation: GenerationSourceSchema,
    result: SituationCandidateSchema,
  })
  .strict();

export const ResolveOutcomeResponseDataSchema = z
  .object({
    operation: z.literal("RESOLVE_OUTCOME"),
    generation: GenerationSourceSchema,
    result: ResolvedOutcomeSchema,
  })
  .strict();

export const AiResponseDataSchema = z.discriminatedUnion("operation", [
  UnderstandIntentResponseDataSchema,
  GenerateSituationResponseDataSchema,
  ResolveOutcomeResponseDataSchema,
]);
export type AiResponseData = z.infer<typeof AiResponseDataSchema>;
export type UnderstandIntentResponseData = z.infer<typeof UnderstandIntentResponseDataSchema>;
export type GenerateSituationResponseData = z.infer<typeof GenerateSituationResponseDataSchema>;
export type ResolveOutcomeResponseData = z.infer<typeof ResolveOutcomeResponseDataSchema>;

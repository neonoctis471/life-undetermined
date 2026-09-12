import { z } from "zod";
import { IdSchema, LongTextSchema, ShortTextSchema } from "./common";
import { FactProposalSchema } from "./fact";

/**
 * What an experience left behind, as opposed to what happened.
 *
 * Facts are hard state: objective, and later chapters may build on them
 * directly. Reflection is soft state — an experience, a way of seeing, a price
 * paid. Later generations may refer back to it ("像上次协调面试那样，先问问有
 * 没有调整余地"), but must never treat it as a settled trait or as something the
 * player will certainly do again.
 */
export const ReflectionKindSchema = z.enum([
  "METHOD",
  "PERSPECTIVE",
  "SELF_KNOWLEDGE",
  "RELATIONSHIP",
  "REALITY",
  "RESOURCE",
  "COST",
  "EXPOSED",
  "FIRST_TIME",
]);

/**
 * When the change shows up. POSSIBLE is explicitly not a prediction: it must
 * stay hedged in the copy and must never be promoted into a Fact.
 */
export const ReflectionHorizonSchema = z.enum(["IMMEDIATE", "LASTING", "POSSIBLE"]);

export const ReflectionItemSchema = z
  .object({
    kind: ReflectionKindSchema,
    content: ShortTextSchema,
    horizon: ReflectionHorizonSchema,
    /**
     * Positions in this Outcome's own `addedFacts`. Indexes rather than ids
     * because Facts are still proposals here — the engine assigns their ids on
     * APPLY_OUTCOME — and the Outcome keeps its addedFacts array, so the link
     * stays resolvable for the life of the save. The Decision is already on the
     * Outcome, so it needs no separate reference.
     */
    evidenceFactIndexes: z.array(z.number().int().min(0).max(11)).max(4),
  })
  .strict();

export const OutcomeSchema = z.object({
  id: IdSchema,
  decisionId: IdSchema,
  narrative: LongTextSchema,
  gains: z.array(ShortTextSchema).max(8),
  costs: z.array(ShortTextSchema).max(8),
  addedFacts: z.array(FactProposalSchema).max(12),
  unresolvedConsequences: z.array(ShortTextSchema).max(8),
  /** Optional: absent in saves written before reflection existed, and whenever
   *  the model had nothing worth saying. Never required to render an Outcome. */
  reflection: z.array(ReflectionItemSchema).max(6).optional(),
  validation: z.enum(["PENDING", "ACCEPTED", "REJECTED", "FALLBACK"]),
}).strict();

export const ResolvedOutcomeSchema = OutcomeSchema.extend({
  validation: z.enum(["ACCEPTED", "FALLBACK"]),
}).strict();

export type ReflectionKind = z.infer<typeof ReflectionKindSchema>;
export type ReflectionHorizon = z.infer<typeof ReflectionHorizonSchema>;
export type ReflectionItem = z.infer<typeof ReflectionItemSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type ResolvedOutcome = z.infer<typeof ResolvedOutcomeSchema>;

import { z } from "zod";
import { IdSchema, LongTextSchema, ShortTextSchema } from "./common";
import { FactProposalSchema } from "./fact";

export const OutcomeSchema = z.object({
  id: IdSchema,
  decisionId: IdSchema,
  narrative: LongTextSchema,
  gains: z.array(ShortTextSchema).max(8),
  costs: z.array(ShortTextSchema).max(8),
  addedFacts: z.array(FactProposalSchema).max(12),
  unresolvedConsequences: z.array(ShortTextSchema).max(8),
  validation: z.enum(["PENDING", "ACCEPTED", "REJECTED", "FALLBACK"]),
}).strict();

export type Outcome = z.infer<typeof OutcomeSchema>;

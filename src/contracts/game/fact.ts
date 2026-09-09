import { z } from "zod";
import {
  CausalReasonSchema,
  ContentProvenanceSchema,
  IdSchema,
  LongTextSchema,
  TimestampSchema,
} from "./common";

export const FactKindSchema = z.enum([
  "ACTIVITY",
  "EDUCATION",
  "EMPLOYMENT",
  "FINANCE",
  "SKILL",
  "RELATIONSHIP",
  "LOCATION",
  "RESPONSIBILITY",
  "CREATION",
  "EXTERNAL",
]);

const FactCoreSchema = z.object({
  kind: FactKindSchema,
  statement: LongTextSchema,
  source: ContentProvenanceSchema,
  causalReasons: z.array(CausalReasonSchema).min(1).max(4),
  causedByDecisionIds: z.array(IdSchema).max(8),
  dependsOnFactIds: z.array(IdSchema).max(16),
  externalEventId: IdSchema.optional(),
  supersedesFactId: IdSchema.optional(),
}).strict();

export const FactProposalSchema = FactCoreSchema;

export const FactSchema = FactCoreSchema.extend({
  id: IdSchema,
  occurredAt: TimestampSchema,
}).strict();

export type FactKind = z.infer<typeof FactKindSchema>;
export type FactProposal = z.infer<typeof FactProposalSchema>;
export type Fact = z.infer<typeof FactSchema>;

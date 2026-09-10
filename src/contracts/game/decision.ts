import { z } from "zod";
import { IdSchema, LongTextSchema, TimestampSchema } from "./common";

const DecisionBaseSchema = z.object({
  id: IdSchema,
  situationId: IdSchema,
  selectedActionId: IdSchema,
  reason: LongTextSchema.optional(),
  isKeyDecision: z.boolean(),
  decidedAt: TimestampSchema,
});

export const DecisionSchema = z.discriminatedUnion("selectedActionKind", [
  DecisionBaseSchema.extend({
    selectedActionKind: z.literal("PRESET"),
  }).strict(),
  DecisionBaseSchema.extend({
    selectedActionKind: z.literal("CUSTOM_PLACEHOLDER"),
    customAction: LongTextSchema,
  }).strict(),
]);

export type Decision = z.infer<typeof DecisionSchema>;

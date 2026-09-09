import { z } from "zod";
import { IdSchema, LongTextSchema, TimestampSchema } from "./common";

export const DecisionSchema = z.object({
  id: IdSchema,
  situationId: IdSchema,
  selectedActionId: IdSchema,
  selectedActionKind: z.enum(["PRESET", "CUSTOM_PLACEHOLDER"]),
  customAction: LongTextSchema.optional(),
  reason: LongTextSchema.optional(),
  isKeyDecision: z.boolean(),
  decidedAt: TimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.selectedActionKind === "CUSTOM_PLACEHOLDER" && !value.customAction) {
    context.addIssue({
      code: "custom",
      path: ["customAction"],
      message: "customAction is required for a custom decision",
    });
  }
});

export type Decision = z.infer<typeof DecisionSchema>;

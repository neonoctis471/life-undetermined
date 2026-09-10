import { z } from "zod";
import { ShortTextSchema, TimestampSchema } from "./common";

export const IntentSchema = z.object({
  rawText: z
    .string()
    .min(1)
    .max(4_000)
    .refine((value) => value.trim().length > 0, {
      message: "rawText must contain non-whitespace characters",
    }),
  goals: z.array(ShortTextSchema).min(1).max(8),
  priorities: z.array(ShortTextSchema).min(1).max(8),
  constraints: z.array(ShortTextSchema).max(8),
  currentActions: z.array(ShortTextSchema).min(1).max(8),
  confirmedAt: TimestampSchema,
}).strict();

export type Intent = z.infer<typeof IntentSchema>;

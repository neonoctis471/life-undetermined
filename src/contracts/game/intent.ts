import { z } from "zod";
import { ShortTextSchema, TimestampSchema } from "./common";

export const IntentSchema = z.object({
  rawText: z.string().trim().min(1).max(2_000),
  goals: z.array(ShortTextSchema).min(1).max(8),
  priorities: z.array(ShortTextSchema).min(1).max(8),
  constraints: z.array(ShortTextSchema).max(8),
  currentActions: z.array(ShortTextSchema).min(1).max(8),
  confirmedAt: TimestampSchema,
}).strict();

export type Intent = z.infer<typeof IntentSchema>;

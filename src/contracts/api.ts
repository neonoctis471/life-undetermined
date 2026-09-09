import { z } from "zod";

import { GamePhaseSchema, IdSchema } from "./game";

export const NextStepSchema = z.enum([
  "SUBMIT_INTENT",
  "CONFIRM_INTENT",
  "SELECT_SITUATION",
  "MAKE_DECISION",
  "REVIEW_OUTCOME",
  "SIMULATE_YEARS",
  "SELECT_KEY_DECISION",
  "REVIEW_COMPARISON",
  "FINISHED",
]);

export const ApiMetaSchema = z.object({
  requestId: IdSchema,
  eventVersion: z.number().int().nonnegative(),
  nextStep: NextStepSchema,
  phase: GamePhaseSchema.optional(),
}).strict();

export const ApiErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "NOT_FOUND",
  "FORBIDDEN",
  "VERSION_CONFLICT",
  "INVALID_TRANSITION",
  "AI_TIMEOUT",
  "AI_INVALID_OUTPUT",
  "ZHIHU_UNAVAILABLE",
  "RATE_LIMITED",
  "INTEGRITY_FAILURE",
  "INTERNAL_ERROR",
]);

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().trim().min(1).max(300),
    requestId: IdSchema,
    recoverable: z.boolean(),
  }).strict(),
}).strict();

export const successResponseSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    data,
    meta: ApiMetaSchema,
  }).strict();

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;

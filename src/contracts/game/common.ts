import { z } from "zod";

export const IdSchema = z.string().uuid();
export const TimestampSchema = z.string().datetime({ offset: true });
export const ShortTextSchema = z.string().trim().min(1).max(160);
export const LongTextSchema = z.string().trim().min(1).max(4_000);

export const ContentProvenanceSchema = z.enum([
  "ZHIHU_ORIGINAL",
  "ZHIHU_ADAPTED",
  "AI_SUPPLEMENT",
  "GAME_SIMULATION",
]);

export const CausalReasonSchema = z.enum([
  "PLAYER_DECISION",
  "PRIOR_FACT",
  "EXTERNAL_EVENT",
  "MIXED_CAUSE",
]);

export const GamePhaseSchema = z.enum([
  "CREATED",
  "INTENT_CONFIRMED",
  "SITUATION_READY",
  "DECISION_RECORDED",
  "OUTCOME_RESOLVED",
  "LONG_TERM_READY",
  "REUNION_READY",
  "FORK_READY",
  "COMPARISON_READY",
  "COMPLETED",
]);

export const ChapterSchema = z.enum([
  "DAY_8",
  "MONTH_7",
  "YEAR_4",
  "YEAR_5",
  "COUNTERFACTUAL",
]);

export type ContentProvenance = z.infer<typeof ContentProvenanceSchema>;
export type CausalReason = z.infer<typeof CausalReasonSchema>;
export type GamePhase = z.infer<typeof GamePhaseSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;

import { z } from "zod";

import {
  DecisionSchema,
  FactSchema,
  GamePhaseSchema,
  IdSchema,
  IntentSchema,
  LongTextSchema,
  ResolvedOutcomeSchema,
  ShortTextSchema,
  SituationSchema,
  SnapshotSchema,
  TimestampSchema,
} from "@/contracts/game";

export const GAME_STATE_SCHEMA_VERSION = 1 as const;
export const MAX_MAIN_SITUATIONS = 3 as const;

export const PlayedSituationSchema = z
  .object({
    situation: SituationSchema,
    selectedPossibilityId: IdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.situation.possibilities.some(({ id }) => id === value.selectedPossibilityId)) {
      context.addIssue({
        code: "custom",
        path: ["selectedPossibilityId"],
        message: "selected possibility must belong to the situation",
      });
    }
  });

export const TimelinePointSchema = z
  .object({ label: ShortTextSchema, summary: LongTextSchema })
  .strict();

export const LifePathSchema = z
  .object({
    timeline: z.array(TimelinePointSchema).min(2).max(6),
    currentState: LongTextSchema,
    reunionAnswer: LongTextSchema,
    commemorativeFacts: z.array(ShortTextSchema).min(1).max(24),
  })
  .strict();

export const LifeComparisonSchema = z
  .object({
    changedByDecision: z.array(ShortTextSchema).max(16),
    unchanged: z.array(ShortTextSchema).max(16),
    external: z.array(ShortTextSchema).max(16),
  })
  .strict();

export const GameStateSchema = z
  .object({
    schemaVersion: z.literal(GAME_STATE_SCHEMA_VERSION),
    gameId: IdSchema,
    currentStage: GamePhaseSchema,
    intent: IntentSchema.nullable(),
    facts: z.array(FactSchema).max(256),
    situations: z.array(PlayedSituationSchema).max(MAX_MAIN_SITUATIONS),
    decisions: z.array(DecisionSchema).max(MAX_MAIN_SITUATIONS),
    outcomes: z.array(ResolvedOutcomeSchema).max(MAX_MAIN_SITUATIONS),
    keyDecisionSnapshot: SnapshotSchema.nullable(),
    fiveYearLife: LifePathSchema.nullable(),
    parallelLife: LifePathSchema.nullable(),
    comparison: LifeComparisonSchema.nullable(),
    updatedAt: TimestampSchema,
  })
  .strict();

export type PlayedSituation = z.infer<typeof PlayedSituationSchema>;
export type TimelinePoint = z.infer<typeof TimelinePointSchema>;
export type LifePath = z.infer<typeof LifePathSchema>;
export type LifeComparison = z.infer<typeof LifeComparisonSchema>;
export type GameState = z.infer<typeof GameStateSchema>;

import { z } from "zod";

import { IdSchema, TimestampSchema } from "./common";
import { DecisionSchema } from "./decision";
import { FactSchema } from "./fact";
import { IntentSchema } from "./intent";
import { ResolvedOutcomeSchema } from "./outcome";
import { SituationSchema } from "./situation";
import { SnapshotSchema } from "./snapshot";

export const GameEventTypeSchema = z.enum([
  "GAME_CREATED",
  "INTENT_CONFIRMED",
  "SITUATION_CREATED",
  "DECISION_MADE",
  "OUTCOME_RESOLVED",
  "FACTS_ADDED",
  "YEARS_SIMULATED",
  "SNAPSHOT_CREATED",
  "LIFE_FORKED",
  "SHARE_CREATED",
]);

const EventEnvelopeSchema = z.object({
  id: IdSchema,
  gameId: IdSchema,
  branchId: IdSchema,
  eventVersion: z.number().int().nonnegative(),
  occurredAt: TimestampSchema,
  idempotencyKey: z.string().trim().min(8).max(128),
});

const event = <T extends z.ZodLiteral<string>, P extends z.ZodType>(
  type: T,
  payload: P,
) => EventEnvelopeSchema.extend({ type, payload }).strict();

export const GameEventSchema = z.discriminatedUnion("type", [
  event(
    z.literal("GAME_CREATED"),
    z
      .object({
        initialBranchId: IdSchema,
      })
      .strict(),
  ),
  event(z.literal("INTENT_CONFIRMED"), IntentSchema),
  event(z.literal("SITUATION_CREATED"), SituationSchema),
  event(z.literal("DECISION_MADE"), DecisionSchema),
  event(z.literal("OUTCOME_RESOLVED"), ResolvedOutcomeSchema),
  event(
    z.literal("FACTS_ADDED"),
    z
      .object({
        facts: z.array(FactSchema).min(1).max(12),
      })
      .strict(),
  ),
  event(
    z.literal("YEARS_SIMULATED"),
    z
      .object({
        summary: z.string().trim().min(1).max(4_000),
        facts: z.array(FactSchema).max(32),
      })
      .strict(),
  ),
  event(z.literal("SNAPSHOT_CREATED"), SnapshotSchema),
  event(
    z.literal("LIFE_FORKED"),
    z
      .object({
        sourceBranchId: IdSchema,
        targetBranchId: IdSchema,
        snapshotId: IdSchema,
        replacementDecisionId: IdSchema,
      })
      .strict(),
  ),
  event(
    z.literal("SHARE_CREATED"),
    z
      .object({
        shareId: IdSchema,
        slug: z.string().regex(/^[A-Za-z0-9_-]{24,128}$/),
      })
      .strict(),
  ),
]);

export type GameEventType = z.infer<typeof GameEventTypeSchema>;
export type GameEvent = z.infer<typeof GameEventSchema>;

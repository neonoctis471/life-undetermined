import { z } from "zod";
import {
  IdSchema,
  LongTextSchema,
  ShortTextSchema,
  TimestampSchema,
} from "./common";
import { IntentSchema } from "./intent";

export const RelationshipSummarySchema = z.object({
  actor: ShortTextSchema,
  status: LongTextSchema,
}).strict();

export const WorldContextSchema = z.object({
  city: ShortTextSchema.optional(),
  familyContext: LongTextSchema,
  economicStartingPoint: LongTextSchema,
  skills: z.array(ShortTextSchema).max(16),
  relationships: z.array(ShortTextSchema).max(16),
  externalEvents: z.array(LongTextSchema).max(16),
  worldSeed: z.string().trim().min(8).max(128),
}).strict();

export const SnapshotSchema = z.object({
  id: IdSchema,
  gameId: IdSchema,
  branchId: IdSchema,
  eventVersion: z.number().int().nonnegative(),
  intent: IntentSchema,
  activeFactIds: z.array(IdSchema).max(256),
  relationshipSummary: z.array(RelationshipSummarySchema).max(32),
  worldContext: WorldContextSchema,
  keyDecisionId: IdSchema,
  createdAt: TimestampSchema,
}).strict();

export type RelationshipSummary = z.infer<typeof RelationshipSummarySchema>;
export type WorldContext = z.infer<typeof WorldContextSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;

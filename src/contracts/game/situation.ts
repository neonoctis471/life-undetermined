import { z } from "zod";
import {
  ChapterSchema,
  IdSchema,
  LongTextSchema,
  ShortTextSchema,
} from "./common";
import { FactKindSchema } from "./fact";

export const PossibilitySchema = z.object({
  id: IdSchema,
  kind: z.enum(["MOMENTUM", "UNEXPECTED"]),
  title: z.enum(["顺势发展的可能", "意料之外的变化"]),
  summary: LongTextSchema,
}).strict();

export const ActionSchema = z.object({
  id: IdSchema,
  kind: z.enum(["PRESET", "CUSTOM_PLACEHOLDER"]),
  label: ShortTextSchema,
}).strict();

export const SituationSchema = z.object({
  id: IdSchema,
  chapter: ChapterSchema,
  timeLabel: ShortTextSchema,
  triggerFactIds: z.array(IdSchema).max(16),
  forbiddenFactKinds: z.array(FactKindSchema).max(10),
  tensions: z.array(ShortTextSchema).min(1).max(6),
  possibilities: z.array(PossibilitySchema).length(2),
  concreteContext: LongTextSchema,
  availableActions: z.array(ActionSchema).min(1).max(5),
  externalConditions: z.array(ShortTextSchema).max(8),
}).strict();

export type Possibility = z.infer<typeof PossibilitySchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Situation = z.infer<typeof SituationSchema>;

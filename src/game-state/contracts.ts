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

const GameStateStructureSchema = z
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

type GameStateStructure = z.infer<typeof GameStateStructureSchema>;

export interface GameStateConsistencyIssue {
  path: (string | number)[];
  message: string;
}

const MAIN_CHAPTERS = ["DAY_8", "MONTH_7", "YEAR_4"] as const;

/** Validates relationships that individual field Schemas cannot express. */
export function validateGameStateConsistency(state: GameStateStructure): GameStateConsistencyIssue[] {
  const issues: GameStateConsistencyIssue[] = [];
  const issue = (path: (string | number)[], message: string) => issues.push({ path, message });
  const situationCount = state.situations.length;
  const decisionCount = state.decisions.length;
  const outcomeCount = state.outcomes.length;

  const expectedCounts: Record<GameStateStructure["currentStage"], [number, number, number] | "MATCHED_PARTIAL"> = {
    CREATED: [0, 0, 0],
    INTENT_CONFIRMED: [0, 0, 0],
    SITUATION_READY: "MATCHED_PARTIAL",
    DECISION_RECORDED: "MATCHED_PARTIAL",
    OUTCOME_RESOLVED: "MATCHED_PARTIAL",
    LONG_TERM_READY: [3, 3, 3],
    REUNION_READY: [3, 3, 3],
    FORK_READY: [3, 3, 3],
    COMPARISON_READY: [3, 3, 3],
    COMPLETED: [3, 3, 3],
  };
  const expected = expectedCounts[state.currentStage];
  const countsAreLegal = expected === "MATCHED_PARTIAL"
    ? state.currentStage === "SITUATION_READY"
      ? situationCount >= 1 && situationCount <= 3 && situationCount === decisionCount + 1 && decisionCount === outcomeCount
      : state.currentStage === "DECISION_RECORDED"
        ? decisionCount >= 1 && decisionCount <= 3 && situationCount === decisionCount && decisionCount === outcomeCount + 1
        : outcomeCount >= 1 && outcomeCount < 3 && situationCount === decisionCount && decisionCount === outcomeCount
    : situationCount === expected[0] && decisionCount === expected[1] && outcomeCount === expected[2];
  if (!countsAreLegal) issue(["currentStage"], "stage does not match Situation, Decision and Outcome counts");

  const requiresIntent = state.currentStage !== "CREATED";
  if (requiresIntent !== (state.intent !== null)) issue(["intent"], "Intent presence does not match the stage");

  const uniqueIds = (values: string[], path: string) => {
    if (new Set(values).size !== values.length) issue([path], `${path} ids must be unique`);
  };
  uniqueIds(state.situations.map(({ situation }) => situation.id), "situations");
  uniqueIds(state.decisions.map(({ id }) => id), "decisions");
  uniqueIds(state.outcomes.map(({ id }) => id), "outcomes");
  uniqueIds(state.facts.map(({ id }) => id), "facts");

  const allDecisionIds = new Set(state.decisions.map(({ id }) => id));
  let factOffset = 0;
  for (let index = 0; index < state.situations.length; index += 1) {
    const played = state.situations[index]!;
    const situation = played.situation;
    if (situation.chapter !== MAIN_CHAPTERS[index]) {
      issue(["situations", index, "situation", "chapter"], "main chapters must be in order");
    }
    const priorFactIds = new Set(state.facts.slice(0, factOffset).map(({ id }) => id));
    if (index > 0 && situation.triggerFactIds.length === 0) {
      issue(["situations", index, "situation", "triggerFactIds"], "later Situations require a trigger Fact");
    }
    if (situation.triggerFactIds.some((id) => !priorFactIds.has(id))) {
      issue(["situations", index, "situation", "triggerFactIds"], "Situation trigger must reference an earlier Fact");
    }

    const decision = state.decisions[index];
    if (decision) {
      if (decision.situationId !== situation.id) {
        issue(["decisions", index, "situationId"], "Decision must reference its Situation");
      }
      const selectedAction = situation.availableActions.find(({ id }) => id === decision.selectedActionId);
      if (!selectedAction || selectedAction.kind !== decision.selectedActionKind) {
        issue(["decisions", index, "selectedActionId"], "Decision action must belong to its Situation");
      }
    }

    const outcome = state.outcomes[index];
    if (outcome) {
      if (!decision || outcome.decisionId !== decision.id) {
        issue(["outcomes", index, "decisionId"], "Outcome must reference its Decision");
      }
      if (outcome.addedFacts.length === 0) {
        issue(["outcomes", index, "addedFacts"], "resolved Outcome must add an authoritative Fact");
      }
      const outcomeFacts = state.facts.slice(factOffset, factOffset + outcome.addedFacts.length);
      if (outcomeFacts.length !== outcome.addedFacts.length) {
        issue(["facts"], "authoritative Fact count must match Outcome proposals");
      }
      for (let proposalIndex = 0; proposalIndex < outcome.addedFacts.length; proposalIndex += 1) {
        const proposal = outcome.addedFacts[proposalIndex]!;
        const fact = outcomeFacts[proposalIndex];
        if (fact && !sameFactProposal(fact, proposal)) {
          issue(["facts", factOffset + proposalIndex], "authoritative Fact must match its Outcome proposal");
        }
        if (situation.forbiddenFactKinds.includes(proposal.kind)) {
          issue(["outcomes", index, "addedFacts", proposalIndex, "kind"], "Fact kind is forbidden by the Situation");
        }
      }
      factOffset += outcome.addedFacts.length;
    }
  }
  if (factOffset !== state.facts.length) issue(["facts"], "Facts must be produced by recorded Outcomes");

  for (const [index, fact] of state.facts.entries()) {
    if (fact.causedByDecisionIds.some((id) => !allDecisionIds.has(id))) {
      issue(["facts", index, "causedByDecisionIds"], "Fact references an unknown Decision");
    }
    const priorFactIds = new Set(state.facts.slice(0, index).map(({ id }) => id));
    if (fact.dependsOnFactIds.some((id) => !priorFactIds.has(id))) {
      issue(["facts", index, "dependsOnFactIds"], "Fact dependency must reference an earlier Fact");
    }
    if (fact.supersedesFactId && !priorFactIds.has(fact.supersedesFactId)) {
      issue(["facts", index, "supersedesFactId"], "superseded Fact must already exist");
    }
    addCausalEvidenceIssues(fact, ["facts", index], issue);
  }

  const keyDecisions = state.decisions.filter(({ isKeyDecision }) => isKeyDecision);
  if (keyDecisions.length > 1) issue(["decisions"], "only one key Decision is allowed");
  if ((keyDecisions.length === 1) !== (state.keyDecisionSnapshot !== null)) {
    issue(["keyDecisionSnapshot"], "key Decision and Snapshot must exist together");
  }
  if (decisionCount === MAX_MAIN_SITUATIONS && keyDecisions.length !== 1) {
    issue(["decisions"], "three Decisions require exactly one key Decision");
  }
  const snapshot = state.keyDecisionSnapshot;
  const keyDecision = keyDecisions[0];
  if (snapshot && keyDecision) {
    const keyIndex = state.decisions.indexOf(keyDecision);
    const factsBeforeKeyCount = state.outcomes
      .slice(0, keyIndex)
      .reduce((count, outcome) => count + outcome.addedFacts.length, 0);
    const expectedActiveFactIds = state.facts.slice(0, factsBeforeKeyCount).map(({ id }) => id);
    if (snapshot.gameId !== state.gameId) issue(["keyDecisionSnapshot", "gameId"], "Snapshot must reference this game");
    if (snapshot.keyDecisionId !== keyDecision.id) issue(["keyDecisionSnapshot", "keyDecisionId"], "Snapshot must reference the key Decision");
    if (!sameValue(snapshot.intent, state.intent)) issue(["keyDecisionSnapshot", "intent"], "Snapshot Intent must match confirmed Intent");
    if (!sameValue(snapshot.activeFactIds, expectedActiveFactIds)) {
      issue(["keyDecisionSnapshot", "activeFactIds"], "Snapshot Facts must match the pre-decision state");
    }
  }

  const needsFiveYearLife = ["REUNION_READY", "FORK_READY", "COMPARISON_READY", "COMPLETED"].includes(state.currentStage);
  const allowsParallelLife = ["FORK_READY", "COMPARISON_READY", "COMPLETED"].includes(state.currentStage);
  const needsParallelLife = ["COMPARISON_READY", "COMPLETED"].includes(state.currentStage);
  const needsComparison = ["COMPARISON_READY", "COMPLETED"].includes(state.currentStage);
  if (needsFiveYearLife !== (state.fiveYearLife !== null)) issue(["fiveYearLife"], "five-year life presence does not match the stage");
  if ((!allowsParallelLife && state.parallelLife !== null) || (needsParallelLife && state.parallelLife === null)) {
    issue(["parallelLife"], "parallel life presence does not match the stage");
  }
  if (needsComparison !== (state.comparison !== null)) issue(["comparison"], "comparison presence does not match the stage");

  return issues;
}

export const GameStateSchema = GameStateStructureSchema.superRefine((state, context) => {
  for (const consistencyIssue of validateGameStateConsistency(state)) {
    context.addIssue({ code: "custom", ...consistencyIssue });
  }
});

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameFactProposal(
  fact: GameStateStructure["facts"][number],
  proposal: GameStateStructure["outcomes"][number]["addedFacts"][number],
): boolean {
  const factProposal = {
    kind: fact.kind,
    statement: fact.statement,
    source: fact.source,
    causalReasons: fact.causalReasons,
    causedByDecisionIds: fact.causedByDecisionIds,
    dependsOnFactIds: fact.dependsOnFactIds,
    externalEventId: fact.externalEventId,
    supersedesFactId: fact.supersedesFactId,
  };
  return sameValue(factProposal, proposal);
}

function addCausalEvidenceIssues(
  fact: GameStateStructure["facts"][number],
  path: (string | number)[],
  issue: (path: (string | number)[], message: string) => void,
): void {
  const hasDecision = fact.causedByDecisionIds.length > 0;
  const hasPriorFact = fact.dependsOnFactIds.length > 0;
  const hasExternalEvent = fact.externalEventId !== undefined;
  if (fact.causalReasons.includes("PLAYER_DECISION") && !hasDecision) {
    issue([...path, "causedByDecisionIds"], "PLAYER_DECISION requires Decision evidence");
  }
  if (fact.causalReasons.includes("PRIOR_FACT") && !hasPriorFact) {
    issue([...path, "dependsOnFactIds"], "PRIOR_FACT requires prior Fact evidence");
  }
  if (fact.causalReasons.includes("EXTERNAL_EVENT") && !hasExternalEvent) {
    issue([...path, "externalEventId"], "EXTERNAL_EVENT requires an external event id");
  }
  const evidenceKinds = Number(hasDecision) + Number(hasPriorFact) + Number(hasExternalEvent);
  if (fact.causalReasons.includes("MIXED_CAUSE") && evidenceKinds < 2) {
    issue(path, "MIXED_CAUSE requires at least two evidence kinds");
  }
}

export type PlayedSituation = z.infer<typeof PlayedSituationSchema>;
export type TimelinePoint = z.infer<typeof TimelinePointSchema>;
export type LifePath = z.infer<typeof LifePathSchema>;
export type LifeComparison = z.infer<typeof LifeComparisonSchema>;
export type GameState = z.infer<typeof GameStateSchema>;

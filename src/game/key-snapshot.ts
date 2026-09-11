import { SnapshotSchema, type Fact, type Snapshot } from "@/contracts/game";
import type { EngineDependencies, GameState } from "@/game-state";

/*
 * Deterministic pre-decision Snapshot. It is built by the application from the
 * authoritative GameState, never by AI. GameState has no worldContext, so the
 * required descriptions are derived from the confirmed Intent and Facts, with
 * non-empty fallbacks where nothing is known.
 */

export const FALLBACK_FAMILY_CONTEXT = "玩家没有具体描述家庭情况。";
export const FALLBACK_ECONOMIC_STARTING_POINT = "玩家没有具体描述经济起点。";

const FAMILY_PATTERN = /家|父母|爸|妈|亲人|店/;
const ECONOMY_PATTERN = /钱|资金|收入|经济|存款|工资|成本|负债|贷款|房租|开销|赚|投入/;
const MAX_LIST_ITEMS = 16;

export function buildKeyDecisionSnapshot(state: GameState, decisionId: string, deps: EngineDependencies): Snapshot {
  const intent = state.intent;
  if (!intent) throw new Error("a key Decision requires a confirmed Intent");
  const facts = state.facts;
  const statements = (predicate: (fact: Fact) => boolean) => facts.filter(predicate).map(({ statement }) => statement);

  const familyContext = describe(
    [
      ...[...intent.goals, ...intent.priorities, ...intent.constraints].filter((text) => FAMILY_PATTERN.test(text)),
      ...statements((fact) => (fact.kind === "RELATIONSHIP" || fact.kind === "RESPONSIBILITY") && FAMILY_PATTERN.test(fact.statement)),
    ],
    FALLBACK_FAMILY_CONTEXT,
  );
  const economicStartingPoint = describe(
    [
      ...intent.constraints.filter((text) => ECONOMY_PATTERN.test(text)),
      ...statements((fact) => fact.kind === "FINANCE" || ECONOMY_PATTERN.test(fact.statement)),
    ],
    FALLBACK_ECONOMIC_STARTING_POINT,
  );

  return SnapshotSchema.parse({
    id: deps.createId(),
    gameId: state.gameId,
    branchId: deps.createId(),
    eventVersion: state.situations.length + state.decisions.length + state.outcomes.length,
    // Passed through unchanged: the engine compares every Intent field, confirmedAt included.
    intent,
    activeFactIds: facts.map(({ id }) => id),
    relationshipSummary: [],
    worldContext: {
      familyContext,
      economicStartingPoint,
      skills: shortList(statements((fact) => fact.kind === "SKILL")),
      relationships: shortList(statements((fact) => fact.kind === "RELATIONSHIP")),
      externalEvents: statements((fact) => fact.kind === "EXTERNAL").slice(0, MAX_LIST_ITEMS),
      worldSeed: state.gameId,
    },
    keyDecisionId: decisionId,
    createdAt: deps.now(),
  });
}

function describe(lines: readonly string[], fallback: string): string {
  const unique = [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
  return unique.length > 0 ? truncate(unique.join("；"), 1_000) : fallback;
}

function shortList(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => truncate(value.trim(), 160)).filter(Boolean))].slice(0, MAX_LIST_ITEMS);
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

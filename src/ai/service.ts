import { describeDecisionAction } from "@/game/labels";

import type { AiOperation, AiRequest, AiResponseData } from "./contracts";
import {
  buildFallbackIntentDraft,
  buildFallbackLifeDraft,
  buildFallbackOutcomeDraft,
  buildFallbackSituationDraft,
} from "./fallbacks";
import {
  AiNormalizeError,
  normalizeIntentDraft,
  normalizeLifeDraft,
  normalizeOutcomeDraft,
  normalizeSituationDraft,
} from "./normalize";
import {
  buildGenerateSituationPrompt,
  buildResolveOutcomePrompt,
  buildSimulateLifePrompt,
  buildUnderstandIntentPrompt,
} from "./prompts";
import { AiProviderError, type AiCompletionRequest, type AiProvider } from "./provider";

export interface AttemptPolicy {
  /** Upper bound for a single provider call. */
  callTimeoutMs: number;
  /** Shared budget for both attempts; must stay under the route's maxDuration (60s). */
  budgetMs: number;
  /**
   * The relay occasionally hangs a request until timeout. If the first attempt
   * is still running after this long, a second one starts in parallel and the
   * first valid answer wins. Set just above the operation's normal latency.
   */
  hedgeAfterMs: number;
}

export const ATTEMPT_POLICIES: Record<AiOperation, AttemptPolicy> = {
  UNDERSTAND_INTENT: { callTimeoutMs: 25_000, budgetMs: 45_000, hedgeAfterMs: 8_000 },
  GENERATE_SITUATION: { callTimeoutMs: 25_000, budgetMs: 45_000, hedgeAfterMs: 17_000 },
  RESOLVE_OUTCOME: { callTimeoutMs: 25_000, budgetMs: 45_000, hedgeAfterMs: 11_000 },
  SIMULATE_LIFE: { callTimeoutMs: 45_000, budgetMs: 55_000, hedgeAfterMs: 28_000 },
};

const MIN_ATTEMPT_MS = 5_000;
const MAX_ATTEMPTS = 2;

export type AiAttemptOutcome = "ok" | "invalid_output" | "timeout" | "upstream_error" | "internal_error" | "cancelled";

/** Log events carry no prompt, player text, model output or credentials. */
export interface AiLogEvent {
  operation: AiOperation;
  attempt: number;
  outcome: AiAttemptOutcome;
  durationMs: number;
}

export interface AiServiceDependencies {
  provider: AiProvider;
  createId(): string;
  clock?(): number;
  log?(event: AiLogEvent): void;
  /** Test hook to shorten timings. */
  policies?: Partial<Record<AiOperation, AttemptPolicy>>;
}

export async function runAiOperation(request: AiRequest, deps: AiServiceDependencies): Promise<AiResponseData> {
  switch (request.operation) {
    case "UNDERSTAND_INTENT": {
      const context = { rawText: request.input.rawText, selectedPlans: request.input.selectedPlans };
      const generated = await generateWithHedge(
        request.operation,
        { tier: "FAST", ...buildUnderstandIntentPrompt(context), maxTokens: 800 },
        (raw) => normalizeIntentDraft(raw, context),
        deps,
      );
      return generated
        ? { operation: request.operation, generation: "AI", result: generated }
        : {
            operation: request.operation,
            generation: "FALLBACK",
            result: normalizeIntentDraft(buildFallbackIntentDraft(context), context),
          };
    }
    case "GENERATE_SITUATION": {
      const { chapter, intent, facts, previousChoices } = request.input;
      const context = { chapter, facts };
      const generated = await generateWithHedge(
        request.operation,
        { tier: "FAST", ...buildGenerateSituationPrompt({ chapter, intent, facts, previousChoices }), maxTokens: 1_600 },
        (raw) => normalizeSituationDraft(raw, context, deps),
        deps,
      );
      return generated
        ? { operation: request.operation, generation: "AI", result: generated }
        : {
            operation: request.operation,
            generation: "FALLBACK",
            result: normalizeSituationDraft(buildFallbackSituationDraft(chapter), context, deps),
          };
    }
    case "RESOLVE_OUTCOME": {
      const { intent, situation, selectedPossibilityId, decision, facts } = request.input;
      const actionLabel = describeDecisionAction(decision, situation);
      const possibility = situation.possibilities.find(({ id }) => id === selectedPossibilityId);
      const context = { decisionId: decision.id, facts, actionLabel };
      const prompt = buildResolveOutcomePrompt({
        intent,
        situation,
        possibility,
        actionLabel,
        isCustomAction: decision.selectedActionKind === "CUSTOM_PLACEHOLDER",
        facts,
      });
      const generated = await generateWithHedge(
        request.operation,
        { tier: "FAST", ...prompt, maxTokens: 900 },
        (raw) => normalizeOutcomeDraft(raw, { ...context, validation: "ACCEPTED" }, deps),
        deps,
      );
      return generated
        ? { operation: request.operation, generation: "AI", result: generated }
        : {
            operation: request.operation,
            generation: "FALLBACK",
            result: normalizeOutcomeDraft(buildFallbackOutcomeDraft(actionLabel), { ...context, validation: "FALLBACK" }, deps),
          };
    }
    case "SIMULATE_LIFE": {
      const { input } = request;
      const context = { mode: input.mode, facts: input.facts };
      const generated = await generateWithHedge(
        request.operation,
        { tier: "DEEP", ...buildSimulateLifePrompt(input), maxTokens: input.mode === "COUNTERFACTUAL" ? 2_200 : 1_800 },
        (raw) => normalizeLifeDraft(raw, context),
        deps,
      );
      const fallback =
        input.mode === "FIVE_YEARS"
          ? buildFallbackLifeDraft({ mode: "FIVE_YEARS" })
          : buildFallbackLifeDraft({
              mode: "COUNTERFACTUAL",
              originalAction: input.keyChoice.action,
              replacementAction: input.replacementAction,
            });
      return generated
        ? { operation: request.operation, generation: "AI", result: generated }
        : { operation: request.operation, generation: "FALLBACK", result: normalizeLifeDraft(fallback, context) };
    }
  }
}

/**
 * Runs the first attempt, starts a second one if the first fails early or is
 * still running after hedgeAfterMs, and returns the first valid result. The
 * losing call is aborted. null means both attempts failed: use the fallback.
 */
async function generateWithHedge<T>(
  operation: AiOperation,
  completion: Omit<AiCompletionRequest, "timeoutMs" | "signal">,
  normalize: (raw: unknown) => T,
  deps: AiServiceDependencies,
): Promise<T | null> {
  const policy = deps.policies?.[operation] ?? ATTEMPT_POLICIES[operation];
  const clock = deps.clock ?? Date.now;
  const deadline = clock() + policy.budgetMs;
  const controllers: AbortController[] = [];

  const attempt = async (number: number): Promise<T> => {
    const remaining = deadline - clock();
    if (remaining < MIN_ATTEMPT_MS) throw new AiProviderError("TIMEOUT", "time budget exhausted");
    const controller = new AbortController();
    controllers.push(controller);
    const started = clock();
    try {
      const content = await deps.provider.completeJson({
        ...completion,
        timeoutMs: Math.min(policy.callTimeoutMs, remaining),
        signal: controller.signal,
      });
      const result = normalize(extractJsonObject(content));
      deps.log?.({ operation, attempt: number, outcome: "ok", durationMs: clock() - started });
      return result;
    } catch (error) {
      const outcome = controller.signal.aborted ? "cancelled" : classifyError(error);
      deps.log?.({ operation, attempt: number, outcome, durationMs: clock() - started });
      throw error;
    }
  };

  return new Promise<T | null>((resolve) => {
    let settled = false;
    let launched = 0;
    let failed = 0;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      for (const controller of controllers) controller.abort();
      resolve(value);
    };
    const launch = () => {
      launched += 1;
      attempt(launched).then(finish, () => {
        failed += 1;
        if (settled) return;
        if (launched < MAX_ATTEMPTS) launch();
        else if (failed >= launched) finish(null);
      });
    };
    const hedgeTimer = setTimeout(() => {
      if (!settled && launched < MAX_ATTEMPTS) launch();
    }, policy.hedgeAfterMs);
    launch();
  });
}

/**
 * Always strips ``` fences before parsing, whether or not the relay honoured
 * response_format (it may silently route to a model that wraps JSON in fences).
 * Accepts bare JSON, fenced JSON anywhere in the text, or JSON wrapped in prose.
 */
export function extractJsonObject(content: string): unknown {
  const candidates: string[] = [];
  const fenced = /```[a-zA-Z]*\s*([\s\S]*?)```/.exec(content);
  if (fenced?.[1]) candidates.push(fenced[1]);
  candidates.push(content.replace(/```[a-zA-Z]*/g, ""));
  for (const candidate of candidates) {
    const text = candidate.trim();
    try {
      return JSON.parse(text);
    } catch {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(text.slice(start, end + 1));
        } catch {
          // try the next candidate
        }
      }
    }
  }
  throw new AiNormalizeError("model output is not valid JSON");
}

function classifyError(error: unknown): AiAttemptOutcome {
  if (error instanceof AiProviderError) {
    if (error.kind === "TIMEOUT") return "timeout";
    return error.kind === "INVALID_RESPONSE" ? "invalid_output" : "upstream_error";
  }
  if (error instanceof AiNormalizeError) return "invalid_output";
  return "internal_error";
}

"use client";

import { useRef, useState } from "react";

import type {
  GenerateSituationResponseData,
  IntentCandidate,
  MainChapter,
  ResolveOutcomeResponseData,
  SimulateLifeResponseData,
  UnderstandIntentResponseData,
} from "@/ai/contracts";
import type { Action } from "@/contracts/game";
import type { GameAction, GameState } from "@/game-state";
import {
  buildDecision,
  choiceSummaries,
  isKeyDecisionTurn,
  keyChoiceSummary,
  keyDecisionContext,
  nextChapter,
  previousChoices,
  snapshotFacts,
  toIntentCandidate,
} from "@/game/flow";
import { buildKeyDecisionSnapshot } from "@/game/key-snapshot";
import type { ExperienceRequest, ExperienceResponseData } from "@/zhihu/contracts";

import {
  errorMessage,
  requestLife,
  requestOutcome,
  requestSituation,
  requestUnderstandIntent,
  type Timed,
} from "./ai-client";
import { Backdrop } from "./backdrop";
import { ForkMark } from "./brand";
import { engineDeps, getGameStore, useGameState } from "./client-store";
import { ACT_LABELS, DISPLAY } from "./copy";
import { ExperiencePanel, PlanExperiencePanel } from "./experience-cards";
import { LineField } from "./field/LineField";
import { deriveFieldTarget, type FieldUi, type Side } from "./field/target";
import { loadForkChoice, saveForkChoice, type ForkChoice } from "./fork-choice";
import {
  ComparisonView,
  EndingView,
  FiveYearsTransition,
  ForkChooser,
  ReunionView,
  RewindTransition,
} from "./late-screens";
import { draftIntentFromPlans, planIntents, planQueries } from "./plans";
import {
  Hero,
  IntentConfirm,
  IntentInput,
  OutcomePending,
  OutcomeView,
  Possibilities,
  SituationView,
  isMainChapter,
  type Async,
} from "./screens";
import { requestExperience } from "./zhihu-client";

type SituationSlots = Partial<Record<MainChapter, Async<Timed<GenerateSituationResponseData>>>>;
type ExperienceSlots = Partial<Record<MainChapter, Async<ExperienceResponseData>>>;
type LifeSlot = Async<Timed<SimulateLifeResponseData>>;

const IDLE = { status: "idle" } as const;
/** Minimum on-screen time for the long transitions, so the animation reads as time passing. */
const FIVE_YEARS_MIN_MS = 5_000;
const REWIND_MIN_MS = 7_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Which act the player is in, for the colophon. Presentation only. */
function actIndex(state: GameState, viewingNextChapter: boolean): number {
  switch (state.currentStage) {
    case "CREATED":
      return 0;
    case "INTENT_CONFIRMED":
      return 1;
    case "SITUATION_READY":
    case "DECISION_RECORDED":
      return state.situations.length;
    case "OUTCOME_RESOLVED":
      return state.outcomes.length + (viewingNextChapter ? 1 : 0);
    case "LONG_TERM_READY":
      return 3;
    case "REUNION_READY":
      return 4;
    default:
      return 5;
  }
}

export default function PlayPage() {
  const gameState = useGameState();
  const [rawText, setRawText] = useState("");
  const [plans, setPlans] = useState<string[]>([]);
  const [values, setValues] = useState<string[]>([]);
  const [heroOpen, setHeroOpen] = useState(true);
  const [hovered, setHovered] = useState<Side>(0);
  const [understanding, setUnderstanding] = useState<Async<Timed<UnderstandIntentResponseData>>>(IDLE);
  const [situations, setSituations] = useState<SituationSlots>({});
  const [experiences, setExperiences] = useState<ExperienceSlots>({});
  const [planExperience, setPlanExperience] = useState<Async<ExperienceResponseData>>(IDLE);
  const [outcome, setOutcome] = useState<Async<Timed<ResolveOutcomeResponseData>>>(IDLE);
  const [showPossibilities, setShowPossibilities] = useState(false);
  const [fiveYears, setFiveYears] = useState<LifeSlot>(IDLE);
  const [accelerating, setAccelerating] = useState(false);
  const [forkPicking, setForkPicking] = useState(false);
  const [parallel, setParallel] = useState<LifeSlot>(IDLE);
  const [forkChoice, setForkChoice] = useState<ForkChoice | null>(() => loadForkChoice());
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped on reset/edit so late responses from an abandoned run are ignored.
  const session = useRef(0);
  const fiveYearsRequest = useRef<Promise<Timed<SimulateLifeResponseData>> | null>(null);

  if (!gameState) {
    return (
      <div className="shell">
        <main className="stage" aria-busy="true" />
      </div>
    );
  }

  const dispatch = (action: GameAction): boolean => {
    try {
      getGameStore().dispatch(action);
      return true;
    } catch {
      setNotice("状态校验没有通过，这一步没有写入。可以重试或重新开始。");
      return false;
    }
  };

  const setSlot = (chapter: MainChapter, value: Async<Timed<GenerateSituationResponseData>>) =>
    setSituations((current) => ({ ...current, [chapter]: value }));

  const startSituation = (chapter: MainChapter, state: GameState, intent: IntentCandidate) => {
    const token = session.current;
    setSlot(chapter, { status: "pending" });
    requestSituation({ chapter, intent, facts: state.facts, previousChoices: previousChoices(state) })
      .then((value) => {
        if (session.current === token) setSlot(chapter, { status: "ready", value });
      })
      .catch((error: unknown) => {
        if (session.current === token) setSlot(chapter, { status: "error", message: errorMessage(error) });
      });
  };

  const ensureSituation = (chapter: MainChapter) => {
    const slot = situations[chapter];
    const state = getGameStore().getState();
    if ((!slot || slot.status === "idle" || slot.status === "error") && state.intent) {
      startSituation(chapter, state, toIntentCandidate(state.intent));
    }
  };

  /** Experience cards run in parallel and never block the main line; failures just hide the panel. */
  const startExperience = (chapter: MainChapter, input: ExperienceRequest) => {
    const token = session.current;
    setExperiences((current) => ({ ...current, [chapter]: { status: "pending" } }));
    requestExperience(input)
      .then((value) => {
        if (session.current === token) setExperiences((current) => ({ ...current, [chapter]: { status: "ready", value } }));
      })
      .catch(() => {
        if (session.current === token) setExperiences((current) => ({ ...current, [chapter]: { status: "error", message: "" } }));
      });
  };

  /**
   * Act 1 lookup, driven by the ticked chips only. The draft Intent it builds is
   * throwaway ranking input and never reaches the engine.
   */
  const loadPlanExperience = () => {
    const intent = draftIntentFromPlans(plans, rawText);
    const queries = planQueries(plans);
    if (!intent || queries.length === 0 || planExperience.status === "pending") return;
    const token = session.current;
    setPlanExperience({ status: "pending" });
    requestExperience({ intent, situation: null, queries })
      .then((value) => {
        if (session.current === token) setPlanExperience({ status: "ready", value });
      })
      .catch(() => {
        if (session.current === token) setPlanExperience({ status: "error", message: "" });
      });
  };

  const startFiveYears = (state: GameState): Promise<Timed<SimulateLifeResponseData>> | null => {
    if (!state.intent || state.facts.length === 0) return null;
    const token = session.current;
    setFiveYears({ status: "pending" });
    const promise = requestLife({ mode: "FIVE_YEARS", intent: state.intent, facts: state.facts, choices: choiceSummaries(state) });
    fiveYearsRequest.current = promise;
    promise.then(
      (value) => {
        if (session.current === token) setFiveYears({ status: "ready", value });
      },
      (error: unknown) => {
        if (session.current !== token) return;
        fiveYearsRequest.current = null;
        setFiveYears({ status: "error", message: errorMessage(error) });
      },
    );
    return promise;
  };

  // Screens 2-3 -------------------------------------------------------------

  const submitIntent = async () => {
    const spoken = rawText.trim();
    // Chips carry a short label but the model gets the full phrase behind it.
    const intents = planIntents(plans);
    const text =
      spoken ||
      (intents.length > 0
        ? `我打算：${intents.join("、")}。${values.length > 0 ? `我比较看重：${values.join("、")}。` : ""}`
        : "");
    if (!text) {
      setNotice("写一句你的打算，或者至少选一个计划。");
      return;
    }
    setNotice(null);
    session.current += 1;
    const token = session.current;
    setSituations({});
    setExperiences({});
    setUnderstanding({ status: "pending" });
    try {
      const value = await requestUnderstandIntent({ rawText: text, selectedPlans: intents, selectedValues: values });
      if (session.current !== token) return;
      setUnderstanding({ status: "ready", value });
      // Prefetch DAY_8 while the player reads "我理解的是这样，对吗？".
      startSituation("DAY_8", getGameStore().getState(), value.data.result.intent);
    } catch (error) {
      if (session.current === token) setUnderstanding({ status: "error", message: errorMessage(error) });
    }
  };

  const editIntent = () => {
    session.current += 1;
    setUnderstanding(IDLE);
    setSituations({});
    setExperiences({});
  };

  const confirmIntent = () => {
    if (understanding.status !== "ready" || getGameStore().getState().currentStage !== "CREATED") return;
    const { intent: candidate, searchQueries } = understanding.value.data.result;
    if (!dispatch({ type: "CONFIRM_INTENT", intent: { ...candidate, confirmedAt: engineDeps.now() } })) return;
    const slot = situations.DAY_8;
    if (!slot || slot.status === "idle" || slot.status === "error") {
      startSituation("DAY_8", getGameStore().getState(), candidate);
    }
    // Prefetch real experiences for the first chapter once the Intent is confirmed.
    startExperience("DAY_8", { intent: candidate, situation: null, queries: searchQueries });
  };

  // Screens 4-9 -------------------------------------------------------------

  const choosePossibility = (kind: "MOMENTUM" | "UNEXPECTED") => {
    const state = getGameStore().getState();
    const chapter = nextChapter(state);
    if (!chapter || !state.intent || !["INTENT_CONFIRMED", "OUTCOME_RESOLVED"].includes(state.currentStage)) return;
    const slot = situations[chapter];
    if (slot?.status !== "ready") return;
    const candidate = slot.value.data.result;
    const possibility = candidate.possibilities.find((item) => item.kind === kind);
    if (!possibility) return;
    const variant = candidate.variants[kind];
    if (!dispatch({ type: "ADD_SITUATION", situation: variant, selectedPossibilityId: possibility.id })) return;
    setShowPossibilities(false);
    setHovered(0);
    setOutcome(IDLE);
    const existing = experiences[chapter];
    if (chapter !== "DAY_8" || !existing || existing.status === "error") {
      startExperience(chapter, {
        intent: toIntentCandidate(state.intent),
        situation: {
          timeLabel: variant.timeLabel,
          concreteContext: variant.concreteContext.slice(0, 1_200),
          tensions: variant.tensions,
        },
        queries: candidate.searchQueries[kind],
      });
    }
  };

  const resolveOutcome = () => {
    const state = getGameStore().getState();
    const played = state.situations.at(-1);
    const decision = state.decisions.at(-1);
    if (!played || !decision || !state.intent || state.currentStage !== "DECISION_RECORDED") return;
    const token = session.current;
    setOutcome({ status: "pending" });
    requestOutcome({
      intent: toIntentCandidate(state.intent),
      situation: played.situation,
      selectedPossibilityId: played.selectedPossibilityId,
      decision,
      facts: state.facts,
    })
      .then((value) => {
        if (session.current !== token) return;
        if (!dispatch({ type: "APPLY_OUTCOME", outcome: value.data.result })) {
          setOutcome({ status: "error", message: "结果没有通过状态校验，可以重试。" });
          return;
        }
        setOutcome({ status: "ready", value });
        // Prefetch while the player reads the Outcome: the next chapter, or the five-year life.
        const next = getGameStore().getState();
        const chapter = nextChapter(next);
        if (chapter && next.intent) startSituation(chapter, next, toIntentCandidate(next.intent));
        else if (!chapter) startFiveYears(next);
      })
      .catch((error: unknown) => {
        if (session.current === token) setOutcome({ status: "error", message: errorMessage(error) });
      });
  };

  const decide = (action: Action, customText?: string) => {
    const state = getGameStore().getState();
    const played = state.situations.at(-1);
    if (!played || state.currentStage !== "SITUATION_READY") return;
    if (action.kind === "CUSTOM_PLACEHOLDER" && !customText?.trim()) {
      setNotice("写下你自己的办法。");
      return;
    }
    const isKeyDecision = isKeyDecisionTurn(state, played.situation);
    const decision = buildDecision({
      id: engineDeps.createId(),
      decidedAt: engineDeps.now(),
      situation: played.situation,
      action,
      customAction: customText,
      isKeyDecision,
    });
    let keyDecisionSnapshot;
    try {
      // Built by the application from authoritative state, never by AI.
      keyDecisionSnapshot = isKeyDecision ? buildKeyDecisionSnapshot(state, decision.id, engineDeps) : undefined;
    } catch {
      setNotice("关键决定的快照没有生成成功，可以重新开始。");
      return;
    }
    if (!dispatch({ type: "RECORD_DECISION", decision, keyDecisionSnapshot })) return;
    setNotice(null);
    resolveOutcome();
  };

  // Screens 8-15 ------------------------------------------------------------

  const goFiveYears = async () => {
    const state = getGameStore().getState();
    if (state.currentStage !== "LONG_TERM_READY") return;
    const token = session.current;
    const promise = fiveYearsRequest.current ?? startFiveYears(state);
    if (!promise) return;
    setAccelerating(true);
    try {
      const [value] = await Promise.all([promise, wait(FIVE_YEARS_MIN_MS)]);
      if (session.current === token) dispatch({ type: "SET_FIVE_YEAR_LIFE", life: value.data.result.life });
    } catch {
      // The error state was already set by startFiveYears; the button retries.
    } finally {
      if (session.current === token) setAccelerating(false);
    }
  };

  const runCounterfactual = (replacement: string) => {
    const state = getGameStore().getState();
    const snapshot = state.keyDecisionSnapshot;
    const originalLife = state.fiveYearLife;
    const keyChoice = keyChoiceSummary(state);
    if (!snapshot || !originalLife || !keyChoice || state.currentStage !== "FORK_READY") return;
    const token = session.current;
    setParallel({ status: "pending" });
    Promise.all([
      requestLife({
        mode: "COUNTERFACTUAL",
        snapshot,
        facts: snapshotFacts(state),
        keyChoice,
        replacementAction: replacement,
        originalLife,
      }),
      wait(REWIND_MIN_MS),
    ])
      .then(([value]) => {
        if (session.current !== token) return;
        const { life, comparison } = value.data.result;
        // SET_PARALLEL_LIFE keeps FORK_READY; SET_COMPARISON then moves to COMPARISON_READY.
        if (!comparison || !dispatch({ type: "SET_PARALLEL_LIFE", life }) || !dispatch({ type: "SET_COMPARISON", comparison })) {
          setParallel({ status: "error", message: "平行人生没有通过状态校验，可以重试。" });
          return;
        }
        setParallel({ status: "ready", value });
      })
      .catch((error: unknown) => {
        if (session.current === token) setParallel({ status: "error", message: errorMessage(error) });
      });
  };

  const confirmFork = (action: Action, customText?: string) => {
    const state = getGameStore().getState();
    const key = keyDecisionContext(state);
    if (!key || !["REUNION_READY", "FORK_READY"].includes(state.currentStage)) return;
    const replacement = (action.kind === "CUSTOM_PLACEHOLDER" ? (customText ?? "") : action.label).trim();
    if (!replacement) {
      setNotice("写下你想换成的选择。");
      return;
    }
    if (replacement === key.label.trim()) {
      setNotice("换一个和当时不同的选择。");
      return;
    }
    if (state.currentStage === "REUNION_READY" && !dispatch({ type: "OPEN_FORK" })) return;
    const choice = { gameId: state.gameId, text: replacement.slice(0, 400) };
    setForkChoice(choice);
    saveForkChoice(choice);
    setForkPicking(false);
    setNotice(null);
    runCounterfactual(choice.text);
  };

  const reset = () => {
    session.current += 1;
    fiveYearsRequest.current = null;
    getGameStore().reset();
    saveForkChoice(null);
    setHeroOpen(true);
    setHovered(0);
    setUnderstanding(IDLE);
    setSituations({});
    setExperiences({});
    setOutcome(IDLE);
    setShowPossibilities(false);
    setFiveYears(IDLE);
    setAccelerating(false);
    setForkPicking(false);
    setParallel(IDLE);
    setForkChoice(null);
    setNotice(null);
  };

  // Render --------------------------------------------------------------------

  const stage = gameState.currentStage;
  const chapter = nextChapter(gameState);
  const nextSlot = chapter ? situations[chapter] : undefined;
  const firstStep = gameState.intent?.currentActions[0];
  const latestOutcomeId = gameState.outcomes.at(-1)?.id;
  const outcomeBadge =
    outcome.status === "ready" && outcome.value.data.result.id === latestOutcomeId
      ? { generation: outcome.value.data.generation, elapsedMs: outcome.value.elapsedMs }
      : undefined;
  const lifeBadge = (slot: LifeSlot) =>
    slot.status === "ready" ? { generation: slot.value.data.generation, elapsedMs: slot.value.elapsedMs } : undefined;
  const replacement = forkChoice?.gameId === gameState.gameId ? forkChoice.text : null;
  const currentChapter = gameState.situations.at(-1)?.situation.chapter;
  const showHero = stage === "CREATED" && heroOpen && understanding.status === "idle";
  // Act 1 lays out four blocks side by side; every other screen keeps the narrow column.
  const wideStage = stage === "CREATED" && !showHero;
  /*
   * How much of this life has been printed. Paper starts thin — you can see the
   * undetermined lines straight through it — and thickens as Facts get written,
   * until at the end almost nothing shows through. Presentation only: it reads
   * GameState, never writes it.
   */
  const printed = Math.min(1, gameState.facts.length / 12);

  // The line field is the player's life; its shape comes from GameState.
  const fieldUi: FieldUi = {
    heroOpen: showHero,
    understood: understanding.status === "ready",
    viewingNextChapter: showPossibilities,
    possibilitiesReady: nextSlot?.status === "ready",
    hovered,
    wait:
      understanding.status === "pending"
        ? "understanding"
        : stage === "DECISION_RECORDED" && outcome.status === "pending"
          ? "outcome"
          : accelerating
            ? "five-years"
            : parallel.status === "pending"
              ? "rewind"
              : nextSlot?.status === "pending" && (stage === "INTENT_CONFIRMED" || showPossibilities)
                ? "situation"
                : "none",
  };
  const fieldTarget = deriveFieldTarget(gameState, fieldUi);

  let body: React.ReactNode;
  switch (stage) {
    case "CREATED":
      body =
        understanding.status === "ready" ? (
          <IntentConfirm
            understanding={understanding.value}
            prefetchStatus={situations.DAY_8?.status ?? "idle"}
            playerText={rawText.trim() || null}
            onConfirm={confirmIntent}
            onEdit={editIntent}
          />
        ) : showHero ? (
          <Hero onStart={() => setHeroOpen(false)} />
        ) : (
          <IntentInput
            rawText={rawText}
            plans={plans}
            values={values}
            pending={understanding.status === "pending"}
            error={understanding.status === "error" ? understanding.message : null}
            experience={
              // "其他" carries no search phrase, so ticking only it must not arm the button.
              <PlanExperiencePanel
                experience={planExperience}
                enabled={planQueries(plans).length > 0}
                onLoad={loadPlanExperience}
              />
            }
            onTextChange={setRawText}
            onTogglePlan={(plan) => {
              // A different plan deserves a different lookup, so the panel resets.
              setPlanExperience(IDLE);
              setPlans((current) => (current.includes(plan) ? current.filter((item) => item !== plan) : [...current, plan]));
            }}
            onToggleValue={(value) =>
              // Values only shape the Intent, so the Zhihu panel is left alone.
              setValues((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))
            }
            onSubmit={submitIntent}
          />
        );
      break;
    case "INTENT_CONFIRMED":
      body = (
        <Possibilities
          chapter="DAY_8"
          slot={situations.DAY_8 ?? IDLE}
          facts={gameState.facts}
          firstStep={firstStep}
          onChoose={choosePossibility}
          onGenerate={() => ensureSituation("DAY_8")}
          onHover={setHovered}
        />
      );
      break;
    case "SITUATION_READY":
      body = (
        <SituationView
          key={gameState.situations.at(-1)?.situation.id}
          state={gameState}
          onDecide={decide}
          experience={
            currentChapter && isMainChapter(currentChapter) ? <ExperiencePanel experience={experiences[currentChapter]} /> : null
          }
        />
      );
      break;
    case "DECISION_RECORDED":
      body = <OutcomePending state={gameState} status={outcome} onRetry={resolveOutcome} />;
      break;
    case "OUTCOME_RESOLVED":
      body =
        showPossibilities && chapter ? (
          <Possibilities
            chapter={chapter}
            slot={situations[chapter] ?? IDLE}
            facts={gameState.facts}
            firstStep={firstStep}
            onChoose={choosePossibility}
            onGenerate={() => ensureSituation(chapter)}
            onHover={setHovered}
          />
        ) : (
          <OutcomeView
            state={gameState}
            badge={outcomeBadge}
            continueLabel="继续"
            onContinue={() => {
              setShowPossibilities(true);
              if (chapter) ensureSituation(chapter);
            }}
          />
        );
      break;
    case "LONG_TERM_READY":
      body = accelerating ? (
        <FiveYearsTransition state={gameState} />
      ) : (
        <>
          {fiveYears.status === "error" && <p className="error">{fiveYears.message} 点「五年以后」可以重试。</p>}
          <OutcomeView state={gameState} badge={outcomeBadge} continueLabel="五年以后" onContinue={goFiveYears} />
        </>
      );
      break;
    case "REUNION_READY":
      body = forkPicking ? (
        <ForkChooser state={gameState} onConfirm={confirmFork} />
      ) : (
        <ReunionView state={gameState} badge={lifeBadge(fiveYears)} onPickKey={() => setForkPicking(true)} />
      );
      break;
    case "FORK_READY":
      if (parallel.status === "pending" && replacement) {
        body = <RewindTransition state={gameState} replacement={replacement} />;
      } else if (parallel.status === "error" && replacement) {
        body = (
          <section className="screen">
            <p className="error">{parallel.message}</p>
            <div className="row">
              <button className="btn btn-primary" onClick={() => runCounterfactual(replacement)}>
                重试
              </button>
              <button className="btn" onClick={() => setParallel(IDLE)}>
                换一个选择
              </button>
            </div>
          </section>
        );
      } else {
        body = <ForkChooser state={gameState} onConfirm={confirmFork} />;
      }
      break;
    case "COMPARISON_READY":
      body = (
        <ComparisonView
          state={gameState}
          replacement={replacement}
          badge={lifeBadge(parallel)}
          onFinish={() => dispatch({ type: "COMPLETE" })}
        />
      );
      break;
    case "COMPLETED":
      body = <EndingView onRestart={reset} />;
      break;
  }

  return (
    <>
      <Backdrop />
      <LineField target={fieldTarget} seed={gameState.gameId} />
      <div className="shell" style={{ "--printed": printed.toFixed(3) } as React.CSSProperties}>
        <header className="masthead">
          <div className="brand">
            <ForkMark />
            <span className="wordmark">{DISPLAY.wordmark}</span>
          </div>
          <p className="masthead-note">Life, undetermined</p>
          <button className="text-button" onClick={reset}>
            重新开始
          </button>
        </header>
        <main className={wideStage ? "stage stage-wide" : "stage"}>
          {notice && (
            <p className="error" role="alert">
              {notice}
            </p>
          )}
          {body}
        </main>
        <footer className="colophon">
          <span>{ACT_LABELS[Math.min(actIndex(gameState, showPossibilities), ACT_LABELS.length - 1)]}</span>
          <span>每一个选择，都会留下一条线</span>
        </footer>
      </div>
    </>
  );
}

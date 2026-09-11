"use client";

import { useRef, useState } from "react";

import type {
  GenerateSituationResponseData,
  IntentCandidate,
  MainChapter,
  ResolveOutcomeResponseData,
  UnderstandIntentResponseData,
} from "@/ai/contracts";
import type { Action } from "@/contracts/game";
import type { GameAction, GameState } from "@/game-state";
import { buildDecision, isKeyDecisionTurn, nextChapter, previousChoices, toIntentCandidate } from "@/game/flow";
import { buildKeyDecisionSnapshot } from "@/game/key-snapshot";

import { errorMessage, requestOutcome, requestSituation, requestUnderstandIntent, type Timed } from "./ai-client";
import { engineDeps, getGameStore, useGameState } from "./client-store";
import {
  IntentConfirm,
  IntentInput,
  OutcomePending,
  OutcomeView,
  Possibilities,
  SituationView,
  type Async,
} from "./screens";

type SituationSlots = Partial<Record<MainChapter, Async<Timed<GenerateSituationResponseData>>>>;

const IDLE = { status: "idle" } as const;

export default function PlayPage() {
  const gameState = useGameState();
  const [rawText, setRawText] = useState("");
  const [plans, setPlans] = useState<string[]>([]);
  const [understanding, setUnderstanding] = useState<Async<Timed<UnderstandIntentResponseData>>>(IDLE);
  const [situations, setSituations] = useState<SituationSlots>({});
  const [outcome, setOutcome] = useState<Async<Timed<ResolveOutcomeResponseData>>>(IDLE);
  const [showPossibilities, setShowPossibilities] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Bumped on reset/edit so late responses from an abandoned run are ignored.
  const session = useRef(0);

  if (!gameState) return <main>加载中…</main>;

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

  // Screens 2-3 -------------------------------------------------------------

  const submitIntent = async () => {
    const text = rawText.trim() || (plans.length > 0 ? `我打算：${plans.join("、")}。` : "");
    if (!text) {
      setNotice("写一句你的打算，或者至少选一个计划。");
      return;
    }
    setNotice(null);
    session.current += 1;
    const token = session.current;
    setSituations({});
    setUnderstanding({ status: "pending" });
    try {
      const value = await requestUnderstandIntent({ rawText: text, selectedPlans: plans });
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
  };

  const confirmIntent = () => {
    if (understanding.status !== "ready" || getGameStore().getState().currentStage !== "CREATED") return;
    const candidate = understanding.value.data.result.intent;
    if (!dispatch({ type: "CONFIRM_INTENT", intent: { ...candidate, confirmedAt: engineDeps.now() } })) return;
    const slot = situations.DAY_8;
    if (!slot || slot.status === "idle" || slot.status === "error") {
      startSituation("DAY_8", getGameStore().getState(), candidate);
    }
  };

  // Screens 4-6 -------------------------------------------------------------

  const choosePossibility = (kind: "MOMENTUM" | "UNEXPECTED") => {
    const state = getGameStore().getState();
    const chapter = nextChapter(state);
    if (!chapter || !["INTENT_CONFIRMED", "OUTCOME_RESOLVED"].includes(state.currentStage)) return;
    const slot = situations[chapter];
    if (slot?.status !== "ready") return;
    const candidate = slot.value.data.result;
    const possibility = candidate.possibilities.find((item) => item.kind === kind);
    if (!possibility) return;
    if (dispatch({ type: "ADD_SITUATION", situation: candidate.variants[kind], selectedPossibilityId: possibility.id })) {
      setShowPossibilities(false);
      setOutcome(IDLE);
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
        // Prefetch the next chapter while the player reads the Outcome.
        const next = getGameStore().getState();
        const chapter = nextChapter(next);
        if (chapter && next.intent) startSituation(chapter, next, toIntentCandidate(next.intent));
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

  const reset = () => {
    session.current += 1;
    getGameStore().reset();
    setUnderstanding(IDLE);
    setSituations({});
    setOutcome(IDLE);
    setShowPossibilities(false);
    setNotice(null);
  };

  // Render --------------------------------------------------------------------

  const stage = gameState.currentStage;
  const chapter = nextChapter(gameState);
  const latestOutcomeId = gameState.outcomes.at(-1)?.id;
  const outcomeBadge =
    outcome.status === "ready" && outcome.value.data.result.id === latestOutcomeId
      ? { generation: outcome.value.data.generation, elapsedMs: outcome.value.elapsedMs }
      : undefined;

  let body: React.ReactNode;
  switch (stage) {
    case "CREATED":
      body =
        understanding.status === "ready" ? (
          <IntentConfirm
            understanding={understanding.value}
            prefetchStatus={situations.DAY_8?.status ?? "idle"}
            onConfirm={confirmIntent}
            onEdit={editIntent}
          />
        ) : (
          <IntentInput
            rawText={rawText}
            plans={plans}
            pending={understanding.status === "pending"}
            error={understanding.status === "error" ? understanding.message : null}
            onTextChange={setRawText}
            onTogglePlan={(plan) =>
              setPlans((current) => (current.includes(plan) ? current.filter((item) => item !== plan) : [...current, plan]))
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
          onChoose={choosePossibility}
          onGenerate={() => ensureSituation("DAY_8")}
        />
      );
      break;
    case "SITUATION_READY":
      body = <SituationView key={gameState.situations.at(-1)?.situation.id} state={gameState} onDecide={decide} />;
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
            onChoose={choosePossibility}
            onGenerate={() => ensureSituation(chapter)}
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
      body = (
        <OutcomeView
          state={gameState}
          badge={outcomeBadge}
          continueLabel="五年以后"
          onContinue={() => setNotice("五年后的生活将在下一步接入。")}
        />
      );
      break;
    default:
      body = (
        <div className="card">
          <p>当前进度（{stage}）的后续流程将在下一步接入。</p>
        </div>
      );
  }

  return (
    <main>
      <div className="topbar">
        <div>
          <h1>五年以后，你会在哪里？</h1>
          <p className="muted">毕业以后的人生，没有标准答案。你可以亲自走一条路。</p>
        </div>
        <button onClick={reset}>重新开始</button>
      </div>
      {notice && <p className="error">{notice}</p>}
      {body}
    </main>
  );
}

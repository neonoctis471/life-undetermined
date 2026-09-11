"use client";

import { useRef, useState, useSyncExternalStore } from "react";

import type {
  GenerateSituationResponseData,
  IntentCandidate,
  UnderstandIntentResponseData,
} from "@/ai/contracts";
import type { Intent } from "@/contracts/game";
import {
  createGameStateStore,
  createGameStorage,
  type GameState,
  type GameStateStore,
  type StorageLike,
} from "@/game-state";

import { AiCallError, requestSituation, requestUnderstandIntent, type Timed } from "./ai-client";

const PLAN_OPTIONS = [
  "找专业相关工作",
  "先找一份能养活自己的工作",
  "考研",
  "考公 / 考编",
  "学习新的职业技能",
  "自由职业 / 接单",
  "做自媒体",
  "尝试创业",
  "回家发展",
  "帮家里做生意",
  "去别的城市试试",
  "先休息一段时间",
];

type Async<T> =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string }
  | { status: "ready"; value: T };

// ---------------------------------------------------------------------------
// Client-side GameState store (localStorage, falls back to memory)
// ---------------------------------------------------------------------------

let clientStore: { store: GameStateStore; snapshot: GameState } | null = null;

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

function getClientStore() {
  if (!clientStore) {
    const engine = { createId: () => crypto.randomUUID(), now: () => new Date().toISOString() };
    let store: GameStateStore;
    try {
      store = createGameStateStore({ storage: createGameStorage(window.localStorage), engine });
    } catch {
      store = createGameStateStore({ storage: createGameStorage(memoryStorage()), engine });
    }
    const holder = { store, snapshot: store.getState() };
    store.subscribe((state) => {
      holder.snapshot = state;
    });
    clientStore = holder;
  }
  return clientStore;
}

function subscribe(onChange: () => void) {
  const unsubscribe = getClientStore().store.subscribe(() => onChange());
  return () => {
    unsubscribe();
  };
}

const getSnapshot = (): GameState | null => getClientStore().snapshot;
const getServerSnapshot = (): GameState | null => null;

function toCandidate(intent: Intent): IntentCandidate {
  return {
    rawText: intent.rawText,
    goals: intent.goals,
    priorities: intent.priorities,
    constraints: intent.constraints,
    currentActions: intent.currentActions,
  };
}

const errorMessage = (error: unknown) => (error instanceof AiCallError ? error.message : "出了点问题，请重试。");

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlayPage() {
  const gameState = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [rawText, setRawText] = useState("");
  const [plans, setPlans] = useState<string[]>([]);
  const [understanding, setUnderstanding] = useState<Async<Timed<UnderstandIntentResponseData>>>({ status: "idle" });
  const [situation, setSituation] = useState<Async<Timed<GenerateSituationResponseData>>>({ status: "idle" });
  const [pickedAction, setPickedAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestToken = useRef(0);

  if (!gameState) return <main>加载中…</main>;

  const dispatch = (action: Parameters<GameStateStore["dispatch"]>[0]) => {
    try {
      getClientStore().store.dispatch(action);
      return true;
    } catch {
      setNotice("状态校验没有通过，这一步没有写入。可以重新开始。");
      return false;
    }
  };

  const startSituation = (intent: IntentCandidate) => {
    const token = requestToken.current;
    setSituation({ status: "pending" });
    requestSituation({ chapter: "DAY_8", intent, facts: [], previousChoices: [] })
      .then((value) => {
        if (requestToken.current === token) setSituation({ status: "ready", value });
      })
      .catch((error: unknown) => {
        if (requestToken.current === token) setSituation({ status: "error", message: errorMessage(error) });
      });
  };

  const submitIntent = async () => {
    const text = rawText.trim() || (plans.length > 0 ? `我打算：${plans.join("、")}。` : "");
    if (!text) {
      setNotice("写一句你的打算，或者至少选一个计划。");
      return;
    }
    setNotice(null);
    requestToken.current += 1;
    const token = requestToken.current;
    setSituation({ status: "idle" });
    setUnderstanding({ status: "pending" });
    try {
      const value = await requestUnderstandIntent({ rawText: text, selectedPlans: plans });
      if (requestToken.current !== token) return;
      setUnderstanding({ status: "ready", value });
      // Prefetch DAY_8 while the player reads "我理解的是这样，对吗？".
      startSituation(value.data.result.intent);
    } catch (error) {
      if (requestToken.current === token) setUnderstanding({ status: "error", message: errorMessage(error) });
    }
  };

  const editIntent = () => {
    requestToken.current += 1;
    setUnderstanding({ status: "idle" });
    setSituation({ status: "idle" });
  };

  const confirmIntent = () => {
    if (understanding.status !== "ready") return;
    const candidate = understanding.value.data.result.intent;
    if (!dispatch({ type: "CONFIRM_INTENT", intent: { ...candidate, confirmedAt: new Date().toISOString() } })) return;
    if (situation.status === "idle" || situation.status === "error") startSituation(candidate);
  };

  const choosePossibility = (kind: "MOMENTUM" | "UNEXPECTED") => {
    if (situation.status !== "ready") return;
    const candidate = situation.value.data.result;
    const possibility = candidate.possibilities.find((item) => item.kind === kind);
    if (!possibility) return;
    setPickedAction(null);
    dispatch({ type: "ADD_SITUATION", situation: candidate.variants[kind], selectedPossibilityId: possibility.id });
  };

  const reset = () => {
    requestToken.current += 1;
    getClientStore().store.reset();
    setUnderstanding({ status: "idle" });
    setSituation({ status: "idle" });
    setPickedAction(null);
    setNotice(null);
  };

  const stage = gameState.currentStage;

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

      {stage === "CREATED" && understanding.status !== "ready" && (
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
      )}

      {stage === "CREATED" && understanding.status === "ready" && (
        <IntentConfirm
          understanding={understanding.value}
          situationStatus={situation.status}
          onConfirm={confirmIntent}
          onEdit={editIntent}
        />
      )}

      {stage === "INTENT_CONFIRMED" && (
        <Possibilities
          situation={situation}
          onChoose={choosePossibility}
          onGenerate={() => gameState.intent && startSituation(toCandidate(gameState.intent))}
        />
      )}

      {stage === "SITUATION_READY" && (
        <SituationView gameState={gameState} pickedAction={pickedAction} onPickAction={setPickedAction} />
      )}

      {!["CREATED", "INTENT_CONFIRMED", "SITUATION_READY"].includes(stage) && (
        <div className="card">
          <p>当前进度（{stage}）的后续流程将在下一阶段接入。</p>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function IntentInput(props: {
  rawText: string;
  plans: string[];
  pending: boolean;
  error: string | null;
  onTextChange(value: string): void;
  onTogglePlan(plan: string): void;
  onSubmit(): void;
}) {
  return (
    <section>
      <h2>毕业了，你准备怎样开始？</h2>
      <p className="muted">可以多选，也可以直接说说自己的打算。</p>
      <div className="row">
        {PLAN_OPTIONS.map((plan) => (
          <button
            key={plan}
            className="chip"
            aria-pressed={props.plans.includes(plan)}
            onClick={() => props.onTogglePlan(plan)}
            disabled={props.pending}
          >
            {plan}
          </button>
        ))}
      </div>
      <textarea
        value={props.rawText}
        maxLength={1_000}
        disabled={props.pending}
        placeholder="例如：我想先回家帮家里做店里的事情，同时学剪辑试着拍视频。如果几个月还是没什么感觉，我可能会再找工作。"
        onChange={(event) => props.onTextChange(event.target.value)}
      />
      <div className="row">
        <button className="primary" onClick={props.onSubmit} disabled={props.pending}>
          {props.pending ? "正在理解你的打算…" : "就这样开始"}
        </button>
      </div>
      {props.error && <p className="error">{props.error}</p>}
    </section>
  );
}

function GenerationBadge({ generation, elapsedMs }: { generation: "AI" | "FALLBACK"; elapsedMs: number }) {
  return (
    <p className="muted">
      <span className={generation === "AI" ? "badge" : "badge fallback"}>
        {generation === "AI" ? "AI 生成" : "保守模板（AI 暂不可用）"}
      </span>
      耗时 {(elapsedMs / 1000).toFixed(1)}s
    </p>
  );
}

function IntentConfirm(props: {
  understanding: Timed<UnderstandIntentResponseData>;
  situationStatus: Async<unknown>["status"];
  onConfirm(): void;
  onEdit(): void;
}) {
  const { summary, intent } = props.understanding.data.result;
  return (
    <section>
      <h2>我理解的是这样，对吗？</h2>
      <div className="card">
        <GenerationBadge generation={props.understanding.data.generation} elapsedMs={props.understanding.elapsedMs} />
        <p>{summary}</p>
        <p>
          <strong>想做成的事：</strong>
          {intent.goals.join("；")}
        </p>
        <p>
          <strong>当前最重要的：</strong>
          {intent.priorities.join("；")}
        </p>
        {intent.constraints.length > 0 && (
          <p>
            <strong>限制：</strong>
            {intent.constraints.join("；")}
          </p>
        )}
        <p>
          <strong>第一步：</strong>
          {intent.currentActions.join("；")}
        </p>
      </div>
      <div className="row">
        <button className="primary" onClick={props.onConfirm}>
          对，就是这样
        </button>
        <button onClick={props.onEdit}>我想改一下</button>
      </div>
      <p className="muted">
        第 8 天的生活：
        {props.situationStatus === "pending" ? "正在后台准备…" : props.situationStatus === "ready" ? "已准备好" : "确认后开始准备"}
      </p>
    </section>
  );
}

function Possibilities(props: {
  situation: Async<Timed<GenerateSituationResponseData>>;
  onChoose(kind: "MOMENTUM" | "UNEXPECTED"): void;
  onGenerate(): void;
}) {
  const { situation } = props;
  return (
    <section>
      <h2>毕业后的第 8 天 · 生活可能这样展开</h2>
      {situation.status === "idle" && (
        <button className="primary" onClick={props.onGenerate}>
          继续
        </button>
      )}
      {situation.status === "pending" && <p>正在生成第 8 天的生活…</p>}
      {situation.status === "error" && (
        <>
          <p className="error">{situation.message}</p>
          <button onClick={props.onGenerate}>重试</button>
        </>
      )}
      {situation.status === "ready" && (
        <>
          <GenerationBadge generation={situation.value.data.generation} elapsedMs={situation.value.elapsedMs} />
          {situation.value.data.result.possibilities.map((possibility) => (
            <div className="card" key={possibility.id}>
              <h3>{possibility.title}</h3>
              <p>{possibility.summary}</p>
              <button onClick={() => props.onChoose(possibility.kind)}>看看这种可能</button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function SituationView(props: {
  gameState: GameState;
  pickedAction: string | null;
  onPickAction(label: string): void;
}) {
  const played = props.gameState.situations.at(-1);
  if (!played) return null;
  const { situation } = played;
  const possibility = situation.possibilities.find((item) => item.id === played.selectedPossibilityId);
  return (
    <section>
      <h2>
        {situation.timeLabel} · {possibility?.title}
      </h2>
      <div className="card">
        <p className="scene">{situation.concreteContext}</p>
        <p className="muted">此刻的张力：{situation.tensions.join(" / ")}</p>
        {situation.externalConditions.length > 0 && (
          <p className="muted">外部条件：{situation.externalConditions.join(" / ")}</p>
        )}
      </div>
      <h2>你准备怎么办？</h2>
      <div className="row">
        {situation.availableActions.map((action) => (
          <button
            key={action.id}
            aria-pressed={props.pickedAction === action.label}
            className="chip"
            onClick={() => props.onPickAction(action.label)}
          >
            {action.label}
          </button>
        ))}
      </div>
      {props.pickedAction && (
        <p className="muted">你选择了「{props.pickedAction}」。结果生成（RESOLVE_OUTCOME）将在下一阶段接入。</p>
      )}
    </section>
  );
}

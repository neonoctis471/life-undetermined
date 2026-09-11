"use client";

import { useState, type CSSProperties } from "react";

import type {
  GenerateSituationResponseData,
  MainChapter,
  UnderstandIntentResponseData,
} from "@/ai/contracts";
import type { Action, Fact } from "@/contracts/game";
import type { GameState } from "@/game-state";
import { describeDecisionAction } from "@/game/labels";

import type { Timed } from "./ai-client";

export type Async<T> =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string }
  | { status: "ready"; value: T };

export const PLAN_OPTIONS = [
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

const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

export function GenerationBadge({ generation, elapsedMs }: { generation: "AI" | "FALLBACK"; elapsedMs?: number }) {
  return (
    <p className="muted">
      <span className={generation === "AI" ? "badge" : "badge fallback"}>
        {generation === "AI" ? "AI 生成" : "保守模板（AI 暂不可用）"}
      </span>
      {elapsedMs !== undefined && `耗时 ${(elapsedMs / 1000).toFixed(1)}s`}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Screens 2-3: plan input and AI understanding
// ---------------------------------------------------------------------------

export function IntentInput(props: {
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

export function IntentConfirm(props: {
  understanding: Timed<UnderstandIntentResponseData>;
  prefetchStatus: Async<unknown>["status"];
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
        {props.prefetchStatus === "pending" ? "正在后台准备…" : props.prefetchStatus === "ready" ? "已准备好" : "确认后开始准备"}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Screens 4/7/9: two possibilities (with time acceleration before YEAR_4)
// ---------------------------------------------------------------------------

const CHAPTER_HEADINGS: Record<MainChapter, string> = {
  DAY_8: "毕业后的第 8 天 · 生活可能这样展开",
  MONTH_7: "毕业后的第 7 个月 · 新的可能",
  YEAR_4: "毕业后的第 4 年 · 一个重要的决定",
};

export interface TimeStep {
  label: string;
  lines: string[];
}

/** Years (or a rewind) moving past, used as a meaningful wait instead of a spinner. */
export function TimeAdvance({ steps, caption }: { steps: TimeStep[]; caption: string }) {
  const starts = steps.reduce<number[]>((acc, _step, index) => {
    acc.push(index === 0 ? 0 : acc[index - 1]! + 1.4 + steps[index - 1]!.lines.length * 0.9);
    return acc;
  }, []);
  const end = steps.length > 0 ? starts.at(-1)! + 1.4 + steps.at(-1)!.lines.length * 0.9 : 0;
  return (
    <div className="card">
      <p className="muted">{caption}</p>
      <div className="timeline">
        {steps.map((step, index) => (
          <div key={step.label}>
            <p className="year beat" style={delay(starts[index]!)}>
              {step.label}
            </p>
            {step.lines.map((line, lineIndex) => (
              <p key={line} className="beat muted" style={delay(starts[index]! + 0.9 * (lineIndex + 1))}>
                {line}
              </p>
            ))}
          </div>
        ))}
        <p className="beat" style={delay(end)}>
          <span className="pulse">……</span>
        </p>
      </div>
    </div>
  );
}

export function yearsUntilYear4(facts: readonly Fact[]): TimeStep[] {
  const statements = facts.map(({ statement }) => statement);
  return [
    { label: "毕业", lines: [] },
    { label: "一年", lines: statements.slice(0, 2) },
    { label: "两年", lines: statements.slice(2, 4) },
    { label: "三年", lines: statements.slice(4, 6) },
    { label: "四年", lines: [] },
  ];
}

export function Possibilities(props: {
  chapter: MainChapter;
  slot: Async<Timed<GenerateSituationResponseData>>;
  facts: readonly Fact[];
  onChoose(kind: "MOMENTUM" | "UNEXPECTED"): void;
  onGenerate(): void;
}) {
  const { slot } = props;
  return (
    <section>
      <h2>{CHAPTER_HEADINGS[props.chapter]}</h2>
      {slot.status === "idle" && (
        <button className="primary" onClick={props.onGenerate}>
          继续
        </button>
      )}
      {slot.status === "pending" &&
        (props.chapter === "YEAR_4" ? (
          <TimeAdvance steps={yearsUntilYear4(props.facts)} caption="时间开始加速……" />
        ) : (
          <p className="pulse">生活正在展开……</p>
        ))}
      {slot.status === "error" && (
        <>
          <p className="error">{slot.message}</p>
          <button onClick={props.onGenerate}>重试</button>
        </>
      )}
      {slot.status === "ready" && (
        <>
          <GenerationBadge generation={slot.value.data.generation} elapsedMs={slot.value.elapsedMs} />
          {slot.value.data.result.possibilities.map((possibility) => (
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

// ---------------------------------------------------------------------------
// Screens 5/7/9: concrete Situation and Decision
// ---------------------------------------------------------------------------

export function SituationView(props: { state: GameState; onDecide(action: Action, customText?: string): void }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const played = props.state.situations.at(-1);
  if (!played) return null;
  const { situation } = played;
  const possibility = situation.possibilities.find((item) => item.id === played.selectedPossibilityId);
  const isKeyTurn = situation.chapter === "YEAR_4" && props.state.keyDecisionSnapshot === null;
  const custom = situation.availableActions.find((action) => action.kind === "CUSTOM_PLACEHOLDER");

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
      {isKeyTurn && <p className="muted">这是一个会影响之后几年的决定。五年以后，你还可以回到这里，看看另一种选择。</p>}
      <div className="actions">
        {situation.availableActions.map((action) =>
          action.kind === "PRESET" ? (
            <button key={action.id} className="action" onClick={() => props.onDecide(action)}>
              {action.label}
            </button>
          ) : (
            <button key={action.id} className="action" aria-pressed={customOpen} onClick={() => setCustomOpen(true)}>
              {action.label}
            </button>
          ),
        )}
      </div>
      {customOpen && custom && (
        <div className="card">
          <textarea
            value={customText}
            maxLength={200}
            placeholder="写下你打算怎么做"
            onChange={(event) => setCustomText(event.target.value)}
          />
          <div className="row">
            <button className="primary" disabled={!customText.trim()} onClick={() => props.onDecide(custom, customText)}>
              就这么做
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Screen 6: waiting for and reading the Outcome
// ---------------------------------------------------------------------------

export function OutcomePending(props: { state: GameState; status: Async<unknown>; onRetry(): void }) {
  const decision = props.state.decisions.at(-1);
  const situation = props.state.situations.at(-1)?.situation;
  if (!decision || !situation) return null;
  const label = describeDecisionAction(decision, situation);
  const { status } = props;
  return (
    <section>
      <h2>{situation.timeLabel}</h2>
      <div className="card">
        <p className="muted">你决定：</p>
        <p className="echo">「{label}」</p>
        {status.status === "pending" && (
          <>
            <div className="progress">
              <span />
            </div>
            <p className="beat muted" style={delay(0.6)}>
              你照着这个决定做了下去。
            </p>
            <p className="beat muted" style={delay(2.2)}>
              身边的人有了各自的反应。
            </p>
            <p className="beat muted" style={delay(3.8)}>
              几天以后……
            </p>
          </>
        )}
        {status.status === "error" && (
          <>
            <p className="error">{status.message}</p>
            <button onClick={props.onRetry}>重试</button>
          </>
        )}
        {status.status === "idle" && (
          <button className="primary" onClick={props.onRetry}>
            看看后来发生了什么
          </button>
        )}
      </div>
    </section>
  );
}

export function OutcomeView(props: {
  state: GameState;
  badge?: { generation: "AI" | "FALLBACK"; elapsedMs?: number };
  continueLabel: string;
  onContinue(): void;
}) {
  const outcome = props.state.outcomes.at(-1);
  const situation = props.state.situations.at(-1)?.situation;
  if (!outcome || !situation) return null;
  const facts = props.state.facts.slice(-outcome.addedFacts.length);
  return (
    <section>
      <h2>{situation.timeLabel} · 后来</h2>
      <div className="card">
        {props.badge && <GenerationBadge generation={props.badge.generation} elapsedMs={props.badge.elapsedMs} />}
        {outcome.validation === "FALLBACK" && !props.badge && <GenerationBadge generation="FALLBACK" />}
        <p className="scene">{outcome.narrative}</p>
        {outcome.gains.length > 0 && <p className="muted">收获：{outcome.gains.join(" / ")}</p>}
        {outcome.costs.length > 0 && <p className="muted">代价：{outcome.costs.join(" / ")}</p>}
        {outcome.unresolvedConsequences.length > 0 && (
          <p className="muted">还没解决的：{outcome.unresolvedConsequences.join(" / ")}</p>
        )}
      </div>
      <h2>现在真正发生了</h2>
      <ul className="facts">
        {facts.map((fact) => (
          <li key={fact.id}>✓ {fact.statement}</li>
        ))}
      </ul>
      <div className="row">
        <button className="primary" onClick={props.onContinue}>
          {props.continueLabel}
        </button>
      </div>
    </section>
  );
}

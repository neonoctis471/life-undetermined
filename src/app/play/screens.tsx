"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import type {
  GenerateSituationResponseData,
  MainChapter,
  UnderstandIntentResponseData,
} from "@/ai/contracts";
import type { Action, Fact } from "@/contracts/game";
import type { GameState } from "@/game-state";
import { describeDecisionAction } from "@/game/labels";

import type { Timed } from "./ai-client";
import { DISPLAY } from "./copy";
import type { Side } from "./field/target";
import { PLAN_GROUPS } from "./plans";

export type Async<T> =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string }
  | { status: "ready"; value: T };

const MAIN_CHAPTERS: readonly string[] = ["DAY_8", "MONTH_7", "YEAR_4"];
export const isMainChapter = (chapter: string): chapter is MainChapter => MAIN_CHAPTERS.includes(chapter);

const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

/** Eyebrow + heavy title. Both strings are fixed copy (display font). */
export function ScreenHead({ eyebrow, title, level = 2 }: { eyebrow: string; title: string; level?: 1 | 2 }) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className="screen-head">
      <p className="eyebrow">{eyebrow}</p>
      <Heading className="display-title">{title}</Heading>
    </header>
  );
}

export function Chevron() {
  return (
    <svg className="chevron" width="9" height="16" viewBox="0 0 9 16" aria-hidden="true" focusable="false">
      <path d="M1 1l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function GenerationBadge({ generation, elapsedMs }: { generation: "AI" | "FALLBACK"; elapsedMs?: number }) {
  return (
    <p className="meta">
      <span className={generation === "AI" ? "tag" : "tag tag-fallback"}>
        {generation === "AI" ? "AI 生成" : "保守模板（AI 暂不可用）"}
      </span>
      {elapsedMs !== undefined && `耗时 ${(elapsedMs / 1000).toFixed(1)}s`}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Screen 1: the undetermined field
// ---------------------------------------------------------------------------

export function Hero({ onStart }: { onStart(): void }) {
  return (
    <section className="screen hero" aria-labelledby="hero-title">
      <p className="eyebrow">{DISPLAY.eyebrows.prologue}</p>
      <h1 id="hero-title" className="hero-title">
        <span>{DISPLAY.heroTitle[0]}</span>
        <span>{DISPLAY.heroTitle[1]}</span>
      </h1>
      <p className="hero-subtitle">{DISPLAY.heroSubtitle}</p>
      <p className="lede">毕业以后的人生没有标准答案。背后这些线，每一条都是一种还没有发生的可能。</p>
      <div className="row">
        <button className="btn btn-primary" onClick={onStart}>
          {DISPLAY.start}
        </button>
      </div>
    </section>
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
  /** Real Zhihu experiences for the ticked plans; rendered between chips and free text. */
  experience?: ReactNode;
  onTextChange(value: string): void;
  onTogglePlan(plan: string): void;
  onSubmit(): void;
}) {
  return (
    <section className="screen">
      <ScreenHead eyebrow={DISPLAY.eyebrows.prologue} title={DISPLAY.intentTitle} />
      <p className="lede">可以多选，也可以直接说说自己的打算。</p>
      {PLAN_GROUPS.map((group) => (
        <div className="plan-group" key={group.title}>
          <p className="plan-group-title">{group.title}</p>
          <div className="plan-grid" role="group" aria-label={group.title}>
            {group.options.map((option) => (
              <button
                key={option.label}
                className="chip"
                aria-pressed={props.plans.includes(option.label)}
                onClick={() => props.onTogglePlan(option.label)}
                disabled={props.pending}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {props.experience}
      <label className="field-label" htmlFor="intent-text">
        我真正的想法
      </label>
      <textarea
        id="intent-text"
        value={props.rawText}
        maxLength={1_000}
        disabled={props.pending}
        placeholder="例如：我想先回家帮家里做店里的事情，同时学剪辑试着拍视频。如果几个月还是没什么感觉，我可能会再找工作。"
        onChange={(event) => props.onTextChange(event.target.value)}
      />
      <div className="row">
        <button className="btn btn-primary" onClick={props.onSubmit} disabled={props.pending}>
          {props.pending ? "正在理解你的打算…" : "就这样开始"}
        </button>
      </div>
      {props.error && (
        <p className="error" role="alert">
          {props.error}
        </p>
      )}
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
    <section className="screen">
      <ScreenHead eyebrow={DISPLAY.eyebrows.prologue} title={DISPLAY.confirmTitle} />
      <GenerationBadge generation={props.understanding.data.generation} elapsedMs={props.understanding.elapsedMs} />
      <p className="statement">{summary}</p>
      <dl className="ledger">
        <div>
          <dt>想做成的事</dt>
          <dd>{intent.goals.join("；")}</dd>
        </div>
        <div>
          <dt>当前最重要的</dt>
          <dd>{intent.priorities.join("；")}</dd>
        </div>
        {intent.constraints.length > 0 && (
          <div>
            <dt>限制</dt>
            <dd>{intent.constraints.join("；")}</dd>
          </div>
        )}
        <div>
          <dt>第一步</dt>
          <dd>{intent.currentActions.join("；")}</dd>
        </div>
      </dl>
      <div className="row">
        <button className="btn btn-primary" onClick={props.onConfirm}>
          对，就是这样
        </button>
        <button className="btn" onClick={props.onEdit}>
          我想改一下
        </button>
      </div>
      <p className="meta">
        第 8 天的生活：
        {props.prefetchStatus === "pending" ? "正在后台准备…" : props.prefetchStatus === "ready" ? "已准备好" : "确认后开始准备"}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Screens 4/7/9: two possibilities (with time acceleration before YEAR_4)
// ---------------------------------------------------------------------------

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
      <p className="meta">{caption}</p>
      <div className="timeline">
        {steps.map((step, index) => (
          <div key={`${index}-${step.label}`}>
            <p className="year beat" style={delay(starts[index]!)}>
              {step.label}
            </p>
            {step.lines.map((line, lineIndex) => (
              <p key={`${lineIndex}-${line}`} className="beat" style={delay(starts[index]! + 0.9 * (lineIndex + 1))}>
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

/** Shown when the player arrives before the prefetched Situation (e.g. a quick confirm). */
function SituationPending(props: { chapter: "DAY_8" | "MONTH_7"; facts: readonly Fact[]; firstStep?: string }) {
  const lines =
    props.chapter === "DAY_8"
      ? [
          props.firstStep ? `你开始了第一步：${props.firstStep}。` : "你按自己的打算迈出了第一步。",
          "有些事比想象中顺，有些事没那么顺。",
          "毕业后的第 8 天……",
        ]
      : ["几个月过去了。", ...props.facts.slice(-2).map(({ statement }) => statement), "毕业后的第 7 个月……"];
  return (
    <div className="card">
      <div className="progress">
        <span style={{ animationDuration: "25s" }} />
      </div>
      {lines.map((line, index) => (
        <p key={`${index}-${line}`} className="beat" style={delay(0.4 + index * 1.6)}>
          {line}
        </p>
      ))}
      <p className="beat" style={delay(0.4 + lines.length * 1.6)}>
        <span className="pulse">……</span>
      </p>
    </div>
  );
}

export function Possibilities(props: {
  chapter: MainChapter;
  slot: Async<Timed<GenerateSituationResponseData>>;
  facts: readonly Fact[];
  firstStep?: string;
  onChoose(kind: "MOMENTUM" | "UNEXPECTED"): void;
  onGenerate(): void;
  onHover(side: Side): void;
}) {
  const { slot } = props;
  return (
    <section className="screen">
      <ScreenHead eyebrow={DISPLAY.eyebrows[props.chapter]} title={DISPLAY.chapterTitles[props.chapter]} />
      {slot.status === "idle" && (
        <button className="btn btn-primary" onClick={props.onGenerate}>
          继续
        </button>
      )}
      {slot.status === "pending" &&
        (props.chapter === "YEAR_4" ? (
          <TimeAdvance steps={yearsUntilYear4(props.facts)} caption="时间开始加速……" />
        ) : (
          <SituationPending chapter={props.chapter} facts={props.facts} firstStep={props.firstStep} />
        ))}
      {slot.status === "error" && (
        <>
          <p className="error">{slot.message}</p>
          <button className="btn" onClick={props.onGenerate}>
            重试
          </button>
        </>
      )}
      {slot.status === "ready" && (
        <>
          <GenerationBadge generation={slot.value.data.generation} elapsedMs={slot.value.elapsedMs} />
          <ol className="possibility-list">
            {slot.value.data.result.possibilities.map((possibility, index) => {
              const side: Side = possibility.kind === "MOMENTUM" ? 1 : -1;
              return (
                <li
                  key={possibility.id}
                  className="possibility"
                  onPointerEnter={() => props.onHover(side)}
                  onPointerLeave={() => props.onHover(0)}
                >
                  <p className="index">0{index + 1}</p>
                  <h3 className="possibility-title">{DISPLAY.possibilityTitles[possibility.kind]}</h3>
                  <p className="possibility-summary">{possibility.summary}</p>
                  <div>
                    <button
                      className="btn"
                      onFocus={() => props.onHover(side)}
                      onBlur={() => props.onHover(0)}
                      onClick={() => props.onChoose(possibility.kind)}
                    >
                      看看这种可能
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Screens 5/7/9: concrete Situation and Decision
// ---------------------------------------------------------------------------

export function SituationView(props: {
  state: GameState;
  onDecide(action: Action, customText?: string): void;
  /** Optional experience cards; never blocks the decision. */
  experience?: React.ReactNode;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const played = props.state.situations.at(-1);
  if (!played) return null;
  const { situation } = played;
  const possibility = situation.possibilities.find((item) => item.id === played.selectedPossibilityId);
  const isKeyTurn = situation.chapter === "YEAR_4" && props.state.keyDecisionSnapshot === null;
  const custom = situation.availableActions.find((action) => action.kind === "CUSTOM_PLACEHOLDER");
  const eyebrow = isMainChapter(situation.chapter) ? DISPLAY.eyebrows[situation.chapter] : situation.timeLabel;
  const title = possibility ? DISPLAY.possibilityTitles[possibility.kind] : DISPLAY.decideTitle;

  return (
    <section className="screen">
      <ScreenHead eyebrow={eyebrow} title={title} />
      <p className="scene">{situation.concreteContext}</p>
      <p className="meta">此刻的张力：{situation.tensions.join(" / ")}</p>
      {situation.externalConditions.length > 0 && (
        <p className="meta">外部条件：{situation.externalConditions.join(" / ")}</p>
      )}
      {props.experience}
      <h3 className="subhead">{DISPLAY.decideTitle}</h3>
      {isKeyTurn && <p className="note">这是一个会影响之后几年的决定。五年以后，你还可以回到这里，看看另一种选择。</p>}
      <div className="actions option-list">
        {situation.availableActions.map((action) =>
          action.kind === "PRESET" ? (
            <button key={action.id} className="action option" onClick={() => props.onDecide(action)}>
              <span>{action.label}</span>
              <Chevron />
            </button>
          ) : (
            <button
              key={action.id}
              className="action option"
              aria-pressed={customOpen}
              onClick={() => setCustomOpen(true)}
            >
              <span>{action.label}</span>
              <Chevron />
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
            aria-label="我自己的办法"
            onChange={(event) => setCustomText(event.target.value)}
          />
          <div className="row">
            <button className="btn btn-primary" disabled={!customText.trim()} onClick={() => props.onDecide(custom, customText)}>
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
  const eyebrow = isMainChapter(situation.chapter) ? DISPLAY.eyebrows[situation.chapter] : situation.timeLabel;
  const { status } = props;
  return (
    <section className="screen" aria-live="polite">
      <ScreenHead eyebrow={eyebrow} title={DISPLAY.decidedTitle} />
      <p className="echo">「{label}」</p>
      {status.status === "pending" && (
        <div className="card">
          <div className="progress">
            <span />
          </div>
          <p className="beat" style={delay(0.6)}>
            你照着这个决定做了下去。
          </p>
          <p className="beat" style={delay(2.2)}>
            身边的人有了各自的反应。
          </p>
          <p className="beat" style={delay(3.8)}>
            几天以后……
          </p>
        </div>
      )}
      {status.status === "error" && (
        <>
          <p className="error">{status.message}</p>
          <button className="btn" onClick={props.onRetry}>
            重试
          </button>
        </>
      )}
      {status.status === "idle" && (
        <button className="btn btn-primary" onClick={props.onRetry}>
          看看后来发生了什么
        </button>
      )}
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
  const eyebrow = isMainChapter(situation.chapter) ? DISPLAY.eyebrows[situation.chapter] : situation.timeLabel;
  return (
    <section className="screen">
      <ScreenHead eyebrow={eyebrow} title={DISPLAY.outcomeTitle} />
      {props.badge && <GenerationBadge generation={props.badge.generation} elapsedMs={props.badge.elapsedMs} />}
      {outcome.validation === "FALLBACK" && !props.badge && <GenerationBadge generation="FALLBACK" />}
      <p className="scene">{outcome.narrative}</p>
      {outcome.gains.length > 0 && <p className="meta">收获：{outcome.gains.join(" / ")}</p>}
      {outcome.costs.length > 0 && <p className="meta">代价：{outcome.costs.join(" / ")}</p>}
      {outcome.unresolvedConsequences.length > 0 && (
        <p className="meta">还没解决的：{outcome.unresolvedConsequences.join(" / ")}</p>
      )}
      <h3 className="subhead">{DISPLAY.factsTitle}</h3>
      <ul className="facts">
        {facts.map((fact) => (
          <li key={fact.id}>{fact.statement}</li>
        ))}
      </ul>
      <div className="row">
        <button className="btn btn-primary" onClick={props.onContinue}>
          {props.continueLabel}
        </button>
      </div>
    </section>
  );
}

"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import type {
  GenerateSituationResponseData,
  MainChapter,
  UnderstandIntentResponseData,
} from "@/ai/contracts";
import type { Action, Fact, ReflectionItem } from "@/contracts/game";
import type { GameState } from "@/game-state";
import { REFLECTION_LABELS, describeDecisionAction } from "@/game/labels";

import type { Timed } from "./ai-client";
import { DISPLAY } from "./copy";
import { HeroArtwork } from "./journey";
import type { Side } from "./field/target";
import { PLAN_OPTIONS, VALUE_OPTIONS } from "./plans";
import { GraduationStats } from "./stats";
import { ZhihuSignIn } from "./zhihu-signin";

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

export function GenerationBadge({ generation }: { generation: "AI" | "FALLBACK"; elapsedMs?: number }) {
  return (
    <p className="meta">
      <span className={generation === "AI" ? "tag" : "tag tag-fallback"}>
        {generation === "AI" ? "AI 生成" : "保守模板（AI 暂不可用）"}
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Screen 1: the undetermined field
// ---------------------------------------------------------------------------

export function Hero({ onStart }: { onStart(): void }) {
  return (
    <section className="screen hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow"><span className="chapter-chip">00</span>{DISPLAY.eyebrows.prologue}</p>
        <h1 id="hero-title" className="hero-title">
          <span>{DISPLAY.heroTitle[0]}<i aria-hidden="true">↗</i></span>
          <span>{DISPLAY.heroTitle[1]}</span>
        </h1>
        <p className="hero-subtitle hero-pitch">
          把<em>知乎网友真实走过</em>的人生经验，<br />
          变成你可以亲自验证、对照和讨论的<span>平行人生。</span>
        </p>
        <div className="hero-action">
          <button className="btn btn-primary" onClick={onStart}>{DISPLAY.start}<span aria-hidden="true">↗</span></button>
          <span className="hero-duration">约 8–10 分钟</span>
        </div>
        <ZhihuSignIn />
      </div>
      <HeroArtwork />
      <div className="hero-footnote"><span>人生没有标准答案。</span><span>从毕业那天，走向另一种可能。<span aria-hidden="true">↗</span></span></div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Screens 2-3: plan input and AI understanding
// ---------------------------------------------------------------------------

function Block(props: { n: string; title: string; children: ReactNode; onEnter(): void; className?: string }) {
  return (
    <section
      className={props.className ? `act1-block ${props.className}` : "act1-block"}
      // Capture so entering a block registers before its own control reacts;
      // focus covers keyboard tabbing, click covers everything else.
      onFocusCapture={props.onEnter}
      onClickCapture={props.onEnter}
    >
      <h3 className="act1-block-title">
        <span className="act1-block-n">{props.n}</span>
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

export function IntentInput(props: {
  rawText: string;
  plans: string[];
  values: string[];
  pending: boolean;
  error: string | null;
  /** Real Zhihu advice on choosing after graduation; its own block 05. */
  experience?: ReactNode;
  onTextChange(value: string): void;
  onTogglePlan(plan: string): void;
  onToggleValue(value: string): void;
  onSubmit(): void;
}) {
  // Attention, not count, drives the collapse: folding on the first pick would
  // stop the player picking a second one.
  const [active, setActive] = useState(1);
  const plansOpen = active === 1 || props.plans.length === 0;
  const picked = PLAN_OPTIONS.filter((option) => props.plans.includes(option.label));
  const summary = [...picked.map((option) => option.label), ...props.values].join(" · ");

  return (
    <section className="screen act1">
      <ScreenHead eyebrow={DISPLAY.eyebrows.prologue} title={DISPLAY.intentTitle} />
      <p className="lede">都可以多选。选得越具体，后面五年就越像你自己的。</p>

      <Block n="01" title="我想做的事" onEnter={() => setActive(1)}>
        {plansOpen ? (
          <div className="plan-box-grid" role="group" aria-label="我想做的事">
            {PLAN_OPTIONS.map((option, index) => (
              <button
                key={option.label}
                className="plan-box panel panel-lift"
                // The number is decorative; keep it out of the accessible name.
                aria-label={option.label}
                aria-pressed={props.plans.includes(option.label)}
                onClick={() => props.onTogglePlan(option.label)}
                disabled={props.pending}
              >
                <span className="plan-box-n" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="plan-box-label">{option.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <button className="plan-summary" onClick={() => setActive(1)} disabled={props.pending}>
            <span>{picked.map((option) => option.label).join(" · ")}</span>
            <span className="plan-summary-more">＋{PLAN_OPTIONS.length - picked.length} 个方向 ⌄</span>
          </button>
        )}
      </Block>

      <Block n="02" title="我真正看重什么" onEnter={() => setActive(2)}>
        <div className="value-row" role="group" aria-label="我真正看重什么">
          {VALUE_OPTIONS.map((value) => (
            <button
              key={value}
              className="value-chip panel panel-lift"
              aria-pressed={props.values.includes(value)}
              onClick={() => props.onToggleValue(value)}
              disabled={props.pending}
            >
              {value}
            </button>
          ))}
        </div>
      </Block>

      <Block n="03" title="我真正的想法" onEnter={() => setActive(3)}>
        <textarea
          id="intent-text"
          value={props.rawText}
          maxLength={1_000}
          disabled={props.pending}
          placeholder="比如：我准备先回家帮父母开店，同时试试做短视频。如果几个月都没有进展，再考虑去找工作……"
          aria-label="我真正的想法"
          onChange={(event) => props.onTextChange(event.target.value)}
        />
      </Block>

      <Block n="04" title="看看大家都在选什么" onEnter={() => setActive(4)}>
        <GraduationStats />
      </Block>

      <Block n="05" title="看看知乎朋友们怎么推荐" onEnter={() => setActive(5)}>
        {props.experience}
      </Block>

      <div className="act1-bar">
        <p className="act1-summary">{summary || "还没有选择"}</p>
        <button className="btn btn-primary" onClick={props.onSubmit} disabled={props.pending}>
          {props.pending ? "正在理解你的打算…" : "确认，迈出第一步"}
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

function ConfirmBlock({ title, items, numbered }: { title: string; items: readonly string[]; numbered?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="confirm-block">
      <p className="confirm-block-title">{title}</p>
      <ul>
        {items.map((item, index) => (
          <li key={`${index}-${item}`}>
            {numbered && <span className="confirm-n">{String(index + 1).padStart(2, "0")}</span>}
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IntentConfirm(props: {
  understanding: Timed<UnderstandIntentResponseData>;
  prefetchStatus: Async<unknown>["status"];
  /** What the player actually typed; null when they only ticked chips. */
  playerText: string | null;
  onConfirm(): void;
  onEdit(): void;
}) {
  const { summary, intent } = props.understanding.data.result;
  return (
    <section className="screen">
      <ScreenHead eyebrow={DISPLAY.eyebrows.prologue} title={DISPLAY.confirmTitle} />
      <div className="confirm-split">
        <div>
          <p className="confirm-block-title">你的原话</p>
          <p className="statement">
            {props.playerText ?? "我还没有把所有想法说清楚，但已经选出了想尝试的方向。"}
          </p>
          <p className="lede">{summary}</p>
          <GenerationBadge generation={props.understanding.data.generation} elapsedMs={props.understanding.elapsedMs} />
        </div>
        <div>
          <ConfirmBlock title="正在并行的计划" items={intent.goals} />
          <ConfirmBlock title="现在最在意" items={intent.priorities} />
          <ConfirmBlock title="先做的第一步" items={intent.currentActions} numbered />
          <ConfirmBlock title="还没有确定" items={intent.constraints} />
        </div>
      </div>
      <div className="act1-bar">
        <button className="btn" onClick={props.onEdit}>
          ← 返回修改
        </button>
        <button className="btn btn-primary" onClick={props.onConfirm}>
          对，就是这样
        </button>
      </div>
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
export function TimeAdvance({ steps, caption, duration = 5 }: { steps: TimeStep[]; caption: string; duration?: number }) {
  const beats = steps.reduce((count, step) => count + step.lines.length + 1, 0);
  const cadence = Math.max(0.16, (duration - 0.8) / Math.max(1, beats));
  const starts = steps.reduce<number[]>((acc, _step, index) => {
    acc.push(index === 0 ? 0 : acc[index - 1]! + (steps[index - 1]!.lines.length + 1) * cadence);
    return acc;
  }, []);
  const end = beats * cadence;
  return (
    <div className="card time-sequence">
      <p className="meta">{caption}</p>
      <div className="timeline">
        {steps.map((step, index) => (
          <div key={`${index}-${step.label}`}>
            <p className="year beat" style={delay(starts[index]!)}>
              {step.label}
            </p>
            {step.lines.map((line, lineIndex) => (
              <p key={`${lineIndex}-${line}`} className="beat" style={delay(starts[index]! + cadence * (lineIndex + 1))}>
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
  const [branch, setBranch] = useState<Side>(0);
  const onHover = (side: Side) => {
    setBranch(side);
    props.onHover(side);
  };
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
          {/*
            The fork, at full size. Pointing at a card bends the matching bundle
            in the field behind it — the causality is already wired through
            onHover; the cards only had to get big enough for it to be felt.
            Left undocumented on purpose: it is there to be found.
          */}
          <div className="choice-junction" data-branch={branch} aria-hidden="true">
            <svg viewBox="0 0 1000 100" fill="none" preserveAspectRatio="none">
              <path className="junction-base" d="M500 0V30L250 80V100M500 30L750 80V100" />
              <path className="junction-left" pathLength="1" d="M500 0V30L250 80V100" />
              <path className="junction-right" pathLength="1" d="M500 0V30L750 80V100" />
              <rect x="494" y="24" width="12" height="12" fill="currentColor" transform="rotate(45 500 30)" />
            </svg>
          </div>
          <div className="pair" data-branch={branch}>
            {slot.value.data.result.possibilities.map((possibility, index) => {
              const side: Side = possibility.kind === "MOMENTUM" ? 1 : -1;
              return (
                <button
                  key={possibility.id}
                  className="pair-card panel panel-lift"
                  // Without this the accessible name is the whole card blob.
                  aria-label={DISPLAY.possibilityTitles[possibility.kind]}
                  onPointerEnter={() => onHover(side)}
                  onPointerLeave={() => onHover(0)}
                  onFocus={() => onHover(side)}
                  onBlur={() => onHover(0)}
                  onClick={() => props.onChoose(possibility.kind)}
                >
                  <span className="pair-top">
                    <span className="pair-n">0{index + 1}</span>
                    <span className="ink-dot" />
                  </span>
                  <span className="pair-kind">{DISPLAY.possibilityTitles[possibility.kind]}</span>
                  <span className="pair-summary">{possibility.summary}</span>
                  <span className="pair-foot">看看这种可能 ↗</span>
                </button>
              );
            })}
          </div>
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
      <p className="meta">此刻面对的：{situation.tensions.join(" / ")}</p>
      {situation.externalConditions.length > 0 && (
        <p className="meta">外部条件：{situation.externalConditions.join(" / ")}</p>
      )}
      {props.experience}
      <h3 className="subhead">{DISPLAY.decideTitle}</h3>
      {isKeyTurn && <p className="note">这是一个会影响之后几年的决定。五年以后，你还可以回到这里，看看另一种选择。</p>}
      <div className="act-list">
        {situation.availableActions.map((action, index) => (
          <button
            key={action.id}
            className="act-opt panel panel-lift"
            aria-pressed={action.kind === "CUSTOM_PLACEHOLDER" ? customOpen : undefined}
            onClick={() => (action.kind === "PRESET" ? props.onDecide(action) : setCustomOpen(true))}
          >
            <span className="act-n">{String(index + 1).padStart(2, "0")}</span>
            <span className="act-label">{action.label}</span>
            <span className="ink-dot" />
          </button>
        ))}
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

function TallyColumn({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="record-title">{title}</p>
      <ul className="tally-list">
        {items.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What the experience left behind, as opposed to what happened. Absent on saves
 * written before reflection existed, and whenever the model had nothing worth
 * saying — both render as nothing at all, never as an empty heading.
 */
function Reflection({ items }: { items?: readonly ReflectionItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="reflection">
      <p className="record-title">这件事，在你身上留下了什么</p>
      <ul className="reflection-list">
        {items.map((item, index) => (
          <li key={`${index}-${item.content}`} data-horizon={item.horizon}>
            <p className="reflection-kind">
              {item.kind === "FIRST_TIME" && <span className="reflection-mark" aria-hidden="true" />}
              {REFLECTION_LABELS[item.kind]}
            </p>
            <p className="reflection-text">{item.content}</p>
          </li>
        ))}
      </ul>
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
      {/* What happened on the left, what got written down on the right. */}
      <div className="outcome-split">
        <div className="outcome-story">
          <p className="scene">{outcome.narrative}</p>
          <div className="tally">
            <TallyColumn title="收获" items={outcome.gains} />
            <TallyColumn title="代价" items={outcome.costs} />
          </div>
        </div>
        <div className="record panel">
          <p className="record-title">{DISPLAY.factsTitle}</p>
          <ul className="record-list">
            {facts.map((fact, index) => (
              <li key={fact.id}>
                <span className="record-tick" aria-hidden="true">
                  ✓
                </span>
                <span>{fact.statement}</span>
                <span className="record-n">{String(index + 1).padStart(2, "0")}</span>
              </li>
            ))}
          </ul>
        </div>
        {outcome.unresolvedConsequences.length > 0 && (
          <div className="unresolved">
            <p className="record-title">仍然没有答案</p>
            {outcome.unresolvedConsequences.map((item, index) => (
              <p key={`${index}-${item}`} className="muted">
                {item}
              </p>
            ))}
          </div>
        )}
      </div>
      <Reflection items={outcome.reflection} />
      <div className="row">
        <button className="btn btn-primary" onClick={props.onContinue}>
          {props.continueLabel}
        </button>
      </div>
    </section>
  );
}

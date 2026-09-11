"use client";

import { useState } from "react";

import type { Action } from "@/contracts/game";
import type { GameState, LifePath } from "@/game-state";
import { keyDecisionContext } from "@/game/flow";
import { describeDecisionAction } from "@/game/labels";

import { DISPLAY } from "./copy";
import { Chevron, GenerationBadge, ScreenHead, TimeAdvance, type TimeStep } from "./screens";

type Badge = { generation: "AI" | "FALLBACK"; elapsedMs?: number };

const clip = (text: string, maxLength: number) => (text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text);

function LifeTimeline({ life }: { life: LifePath }) {
  return (
    <div className="timeline">
      {life.timeline.map((point, index) => (
        <div key={`${index}-${point.label}`}>
          <p className="year">{point.label}</p>
          <p>{point.summary}</p>
        </div>
      ))}
    </div>
  );
}

// Screen 8: time acceleration, covering SIMULATE_LIFE(FIVE_YEARS) --------------

export function FiveYearsTransition({ state }: { state: GameState }) {
  const latest = state.outcomes.at(-1);
  const recent = latest ? state.facts.slice(-latest.addedFacts.length).map(({ statement }) => statement).slice(0, 2) : [];
  const steps: TimeStep[] = [
    { label: "第四年", lines: recent },
    { label: "第五年", lines: ["日子一天天过去，很多事慢慢变成了习惯。"] },
    { label: "毕业五年", lines: ["同学群里有人提议：毕业五年了，聚一聚吧。"] },
  ];
  return (
    <section className="screen" aria-live="polite">
      <ScreenHead eyebrow={DISPLAY.eyebrows.reunion} title={DISPLAY.accelerationTitle} />
      <TimeAdvance steps={steps} caption="几年之间……" />
    </section>
  );
}

// Screens 10-12: reunion, five-year memorial, key decision timeline -------------

export function ReunionView(props: { state: GameState; badge?: Badge; onPickKey(): void }) {
  const { state } = props;
  const life = state.fiveYearLife;
  const intent = state.intent;
  if (!life || !intent) return null;
  return (
    <section className="screen">
      <ScreenHead eyebrow={DISPLAY.eyebrows.reunion} title={DISPLAY.reunionTitle} />
      {props.badge && <GenerationBadge generation={props.badge.generation} elapsedMs={props.badge.elapsedMs} />}
      <p className="meta">有人问你：</p>
      <p className="echo">“你现在平时都在做什么？”</p>
      <p className="statement">{life.reunionAnswer}</p>

      <h3 className="subhead">{DISPLAY.memorialTitle}</h3>
      <p className="meta">五年前的你说：</p>
      <blockquote>{intent.rawText}</blockquote>
      <p className="meta">五年以后，真正发生过的事情：</p>
      <ul className="facts">
        {life.commemorativeFacts.map((fact, index) => (
          <li key={`${index}-${fact}`}>{fact}</li>
        ))}
      </ul>
      <LifeTimeline life={life} />
      <p className="scene">{life.currentState}</p>
      <p className="note">这是你走过的一种生活。</p>

      <h3 className="subhead">{DISPLAY.forkQuestion}</h3>
      <p className="lede">这五年里，有哪一次选择，你还想回去看看？</p>
      <ol className="option-list decision-list">
        {state.decisions.map((decision) => {
          const situation = state.situations.find((played) => played.situation.id === decision.situationId)?.situation;
          const label = situation ? describeDecisionAction(decision, situation) : "";
          return (
            <li key={decision.id} className="option-row">
              <span>
                <span className="meta">{situation?.timeLabel}</span>
                <br />
                {label}
              </span>
              {decision.isKeyDecision ? (
                <button className="btn btn-primary" onClick={props.onPickKey}>
                  回到这个决定
                </button>
              ) : (
                <span className="meta">这一次暂不开放回溯</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Screen 13: choose the single replacement Decision -----------------------------

export function ForkChooser(props: { state: GameState; onConfirm(action: Action, customText?: string): void }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const key = keyDecisionContext(props.state);
  if (!key) return null;
  const alternatives = key.situation.availableActions.filter(
    (action) => action.kind === "PRESET" && action.id !== key.decision.selectedActionId,
  );
  const custom = key.situation.availableActions.find((action) => action.kind === "CUSTOM_PLACEHOLDER");
  return (
    <section className="screen">
      <ScreenHead eyebrow={DISPLAY.eyebrows.fork} title={DISPLAY.forkTitle} />
      <p className="scene">{key.situation.concreteContext}</p>
      <p className="meta">你当时选择的：</p>
      <p className="echo">「{key.label}」</p>
      <p className="lede">只替换这一个决定，此前的经历和处境都保持不变。</p>
      <div className="option-list">
        {alternatives.map((action) => (
          <button key={action.id} className="action option" onClick={() => props.onConfirm(action)}>
            <span>{action.label}</span>
            <Chevron />
          </button>
        ))}
        {custom && (
          <button className="action option" aria-pressed={customOpen} onClick={() => setCustomOpen(true)}>
            <span>{custom.label}</span>
            <Chevron />
          </button>
        )}
      </div>
      {customOpen && custom && (
        <div className="card">
          <textarea
            value={customText}
            maxLength={200}
            placeholder="写下这一次你想怎么做"
            aria-label="这一次我想怎么做"
            onChange={(event) => setCustomText(event.target.value)}
          />
          <div className="row">
            <button className="btn btn-primary" disabled={!customText.trim()} onClick={() => props.onConfirm(custom, customText)}>
              换成这个选择
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// Rewind transition, covering SIMULATE_LIFE(COUNTERFACTUAL) ---------------------

export function RewindTransition({ state, replacement }: { state: GameState; replacement: string }) {
  const key = keyDecisionContext(state);
  const back = (state.fiveYearLife?.timeline ?? [])
    .slice()
    .reverse()
    .slice(0, 4)
    .map((point) => ({ label: point.label, lines: [] }));
  const steps: TimeStep[] = [
    { label: "毕业五年", lines: [] },
    ...back,
    {
      label: key?.situation.timeLabel ?? "那一天",
      lines: [clip(key?.situation.concreteContext ?? "", 70), `这一次，你选择了：「${clip(replacement, 40)}」`],
    },
  ];
  return (
    <section className="screen" aria-live="polite">
      <ScreenHead eyebrow={DISPLAY.eyebrows.fork} title={DISPLAY.rewindTitle} />
      <TimeAdvance steps={steps} caption="时间倒回去……" />
    </section>
  );
}

// Screen 14: two lives side by side ---------------------------------------------

export function ComparisonView(props: { state: GameState; replacement: string | null; badge?: Badge; onFinish(): void }) {
  const { fiveYearLife: original, parallelLife: parallel, comparison } = props.state;
  const key = keyDecisionContext(props.state);
  if (!original || !parallel || !comparison) return null;
  const groups: [string, string[]][] = [
    ["因为那个决定逐渐发生变化的", comparison.changedByDecision],
    ["一直没有改变的", comparison.unchanged],
    ["无法归因于玩家选择的", comparison.external],
  ];
  return (
    <section className="screen">
      <ScreenHead eyebrow={DISPLAY.eyebrows.comparison} title={DISPLAY.comparisonTitle} />
      {props.badge && <GenerationBadge generation={props.badge.generation} elapsedMs={props.badge.elapsedMs} />}
      <div className="columns">
        <div>
          <p className="meta">原来的五年</p>
          <p className="echo">「{key?.label}」</p>
          <LifeTimeline life={original} />
          <p>{original.currentState}</p>
        </div>
        <div>
          <p className="meta">另一种可能</p>
          <p className="echo">「{props.replacement ?? "另一种选择"}」</p>
          <LifeTimeline life={parallel} />
          <p>{parallel.currentState}</p>
        </div>
      </div>
      <h3 className="subhead">{DISPLAY.comparisonSubtitle}</h3>
      {groups.map(([title, items]) => (
        <div className="card" key={title}>
          <p>
            <strong>{title}</strong>
          </p>
          {items.length > 0 ? (
            <ul>
              {items.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">这一栏没有内容。</p>
          )}
        </div>
      ))}
      <div className="row">
        <button className="btn btn-primary" onClick={props.onFinish}>
          结束
        </button>
      </div>
    </section>
  );
}

// Screen 15 ---------------------------------------------------------------------

export function EndingView({ onRestart }: { onRestart(): void }) {
  return (
    <section className="screen">
      <p className="eyebrow">{DISPLAY.eyebrows.comparison}</p>
      <h2 className="display-title">{DISPLAY.endingTitle}</h2>
      <p className="lede">但走过两条路以后，你也许更清楚自己真正愿意承担什么，又真正舍不得什么。</p>
      <div className="row">
        <button className="btn btn-primary" onClick={onRestart}>
          重新开始
        </button>
      </div>
    </section>
  );
}

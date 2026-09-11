"use client";

import { useState } from "react";

import type { Action } from "@/contracts/game";
import type { GameState, LifePath } from "@/game-state";
import { keyDecisionContext } from "@/game/flow";
import { describeDecisionAction } from "@/game/labels";

import { GenerationBadge, TimeAdvance, type TimeStep } from "./screens";

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
    <section>
      <h2>时间继续向前</h2>
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
    <section>
      <h2>毕业五年 · 同学聚会</h2>
      <div className="card">
        {props.badge && <GenerationBadge generation={props.badge.generation} elapsedMs={props.badge.elapsedMs} />}
        <p className="muted">有人问你：</p>
        <p className="echo">“你现在平时都在做什么？”</p>
        <p>{life.reunionAnswer}</p>
      </div>
      <h2>五年纪念</h2>
      <div className="card">
        <p className="muted">五年前的你说：</p>
        <blockquote>{intent.rawText}</blockquote>
        <p className="muted">五年以后，真正发生过的事情：</p>
        <ul className="facts">
          {life.commemorativeFacts.map((fact, index) => (
            <li key={`${index}-${fact}`}>✓ {fact}</li>
          ))}
        </ul>
        <LifeTimeline life={life} />
        <p>{life.currentState}</p>
        <p className="muted">这是你走过的一种生活。</p>
      </div>
      <h2>如果当时换一种选择呢？</h2>
      <p className="muted">这五年里，有哪一次选择，你还想回去看看？</p>
      <div className="timeline">
        {state.decisions.map((decision) => {
          const situation = state.situations.find((played) => played.situation.id === decision.situationId)?.situation;
          return (
            <div key={decision.id}>
              <p className="year">{situation?.timeLabel}</p>
              <p>{situation ? describeDecisionAction(decision, situation) : ""}</p>
              {decision.isKeyDecision ? (
                <button className="primary" onClick={props.onPickKey}>
                  回到这个决定
                </button>
              ) : (
                <p className="muted">这一次暂不开放回溯</p>
              )}
            </div>
          );
        })}
      </div>
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
    <section>
      <h2>回到{key.situation.timeLabel}</h2>
      <div className="card">
        <p className="scene">{key.situation.concreteContext}</p>
        <p className="muted">你当时选择的：</p>
        <p className="echo">「{key.label}」</p>
      </div>
      <h2>这一次，换成……</h2>
      <p className="muted">只替换这一个决定，此前的经历和处境都保持不变。</p>
      <div className="actions">
        {alternatives.map((action) => (
          <button key={action.id} className="action" onClick={() => props.onConfirm(action)}>
            {action.label}
          </button>
        ))}
        {custom && (
          <button className="action" aria-pressed={customOpen} onClick={() => setCustomOpen(true)}>
            {custom.label}
          </button>
        )}
      </div>
      {customOpen && custom && (
        <div className="card">
          <textarea
            value={customText}
            maxLength={200}
            placeholder="写下这一次你想怎么做"
            onChange={(event) => setCustomText(event.target.value)}
          />
          <div className="row">
            <button className="primary" disabled={!customText.trim()} onClick={() => props.onConfirm(custom, customText)}>
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
    <section>
      <h2>回到过去</h2>
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
    <section>
      <h2>两段人生</h2>
      {props.badge && <GenerationBadge generation={props.badge.generation} elapsedMs={props.badge.elapsedMs} />}
      <div className="columns">
        <div className="card">
          <p className="muted">原来的五年</p>
          <p className="echo">「{key?.label}」</p>
          <LifeTimeline life={original} />
          <p>{original.currentState}</p>
        </div>
        <div className="card">
          <p className="muted">另一种可能</p>
          <p className="echo">「{props.replacement ?? "另一种选择"}」</p>
          <LifeTimeline life={parallel} />
          <p>{parallel.currentState}</p>
        </div>
      </div>
      <h2>最后的比较不是哪个更好</h2>
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
        <button className="primary" onClick={props.onFinish}>
          结束
        </button>
      </div>
    </section>
  );
}

// Screen 15 ---------------------------------------------------------------------

export function EndingView({ onRestart }: { onRestart(): void }) {
  return (
    <section>
      <div className="card">
        <p>没有哪一种人生能够证明另一种人生是错的。</p>
        <p>但走过两条路以后，你也许更清楚自己真正愿意承担什么，又真正舍不得什么。</p>
      </div>
      <div className="row">
        <button className="primary" onClick={onRestart}>
          重新开始
        </button>
      </div>
    </section>
  );
}

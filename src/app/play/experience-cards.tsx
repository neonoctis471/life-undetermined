"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { formatVoteCount } from "@/game/labels";
import type { ExperienceResponseData, SupplementCard, ZhihuCard } from "@/zhihu/contracts";

import type { Async } from "./screens";

// Plain structure only; visual design for the cards comes in a later pass.

/*
 * The author is the point of these cards: a card without a face and a name is
 * indistinguishable from something the machine made up. The initial stands in
 * when the search result carried no avatar, or when the image fails to load —
 * a broken-image icon next to someone's name would say the opposite of what
 * this block is for.
 */
function AuthorAvatar({ card }: { card: ZhihuCard }) {
  const [broken, setBroken] = useState(false);
  if (!card.authorAvatar || broken) {
    return (
      <span className="card-avatar is-blank" aria-hidden="true">
        {[...card.authorName][0] ?? "知"}
      </span>
    );
  }
  return (
    <Image
      className="card-avatar"
      src={card.authorAvatar}
      alt=""
      width={36}
      height={36}
      unoptimized
      onError={() => setBroken(true)}
    />
  );
}

function ZhihuExperience({ card, index }: { card: ZhihuCard; index: number }) {
  const kind = card.contentType === "Article" ? "文章" : "回答";
  return (
    <article className="card" data-provenance={card.provenance}>
      <div className="card-author">
        <AuthorAvatar card={card} />
        <span className="card-author-lines">
          <span className="card-author-name">
            <b>{card.authorName}</b>
            {/* Zhihu's own verification, shown as Zhihu words it. */}
            {card.authorBadge && <em className="card-badge">{card.authorBadge}</em>}
          </span>
          <span className="muted">
            经验 {String(index + 1).padStart(2, "0")} · 来自知乎的{kind}
            {/* Only when someone actually voted; 「0 人赞同」 is worse than silence. */}
            {card.voteUpCount > 0 && (
              <>
                {" · "}
                <b className="card-votes">{formatVoteCount(card.voteUpCount)} 人赞同</b>
              </>
            )}
          </span>
        </span>
      </div>
      <h4>{card.title}</h4>
      {card.conditions.length > 0 && <p>当时条件：{card.conditions.join("；")}</p>}
      {card.whatTheyDid && <p>作者做了什么：{card.whatTheyDid}</p>}
      {card.whatHappened && <p>后来发生什么：{card.whatHappened}</p>}
      {card.similarities.length > 0 && <p>与你相似：{card.similarities.join("；")}</p>}
      {card.differences.length > 0 && <p>与你不同：{card.differences.join("；")}</p>}
      <blockquote>{card.excerpt}</blockquote>
      <p className="muted">
        {card.provenance === "ZHIHU_ADAPTED" ? "以上由 AI 根据原文整理，以原文为准。" : "原文摘录。"}{" "}
        <a href={card.url} target="_blank" rel="noopener noreferrer">
          查看原{kind}
        </a>
      </p>
    </article>
  );
}

function SupplementExperience({ card }: { card: SupplementCard }) {
  return (
    <article className="card" data-provenance={card.provenance}>
      <p className="muted">AI 参考思路 · 非知乎内容</p>
      <ul>
        {card.points.map((point, index) => (
          <li key={`${index}-${point}`}>{point}</li>
        ))}
      </ul>
    </article>
  );
}

function Cards({ cards }: { cards: ExperienceResponseData["cards"] }) {
  return cards.map((card, index) =>
    card.provenance === "AI_SUPPLEMENT" ? (
      <SupplementExperience key={card.id} card={card} />
    ) : (
      <ZhihuExperience key={card.id} card={card} index={index} />
    ),
  );
}

/**
 * Act 1 version: advice on how to choose after graduating. Real answers from
 * people who have been through it are the point of this block, so the lookup
 * runs on arrival instead of hiding behind a click a first-time visitor may
 * never make. The button is kept only as a way back from a miss.
 */
export function PlanExperiencePanel(props: { experience?: Async<ExperienceResponseData>; onLoad(): void }) {
  const status = props.experience?.status ?? "idle";
  const cards = props.experience?.status === "ready" ? props.experience.value.cards : [];
  const { onLoad } = props;
  /*
   * onLoad is redefined on every render of the page, so the effect cannot rely
   * on its identity to stay put; the ref is what makes this fire exactly once.
   * Starting a new game unmounts the prologue, which resets it.
   */
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || status !== "idle") return;
    asked.current = true;
    onLoad();
  }, [status, onLoad]);

  const missed = status === "error" || (status === "ready" && cards.length === 0);
  return (
    <div className="experience experience-plan">
      {/* The "05 看看知乎朋友们怎么推荐" block heading already names this. */}
      {status === "pending" && <p className="muted">正在知乎上找过来人的建议……</p>}
      {missed && (
        <button className="link-button" onClick={onLoad}>
          {status === "error" ? "这次没能找到，重试" : "这次没找到合适的回答，重试"} ↻
        </button>
      )}
      <Cards cards={cards} />
    </div>
  );
}

/** Optional and non-blocking: hidden while idle, on error, or when there is nothing to show. */
export function ExperiencePanel({ experience }: { experience?: Async<ExperienceResponseData> }) {
  const [open, setOpen] = useState(false);
  if (!experience || experience.status === "idle" || experience.status === "error") return null;
  if (experience.status === "ready" && experience.value.cards.length === 0) return null;
  const supplementOnly = experience.status === "ready" && experience.value.source === "AI_SUPPLEMENT";
  return (
    <div className="experience">
      <button className="link-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {supplementOnly ? "看看几个参考思路" : "看看知乎朋友们是怎么选择的"} {open ? "−" : "＋"}
      </button>
      {open &&
        (experience.status === "pending" ? (
          <p className="muted">正在找别人的经验……</p>
        ) : (
          <Cards cards={experience.value.cards} />
        ))}
    </div>
  );
}

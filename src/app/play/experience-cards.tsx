"use client";

import { useState } from "react";

import type { ExperienceResponseData, SupplementCard, ZhihuCard } from "@/zhihu/contracts";

import type { Async } from "./screens";

// Plain structure only; visual design is handled in the later front-end pass.

function ZhihuExperience({ card, index }: { card: ZhihuCard; index: number }) {
  const kind = card.contentType === "Article" ? "文章" : "回答";
  return (
    <article className="card" data-provenance={card.provenance}>
      <p className="muted">
        经验 {String(index + 1).padStart(2, "0")} · 来自知乎 · {card.authorName} 的{kind}
      </p>
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
      <p className="muted">{card.label}</p>
      <ul>
        {card.points.map((point, index) => (
          <li key={`${index}-${point}`}>{point}</li>
        ))}
      </ul>
    </article>
  );
}

/** Optional and non-blocking: hidden while idle, on error, or when there is nothing to show. */
export function ExperiencePanel({ experience }: { experience?: Async<ExperienceResponseData> }) {
  const [open, setOpen] = useState(false);
  if (!experience || experience.status === "idle" || experience.status === "error") return null;
  if (experience.status === "ready" && experience.value.cards.length === 0) return null;
  const supplementOnly = experience.status === "ready" && experience.value.source === "AI_SUPPLEMENT";
  return (
    <div>
      <button aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        💬 不知道怎么处理？{supplementOnly ? "看看几个参考思路。" : "看看别人怎么做过。"}
      </button>
      {open &&
        (experience.status === "pending" ? (
          <p className="muted">正在找别人的经验……</p>
        ) : (
          experience.value.cards.map((card, index) =>
            card.provenance === "AI_SUPPLEMENT" ? (
              <SupplementExperience key={card.id} card={card} />
            ) : (
              <ZhihuExperience key={card.id} card={card} index={index} />
            ),
          )
        ))}
    </div>
  );
}

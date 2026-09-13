import { describe, expect, it } from "vitest";

import type { AiProvider } from "@/ai/provider";
import { RELEVANCE_THRESHOLD, buildExperienceCards, judgeZhihuCards, normalizeSupplementCard } from "@/zhihu/cards";
import { SUPPLEMENT_LABEL, type ZhihuEvidence } from "@/zhihu/contracts";
import { toEvidence, type ZhihuSearchProvider } from "@/zhihu/provider";
import { intentKeywords, selectEvidence } from "@/zhihu/rank";

const intent = {
  rawText: "我想先回家帮家里做店里的事情，同时学剪辑试着拍视频。",
  goals: ["帮家里做生意", "学剪辑"],
  priorities: ["家庭责任"],
  constraints: [],
  currentActions: ["拍第一条视频"],
};
const body = "毕业后我回家帮父母看店，一边学剪辑一边拍视频，头三个月几乎没有收入。".repeat(4);

function evidence(overrides: Partial<ZhihuEvidence> = {}): ZhihuEvidence {
  return {
    id: "1",
    title: "要不要回家接手父母生意?",
    authorName: "作者甲",
    authorAvatar: "https://picx.zhimg.com/50/v2-abc_l.jpg",
    authorBadge: null,
    url: "https://www.zhihu.com/question/1/answer/2?utm_source=x",
    contentType: "Answer",
    text: body,
    voteUpCount: 0,
    commentCount: 0,
    authorityLevel: 3,
    rankingScore: 1,
    ...overrides,
  };
}

let next = 0;
const createId = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;

describe("toEvidence", () => {
  it("keeps real zhihu items and normalizes their fields", () => {
    expect(
      toEvidence({ Title: "要不要回家? - 知乎", Url: "https://zhuanlan.zhihu.com/p/1", AuthorName: "甲", ContentText: " 正文 ", AuthorityLevel: "4", VoteUpCount: 7, ContentID: 9 }),
    ).toMatchObject({ title: "要不要回家?", authorityLevel: 4, voteUpCount: 7, text: "正文", id: "9" });
  });

  it("carries the author's avatar and Zhihu's own badge line", () => {
    expect(
      toEvidence({
        Title: "t - 知乎",
        Url: "https://www.zhihu.com/question/1/answer/2",
        AuthorName: "甲",
        ContentText: "正文",
        AuthorAvatar: "https://picx.zhimg.com/50/v2-abc_l.jpg?source=x",
        AuthorBadgeText: " 银行话题下的\n优秀答主 ",
        CommentCount: "12",
        RankingScore: 1.75,
      }),
    ).toMatchObject({
      authorAvatar: "https://picx.zhimg.com/50/v2-abc_l.jpg?source=x",
      authorBadge: "银行话题下的 优秀答主",
      commentCount: 12,
      rankingScore: 1.75,
    });
  });

  it.each([
    "http://picx.zhimg.com/50/a.jpg",
    "https://zhimg.com.evil.example/a.jpg",
    "https://evil.example/a.jpg",
    "javascript:alert(1)",
  ])("refuses to render an avatar from anywhere but Zhihu (%s)", (AuthorAvatar) => {
    expect(
      toEvidence({ Title: "t", Url: "https://www.zhihu.com/q/1", AuthorName: "甲", ContentText: "正文", AuthorAvatar }),
    ).toMatchObject({ authorAvatar: null });
  });

  it("treats an empty badge as unbadged rather than as an empty label", () => {
    expect(
      toEvidence({ Title: "t", Url: "https://www.zhihu.com/q/1", AuthorName: "甲", ContentText: "正文", AuthorBadgeText: "   " }),
    ).toMatchObject({ authorBadge: null });
  });

  it.each(["http://www.zhihu.com/q/1", "https://evil.example/zhihu.com", "https://zhihu.com.evil.example/x", "javascript:alert(1)"])(
    "rejects a non-zhihu or non-https link (%s)",
    (Url) => {
      expect(toEvidence({ Title: "t", Url, AuthorName: "a", ContentText: "x" })).toBeNull();
    },
  );
});

describe("deterministic filtering and ranking", () => {
  it("derives keywords only from what the player said", () => {
    expect(intentKeywords(intent)).toEqual(expect.arrayContaining(["回家", "家里", "剪辑", "视频", "生意"]));
    expect(intentKeywords({ ...intent, rawText: "学吉他", goals: ["学吉他"], currentActions: ["报班"] })).toEqual(["学吉", "吉他", "报班"]);
  });

  it("drops short, off-topic and duplicate items, then ranks on quality", () => {
    const selected = selectEvidence(
      [
        evidence({ id: "short", text: "回家帮忙".repeat(10) }),
        evidence({ id: "off-topic", title: "如何挑选跑鞋", text: "跑步时鞋子的缓震很重要。".repeat(10), url: "https://www.zhihu.com/q/9" }),
        evidence({ id: "well-liked", title: "问题 A", url: "https://www.zhihu.com/q/a", authorityLevel: 2, voteUpCount: 99 }),
        evidence({ id: "liked", title: "问题 B", url: "https://www.zhihu.com/q/b", authorityLevel: 3, voteUpCount: 20 }),
        evidence({ id: "dup-link", title: "问题 C", url: "https://www.zhihu.com/q/b?x=1", authorityLevel: 4 }),
        evidence({ id: "ignored", title: "问题 D", url: "https://www.zhihu.com/q/d", authorityLevel: 4, voteUpCount: 1 }),
      ],
      intentKeywords(intent),
    );
    // Readers' votes outrank the coarse authority tier: an answer 99 people
    // found useful beats one nobody voted for a tier above it.
    expect(selected.map(({ id }) => id)).toEqual(["well-liked", "liked", "ignored"]);
  });

  it("prefers someone's own answer over a 专栏文章 of equal standing", () => {
    const [first] = selectEvidence(
      [
        evidence({ id: "article", title: "问题 A", url: "https://www.zhihu.com/q/a", contentType: "Article", voteUpCount: 10 }),
        evidence({ id: "answer", title: "问题 B", url: "https://www.zhihu.com/q/b", contentType: "Answer", voteUpCount: 10 }),
      ],
      intentKeywords(intent),
      1,
    );
    expect(first?.id).toBe("answer");
  });

  it("lets a clearly more popular 专栏文章 still win", () => {
    const [first] = selectEvidence(
      [
        evidence({ id: "article", title: "问题 A", url: "https://www.zhihu.com/q/a", contentType: "Article", voteUpCount: 5_000 }),
        evidence({ id: "answer", title: "问题 B", url: "https://www.zhihu.com/q/b", contentType: "Answer", voteUpCount: 10 }),
      ],
      intentKeywords(intent),
      1,
    );
    expect(first?.id).toBe("article");
  });

  it("prefers an author Zhihu has verified when the rest is equal", () => {
    const [first] = selectEvidence(
      [
        evidence({ id: "plain", title: "问题 A", url: "https://www.zhihu.com/q/a", voteUpCount: 30 }),
        evidence({ id: "badged", title: "问题 B", url: "https://www.zhihu.com/q/b", voteUpCount: 30, authorBadge: "银行话题下的优秀答主" }),
      ],
      intentKeywords(intent),
      1,
    );
    expect(first?.id).toBe("badged");
  });

  it("keeps discussion and length as tie-breakers, not as the lead signal", () => {
    const [first] = selectEvidence(
      [
        evidence({ id: "chatty", title: "问题 A", url: "https://www.zhihu.com/q/a", voteUpCount: 10, commentCount: 500 }),
        evidence({ id: "voted", title: "问题 B", url: "https://www.zhihu.com/q/b", voteUpCount: 300, commentCount: 0 }),
      ],
      intentKeywords(intent),
      1,
    );
    expect(first?.id).toBe("voted");
  });

});

describe("judgeZhihuCards", () => {
  it("keeps only AI fields the original supports", () => {
    const { cards } = judgeZhihuCards(
      {
        cards: [
          {
            index: 1,
            relevance: 8,
            conditions: ["和父母一起看店", "头三个月几乎没有收入"],
            whatTheyDid: "一边学剪辑一边拍视频",
            whatHappened: "第二年年入 50 万",
            similarities: ["都在家里店铺帮忙"],
            differences: ["原文未提及", "原文未提家庭责任", "文中没有说"],
          },
        ],
      },
      [evidence()],
    );
    expect(cards[0]).toMatchObject({
      provenance: "ZHIHU_ADAPTED",
      relevance: 8,
      authorName: "作者甲",
      url: "https://www.zhihu.com/question/1/answer/2?utm_source=x",
      whatTheyDid: "一边学剪辑一边拍视频",
      whatHappened: null,
      differences: [],
    });
    expect(cards[0]!.excerpt.length).toBeLessThanOrEqual(120);
  });

  it("drops cards below the relevance threshold, showing a single precise card alone", () => {
    const pair = [evidence(), evidence({ id: "2", title: "一个月可以学这20个技能", url: "https://www.zhihu.com/q/2" })];
    const { cards, scores } = judgeZhihuCards(
      { cards: [{ index: 1, relevance: 9, whatTheyDid: "一边学剪辑一边拍视频" }, { index: 2, relevance: RELEVANCE_THRESHOLD - 2 }] },
      pair,
    );
    expect(cards.map(({ id }) => id)).toEqual(["1"]);
    expect(scores).toEqual([
      { title: "要不要回家接手父母生意?", score: 9, kept: true },
      { title: "一个月可以学这20个技能", score: RELEVANCE_THRESHOLD - 2, kept: false },
    ]);

    const atThreshold = judgeZhihuCards({ cards: [{ index: 1, relevance: String(RELEVANCE_THRESHOLD) }] }, [evidence()]);
    expect(atThreshold.cards).toHaveLength(1);
  });

  it("shows excerpt-only originals in deterministic order when nothing was scored", () => {
    const pair = [evidence(), evidence({ id: "2", title: "另一个问题", url: "https://www.zhihu.com/q/2" })];
    const failed = judgeZhihuCards(null, pair);
    expect(failed.cards.map(({ id, provenance, relevance, whatTheyDid }) => ({ id, provenance, relevance, whatTheyDid }))).toEqual([
      { id: "1", provenance: "ZHIHU_ORIGINAL", relevance: null, whatTheyDid: null },
      { id: "2", provenance: "ZHIHU_ORIGINAL", relevance: null, whatTheyDid: null },
    ]);
    expect(failed.scores.every(({ score, kept }) => score === null && kept)).toBe(true);

    const unscored = judgeZhihuCards({ cards: [{ index: 1, whatTheyDid: "一边学剪辑一边拍视频" }] }, [evidence()]);
    expect(unscored.cards[0]).toMatchObject({ provenance: "ZHIHU_ORIGINAL", relevance: null, whatTheyDid: null });
  });

  it("counts a missing score as 0 once other cards are scored", () => {
    const pair = [evidence(), evidence({ id: "2", title: "另一个问题", url: "https://www.zhihu.com/q/2" })];
    expect(judgeZhihuCards({ cards: [{ index: 1, relevance: 8 }, { index: 2 }] }, pair).cards.map(({ id }) => id)).toEqual(["1"]);
  });

  it("never lets the AI card pose as someone's experience", () => {
    const card = normalizeSupplementCard(
      { points: ["有位知乎网友说他先回家了", "家里真正需要你做的是哪部分？", "你愿意为拍视频让出多少时间？"] },
      createId,
    );
    expect(card).toMatchObject({ provenance: "AI_SUPPLEMENT", label: SUPPLEMENT_LABEL });
    expect(card!.points).toEqual(["家里真正需要你做的是哪部分？", "你愿意为拍视频让出多少时间？"]);
    expect(normalizeSupplementCard({ points: ["一位网友的经历"] }, createId)).toBeNull();
  });
});

describe("buildExperienceCards", () => {
  const request = { intent, situation: null, queries: ["父母开店 要不要回家帮忙"] };
  const aiReturning = (content: string): AiProvider => ({ completeJson: async () => content });
  const twoResults: ZhihuSearchProvider = {
    search: async () => [evidence(), evidence({ id: "2", title: "另一个问题", url: "https://www.zhihu.com/q/2" })],
  };

  it("returns only the relevant real cards with a single AI call", async () => {
    const ai = aiReturning('{"cards":[{"index":1,"relevance":3},{"index":2,"relevance":7}]}');
    const { data, stats } = await buildExperienceCards(request, { zhihu: twoResults, ai, createId });
    expect(data.source).toBe("ZHIHU");
    expect(data.cards.map((card) => card.id)).toEqual(["2"]);
    expect(stats).toMatchObject({ zhihuCalls: 1, aiCalls: 1, kept: 2, relevant: 1 });
  });

  it("uses the summary's own fallback points when nothing is relevant, still with one AI call", async () => {
    const ai = aiReturning('{"cards":[{"index":1,"relevance":3},{"index":2,"relevance":2}],"fallbackPoints":["你最看重的是什么？"]}');
    const { data, stats } = await buildExperienceCards(request, { zhihu: twoResults, ai, createId });
    expect(data).toMatchObject({ source: "AI_SUPPLEMENT", cards: [{ label: SUPPLEMENT_LABEL, points: ["你最看重的是什么？"] }] });
    expect(stats.aiCalls).toBe(1);
  });

  it("keeps real excerpt cards when the summary call fails, without a second AI call", async () => {
    const failingAi: AiProvider = { completeJson: async () => Promise.reject(new Error("down")) };
    const { data, stats } = await buildExperienceCards(request, { zhihu: twoResults, ai: failingAi, createId });
    expect(data.source).toBe("ZHIHU");
    expect(data.cards.map((card) => card.provenance)).toEqual(["ZHIHU_ORIGINAL", "ZHIHU_ORIGINAL"]);
    expect(stats.aiCalls).toBe(1);
  });

  it("degrades to a labelled AI card when Zhihu is unavailable, and to nothing when that fails too", async () => {
    const downZhihu: ZhihuSearchProvider = { search: async () => Promise.reject(new Error("timeout")) };
    const withSupplement = await buildExperienceCards(request, { zhihu: downZhihu, ai: aiReturning('{"points":["你最看重的是什么？"]}'), createId });
    expect(withSupplement.data).toMatchObject({ source: "AI_SUPPLEMENT", cards: [{ label: SUPPLEMENT_LABEL }] });
    expect(withSupplement.stats.zhihuFailures).toBe(1);

    const nothing = await buildExperienceCards(request, { zhihu: downZhihu, ai: aiReturning("抱歉"), createId });
    expect(nothing.data).toEqual({ source: "NONE", cards: [] });
  });
});

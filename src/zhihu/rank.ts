import type { IntentCandidate } from "@/ai/contracts";

import type { ZhihuEvidence } from "./contracts";

/*
 * Deterministic filtering and ranking; no AI involved.
 * - ContentText shorter than MIN_TEXT_LENGTH is dropped;
 * - the title or text must contain at least one Intent keyword;
 * - duplicates (same link or same question title) are dropped;
 * - sorted by AuthorityLevel, then VoteUpCount; the top 2 are kept.
 */

export const MIN_TEXT_LENGTH = 100;
export const MAX_CARDS = 2;

/** Terms that describe graduates' plans; only those the player actually used become keywords. */
const INTENT_LEXICON = [
  "考研", "读研", "保研", "研究生", "考公", "考编", "公务员", "事业编", "选调", "留学", "出国", "考证", "证书",
  "自媒体", "短视频", "视频", "剪辑", "拍摄", "博主", "直播", "带货", "电商", "创作", "写作",
  "创业", "合伙", "生意", "开店", "店铺", "店里", "接手", "家里", "父母", "爸妈", "回家", "老家", "家乡", "县城",
  "帮忙", "照顾", "找工作", "求职", "上班", "实习", "转行", "跨专业", "专业对口", "校招", "秋招", "春招",
  "大厂", "国企", "外企", "工厂", "技术岗", "销售", "服务业", "程序员", "设计", "自由职业", "接单", "副业",
  "兼职", "灵活就业", "支教", "志愿", "参军", "当兵", "基层", "三支一扶", "西部计划", "休息", "间隔年", "gap",
  "大城市", "一线城市", "北漂", "沪漂", "房租", "存钱", "收入", "赚钱", "家教", "培训", "手艺", "学徒",
  "餐馆", "饭店", "超市", "摆摊",
];

const STOP_BIGRAMS = new Set(["我想", "自己", "一个", "可能", "然后", "如果", "还是", "什么", "感觉", "一下", "开始", "先把"]);

export function intentKeywords(intent: IntentCandidate): string[] {
  const text = [intent.rawText, ...intent.goals, ...intent.priorities, ...intent.constraints, ...intent.currentActions]
    .join("\n")
    .toLowerCase();
  const fromLexicon = INTENT_LEXICON.filter((term) => text.includes(term));
  if (fromLexicon.length > 0) return fromLexicon;
  // Fallback: two-character windows of the goals and first steps, minus function words.
  const grams = new Set<string>();
  for (const phrase of [...intent.goals, ...intent.currentActions]) {
    const chars = [...phrase.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "")];
    for (let index = 0; index + 1 < chars.length; index += 1) {
      const gram = `${chars[index]}${chars[index + 1]}`;
      if (!STOP_BIGRAMS.has(gram)) grams.add(gram);
    }
  }
  return [...grams].slice(0, 24);
}

export function selectEvidence(items: readonly ZhihuEvidence[], keywords: readonly string[], limit = MAX_CARDS): ZhihuEvidence[] {
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const kept = items.filter((item) => {
    const link = item.url.split("?")[0]!;
    if (seenLinks.has(link) || seenTitles.has(item.title)) return false;
    if (item.text.length < MIN_TEXT_LENGTH) return false;
    const haystack = `${item.title}\n${item.text}`.toLowerCase();
    if (!keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) return false;
    seenLinks.add(link);
    seenTitles.add(item.title);
    return true;
  });
  return kept.sort((a, b) => b.authorityLevel - a.authorityLevel || b.voteUpCount - a.voteUpCount).slice(0, limit);
}

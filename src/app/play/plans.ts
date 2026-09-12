import type { IntentCandidate } from "@/ai/contracts";

/**
 * Act 1 plan chips.
 *
 * `label` is the short text on the box and the only thing the player reads.
 * `intent` is the full phrase everything else uses — it goes to the model as
 * selectedPlans and feeds Zhihu ranking, where "帮家里" on its own would both
 * read as vague and miss the ranking lexicon.
 * `query` is a reviewed Zhihu search phrase; null means the option cannot
 * usefully drive a lookup.
 */
export interface PlanOption {
  label: string;
  intent: string;
  query: string | null;
}

export const PLAN_OPTIONS: readonly PlanOption[] = [
  { label: "找工作", intent: "找专业相关工作", query: "应届毕业生 专业对口 第一份工作" },
  { label: "跨专业求职", intent: "跨专业找工作", query: "毕业 跨专业 转行 找工作" },
  { label: "考研", intent: "考研", query: "毕业 考研 二战 经历" },
  { label: "考公考编", intent: "考公 / 考编", query: "毕业后 考公 考编 上岸 经历" },
  { label: "留学", intent: "出国留学", query: "毕业 出国留学 值不值得" },
  { label: "学技能", intent: "学一门职业技能", query: "毕业后 考证 学技能 有用吗" },
  { label: "自由职业", intent: "自由职业 / 接单", query: "毕业 自由职业 接单 收入" },
  { label: "做自媒体", intent: "做自媒体", query: "毕业 做自媒体 短视频 从零开始" },
  { label: "创业", intent: "尝试创业", query: "毕业就创业 真实经历" },
  { label: "回家发展", intent: "回家发展", query: "毕业 回老家 县城 发展" },
  { label: "帮家里经营", intent: "帮家里做生意", query: "毕业 回家 帮父母 打理店铺" },
  { label: "照顾家人", intent: "照顾家人", query: "毕业后 回家 照顾家人 工作" },
  { label: "Gap", intent: "先休息一段时间", query: "毕业 gap 间隔年 休息" },
  { label: "兼职探索", intent: "先做兼职探索方向", query: "毕业 兼职 副业 探索方向" },
  // No query: "还在想" matches nothing useful and would only loosen ranking.
  { label: "其他", intent: "还在想别的方向", query: null },
];

/**
 * Act 1 value chips. They say what the player cares about, so they back
 * Intent.priorities. Unlike the plan chips they never drive a Zhihu lookup:
 * "稳定一点" matches nothing useful on its own and would only loosen ranking.
 */
export const VALUE_OPTIONS: readonly string[] = [
  "收入和存款",
  "稳定和安全感",
  "做自己真正喜欢的事",
  "离家人近一点",
  "学到真本事",
  "时间由自己支配",
  "被看见、被认可",
  "身体和心情别垮掉",
];

const pickedOptions = (plans: readonly string[]) => PLAN_OPTIONS.filter((option) => plans.includes(option.label));

/** The full phrases behind the ticked chips, for the model and for ranking. */
export function planIntents(plans: readonly string[]): string[] {
  return pickedOptions(plans).map((option) => option.intent);
}

/** Up to three phrases, in the order the options are listed; skips options without one. */
export function planQueries(plans: readonly string[]): string[] {
  return pickedOptions(plans)
    .map((option) => option.query)
    .filter((query): query is string => query !== null)
    .slice(0, 3);
}

/**
 * Act 1 has no confirmed Intent yet, so the experience panel builds a throwaway
 * one from the ticked chips. It only feeds Zhihu ranking and never reaches the
 * engine or GameState; the real Intent still comes from UNDERSTAND_INTENT.
 */
export function draftIntentFromPlans(plans: readonly string[], rawText: string): IntentCandidate | null {
  const intents = planIntents(plans).slice(0, 8);
  if (intents.length === 0) return null;
  return {
    rawText: rawText.trim() || `我打算：${intents.join("、")}。`,
    goals: intents,
    priorities: intents,
    constraints: [],
    currentActions: intents,
  };
}

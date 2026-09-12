import type { IntentCandidate } from "@/ai/contracts";

/**
 * Act 1 plan chips.
 *
 * `label` is the short text on the box and the only thing the player reads.
 * `intent` is the full phrase everything else uses — it goes to the model as
 * selectedPlans and feeds Zhihu ranking, where "帮家里" on its own would both
 * read as vague and miss the ranking lexicon.
 */
export interface PlanOption {
  label: string;
  intent: string;
}

export const PLAN_OPTIONS: readonly PlanOption[] = [
  { label: "找工作", intent: "找专业相关工作" },
  { label: "跨专业求职", intent: "跨专业找工作" },
  { label: "考研", intent: "考研" },
  { label: "考公考编", intent: "考公 / 考编" },
  { label: "留学", intent: "出国留学" },
  { label: "学技能", intent: "学一门职业技能" },
  { label: "自由职业", intent: "自由职业 / 接单" },
  { label: "做自媒体", intent: "做自媒体" },
  { label: "创业", intent: "尝试创业" },
  { label: "回家发展", intent: "回家发展" },
  { label: "帮家里经营", intent: "帮家里做生意" },
  { label: "照顾家人", intent: "照顾家人" },
  { label: "Gap", intent: "先休息一段时间" },
  { label: "兼职探索", intent: "先做兼职探索方向" },
  { label: "其他", intent: "还在想别的方向" },
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

/*
 * Act 1 asks a different question from the in-Situation lookup. Almost nobody
 * has walked the player's exact combination of plans, so "people who took this
 * path" matches thinly. What is actually useful before deciding is how people
 * who have been through it say you should choose — so this runs on fixed,
 * reviewed queries instead of the ticked chips.
 */
export const ADVICE_QUERIES: readonly string[] = [
  "毕业后 该怎么选 过来人的建议",
  "应届毕业生 找工作 还是 考研 考公",
  "毕业 方向 迷茫 前辈 经验",
];

/**
 * Ranking input for that lookup. It is deliberately broad: `intentKeywords`
 * only keeps results whose text hits the lexicon, and a general "how to choose"
 * piece would be filtered out by a narrow, chip-derived intent.
 */
export const ADVICE_INTENT: IntentCandidate = {
  rawText: "刚毕业，还在想接下来该怎么选：找工作、考研、考公考编、留学、自由职业、做自媒体、创业、回家发展，都还在考虑。",
  goals: ["还在决定毕业后的方向"],
  priorities: ["先弄清楚都有哪些选择"],
  constraints: [],
  currentActions: ["看看过来人怎么建议"],
};

const pickedOptions = (plans: readonly string[]) => PLAN_OPTIONS.filter((option) => plans.includes(option.label));

/** The full phrases behind the ticked chips, for the model and for ranking. */
export function planIntents(plans: readonly string[]): string[] {
  return pickedOptions(plans).map((option) => option.intent);
}

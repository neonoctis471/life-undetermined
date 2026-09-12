import type { IntentCandidate } from "@/ai/contracts";

/**
 * Act 1 plan chips. Each option carries its own Zhihu search phrase so the
 * first screen can look up real experiences before the player has written
 * anything — the phrases are fixed and reviewed, never model-generated.
 */
export interface PlanOption {
  label: string;
  query: string;
}

export interface PlanGroup {
  title: string;
  options: readonly PlanOption[];
}

export const PLAN_GROUPS: readonly PlanGroup[] = [
  {
    title: "工作与收入",
    options: [
      { label: "找专业相关工作", query: "应届毕业生 专业对口 第一份工作" },
      { label: "先找一份能养活自己的工作", query: "毕业后 先找份工作 养活自己" },
      { label: "跨专业找工作", query: "毕业 跨专业 转行 找工作" },
      { label: "进大厂 / 国企", query: "毕业 进大厂 还是 国企" },
      { label: "做销售 / 服务业", query: "毕业后 做销售 服务业 经历" },
      { label: "进工厂 / 技术岗", query: "毕业 进工厂 技术岗 经历" },
    ],
  },
  {
    title: "继续学习",
    options: [
      { label: "考研", query: "毕业 考研 二战 经历" },
      { label: "考公 / 考编", query: "毕业后 考公 考编 上岸 经历" },
      { label: "出国 / 留学", query: "毕业 出国留学 值不值得" },
      { label: "考证 / 学职业技能", query: "毕业后 考证 学技能 有用吗" },
      { label: "学一门手艺", query: "毕业 学一门手艺 当学徒" },
    ],
  },
  {
    title: "自己尝试",
    options: [
      { label: "做自媒体", query: "毕业 做自媒体 短视频 从零开始" },
      { label: "做视频 / 剪辑", query: "毕业后 剪辑 拍摄 创作 经历" },
      { label: "自由职业 / 接单", query: "毕业 自由职业 接单 收入" },
      { label: "尝试创业", query: "毕业就创业 真实经历" },
      { label: "和朋友做项目", query: "毕业 和朋友 合伙 做项目" },
      { label: "做点小生意", query: "毕业 做小生意 开店 摆摊" },
    ],
  },
  {
    title: "家庭与生活",
    options: [
      { label: "回家发展", query: "毕业 回老家 县城 发展" },
      { label: "帮家里做生意", query: "毕业 回家 帮父母 打理店铺" },
      { label: "照顾家人", query: "毕业后 回家 照顾家人 工作" },
      { label: "去别的城市试试", query: "毕业 去大城市 北漂 第一年" },
      { label: "先休息一段时间", query: "毕业 gap 间隔年 休息" },
      { label: "参军 / 基层服务", query: "大学毕业 参军 三支一扶 基层" },
    ],
  },
];

export const PLAN_OPTIONS: readonly PlanOption[] = PLAN_GROUPS.flatMap((group) => group.options);

/** Up to three phrases, in the order the options are listed. */
export function planQueries(plans: readonly string[]): string[] {
  return PLAN_OPTIONS.filter((option) => plans.includes(option.label))
    .slice(0, 3)
    .map((option) => option.query);
}

/**
 * Act 1 has no confirmed Intent yet, so the experience panel builds a throwaway
 * one from the ticked chips. It only feeds Zhihu ranking and never reaches the
 * engine or GameState; the real Intent still comes from UNDERSTAND_INTENT.
 */
export function draftIntentFromPlans(plans: readonly string[], rawText: string): IntentCandidate | null {
  const labels = PLAN_OPTIONS.filter((option) => plans.includes(option.label))
    .map((option) => option.label)
    .slice(0, 8);
  if (labels.length === 0) return null;
  return {
    rawText: rawText.trim() || `我打算：${labels.join("、")}。`,
    goals: labels,
    priorities: labels,
    constraints: [],
    currentActions: labels,
  };
}

/*
 * Act 1, block 04 — what this year's graduates are actually choosing.
 *
 * Every figure here must be quotable from the page at `sourceUrl`. The project
 * rule (docs/BACKEND_HANDOFF_V2.md) is explicit: a real source with year, scope
 * and methodology, or 「暂无已验证数据」 — never an invented percentage.
 *
 * Why these four and not a 就业/升学/灵活就业/其他 distribution: no publicly
 * readable page carries a complete, single-cohort 毕业去向 breakdown. 麦可思's
 * full table lives in the paid 就业蓝皮书; its own site publishes only a report
 * outline, and scattered indicators found elsewhere span different cohorts and
 * sum to well under 100%. Presenting those as a distribution would be fabricated
 * data, so the block shows individually sourced figures about what graduates
 * choose and weigh instead — which is what the player is being asked anyway.
 */

export interface GraduationStat {
  /** Rendered figure. null renders 「暂无已验证数据」 rather than a number. */
  value: string | null;
  label: string;
  cohort: string;
  /** Population surveyed, including an honest note when the size is not published. */
  scope: string;
  sourceName: string;
  sourceUrl: string;
  /** What the number does and does not mean. */
  note: string;
}

const XINHUA = {
  sourceName: "新华网《这届大学生，求职有啥新特点？》（2026-01-28）",
  sourceUrl: "https://www.news.cn/politics/20260128/e71c8cdb321d491dbe4adbba6c23a1eb/c.html",
} as const;

const EMPLOYER_REPORT = "《2025中国年度最佳雇主评选报告》，转引自新华网报道；报道未公开样本量";
const ZHAOPIN_SURVEY = "智联招聘面向大学生的调研，转引自新华网报道；报道未公开样本量";

export const GRADUATION_STATS: readonly GraduationStat[] = [
  {
    value: "86%",
    label: "希望雇主尊重员工",
    cohort: "2025 年调查",
    scope: EMPLOYER_REPORT,
    ...XINHUA,
    note: "受访大学生选出的理想雇主特征，按选择比例排序，各项可多选，不构成互斥分布。",
  },
  {
    value: "73%",
    label: "看重积极健康的工作氛围",
    cohort: "2025 年调查",
    scope: EMPLOYER_REPORT,
    ...XINHUA,
    note: "同一份理想雇主调查中的另一项，可多选。",
  },
  {
    value: "72%",
    label: "看重良好的收入前景",
    cohort: "2025 年调查",
    scope: EMPLOYER_REPORT,
    ...XINHUA,
    note: "与「完善的福利待遇」并列，同为 72%，可多选。",
  },
  {
    value: "24%",
    label: "打算毕业后试试灵活就业",
    cohort: "2025 年调查",
    scope: ZHAOPIN_SURVEY,
    ...XINHUA,
    note: "另有 49% 把灵活就业看作全职工作之外的补充，而非唯一出路。",
  },
];

export const STATS_CAPTION = "这些是真实调查里的数字，不是给你的建议——放在这里只是想说明，同一届人也在往很多不同的方向走。";

/** Nothing here is a distribution, so the UI must never total these. */
export const NO_DATA_TEXT = "暂无已验证数据";

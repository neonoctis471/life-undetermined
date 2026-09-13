/*
 * Fixed copy rendered with the subsetted display font (Noto Sans SC Black).
 * scripts/build-display-font.mjs builds the woff2 subset from the string
 * literals in this file only. Never render AI-generated text with the display
 * font: its glyphs cannot be enumerated in advance.
 */

export const DISPLAY = {
  wordmark: "人生未定式",
  heroTitle: ["人生", "未定式"],
  // The hero renders this with its own line break and emphasis markup.
  heroSubtitle: "把知乎网友真实走过的人生经验，变成你可以亲自验证、对照和讨论的平行人生。",
  start: "开始我的五年",
  intentTitle: "毕业了，你准备怎样开始？",
  confirmTitle: "我理解的是这样，对吗？",
  chapterTitles: {
    DAY_8: "生活，开始展开。",
    MONTH_7: "事情有了后果。",
    YEAR_4: "一个绕不开的决定。",
  },
  eyebrows: {
    prologue: "序章 / 毕业那天",
    DAY_8: "第一幕 / 毕业后的第 8 天",
    MONTH_7: "第二幕 / 毕业后的第 7 个月",
    YEAR_4: "第三幕 / 毕业后的第 4 年",
    reunion: "第四幕 / 毕业五年",
    fork: "回溯 / 回到第 4 年",
    comparison: "终章 / 两段人生",
  },
  possibilityTitles: {
    MOMENTUM: "顺势发展的可能",
    UNEXPECTED: "意料之外的变化",
  },
  decideTitle: "你准备怎么办？",
  decidedTitle: "你决定：",
  outcomeTitle: "后来。",
  factsTitle: "现在真正发生了",
  accelerationTitle: "时间继续向前。",
  reunionTitle: "毕业五年 · 同学聚会",
  memorialTitle: "五年纪念",
  forkQuestion: "如果当时换一种选择呢？",
  forkTitle: "这一次，换成……",
  rewindTitle: "回到过去。",
  comparisonTitle: "两段人生。",
  comparisonSubtitle: "最后的比较不是哪个更好",
  endingTitle: "没有哪一种人生能够证明另一种人生是错的",
  buttons: [
    "就这样开始",
    "正在理解你的打算…",
    "对，就是这样",
    "我想改一下",
    "看看这种可能",
    "继续",
    "重试",
    "就这么做",
    "看看后来发生了什么",
    "五年以后",
    "回到这个决定",
    "换成这个选择",
    "换一个选择",
    "结束",
    "重新开始",
  ],
} as const;

export const ACT_LABELS = ["00 · 序章", "01 · 第 8 天", "02 · 第 7 个月", "03 · 第 4 年", "04 · 毕业五年", "05 · 两段人生"] as const;

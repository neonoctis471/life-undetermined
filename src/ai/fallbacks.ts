import type { MainChapter } from "./contracts";
import type { IntentContext } from "./normalize";

/*
 * Conservative templates used only after the model failed twice. They are
 * raw drafts on purpose: they pass through the same normalize() and strict
 * schemas as model output, and the response is labelled generation=FALLBACK.
 */

export function buildFallbackIntentDraft(context: IntentContext): Record<string, unknown> {
  const excerpt = context.rawText.trim().replace(/\s+/g, " ");
  const quoted = excerpt.length > 80 ? `${excerpt.slice(0, 79)}…` : excerpt;
  return {
    summary: `你是这样说的：“${quoted}”。接下来，我们就从这个打算出发。`,
    goals: context.selectedPlans.length > 0 ? context.selectedPlans.slice(0, 3) : ["按自己的节奏开始毕业后的生活"],
    priorities: context.selectedValues.length > 0 ? context.selectedValues.slice(0, 3) : ["弄清自己真正想要什么"],
    constraints: [],
    currentActions: ["把计划里的第一步具体安排下来"],
  };
}

const SITUATION_TEMPLATES: Record<MainChapter, Record<string, unknown>> = {
  DAY_8: {
    tensions: ["新计划和日常安排争夺时间"],
    externalConditions: [],
    triggerFactIndexes: [],
    momentum: {
      summary: "事情比想象中稍微顺了一点。你为新计划做的第一件事有了小小的回应，但它也开始向你要更多时间。",
      scene:
        "毕业后的第八天傍晚，你把计划里的第一件事做完了一半。有人问起你最近在忙什么，你发现自己能讲清楚的比想象中多。可家里的事、朋友的邀约和自己的安排同时挤了过来，今晚只能先顾一头。",
      actions: ["趁着这点势头，今晚把它做完", "先照顾家里的事，明天再继续", "找个人聊聊，听听别人的看法"],
    },
    unexpected: {
      summary: "生活没有完全按计划走。一件突发的事占用了你原本安排好的时间，身边的人也对你的打算有了不同意见。",
      scene:
        "毕业后的第八天下午，你刚准备开始今天的计划，一件突发的事把你叫走了。等你忙完回来，天已经黑了。家里人随口问了一句“你那个打算到底行不行”，你一时不知道怎么回答。",
      actions: ["把今天的计划挪到明天早上", "认真和家里人解释一次自己的打算", "先放一放，看看这件事怎么收尾"],
    },
  },
  MONTH_7: {
    tensions: ["已经开始的事需要更多投入"],
    externalConditions: [],
    triggerFactIndexes: [],
    momentum: {
      summary: "之前做的事开始有了后续。它给你带来了一个继续往前走的机会，也意味着要让出别的时间。",
      scene:
        "毕业后的第七个月，之前的决定开始显出后果。一个新的机会摆在面前：接下它，就得把其他安排往后挪；不接，也许要再等很久。你盯着手机上的消息，还没有回复。",
      actions: ["接下这个机会，重新排时间", "先问清楚条件，再做决定", "婉拒，先把手上的事做稳"],
    },
    unexpected: {
      summary: "一件预料之外的事打乱了这几个月建立起来的节奏，你得重新想想接下来怎么安排。",
      scene:
        "毕业后的第七个月，一件预料之外的事打乱了你这几个月的节奏。原本定好的安排被迫中断，身边的人也在等你拿主意。你意识到，不做点调整，事情会一直这样拖下去。",
      actions: ["暂停一部分计划，先把这件事处理好", "和相关的人坐下来重新分工", "硬撑着两边都不放"],
    },
  },
  YEAR_4: {
    tensions: ["几年的积累逼近一个取舍"],
    externalConditions: [],
    triggerFactIndexes: [],
    momentum: {
      summary: "这几年的积累让一条路越来越清晰，但继续走下去，就要放下另一些你一直在兼顾的东西。",
      scene:
        "毕业后的第四年，你发现自己这几年做的事慢慢连成了一条线。一个能让它更进一步的决定摆在面前，可它需要你投入更多，也意味着要放下一些一直在兼顾的事。",
      actions: ["全力投入这条路", "维持现在的节奏，不急着加码", "重新和身边的人商量分工"],
    },
    unexpected: {
      summary: "外部环境和身边的人都发生了变化，你原先的安排不再合适，必须做一个会影响之后几年的选择。",
      scene:
        "毕业后的第四年，一件意料之外的变化让原先的安排不再合适。身边的人对你有新的期待，你自己也不确定还想不想按原样走下去。这次的决定，会影响之后好几年。",
      actions: ["顺着变化调整方向", "坚持原来的安排，想办法应对", "先暂停一段时间，想清楚再说"],
    },
  },
};

export function buildFallbackSituationDraft(chapter: MainChapter): Record<string, unknown> {
  return structuredClone(SITUATION_TEMPLATES[chapter]);
}

export function buildFallbackLifeDraft(
  input: { mode: "FIVE_YEARS" } | { mode: "COUNTERFACTUAL"; originalAction: string; replacementAction: string },
): Record<string, unknown> {
  if (input.mode === "FIVE_YEARS") {
    // Timeline and memories are filled by normalize() from the player's real Facts.
    return {
      timeline: [],
      currentState: "五年过去了。之前的那些决定慢慢变成了日常的一部分：有些事一直在做，有些事已经放下。",
      reunionAnswer: "还在按自己的节奏过日子，之前开始的事情，有的还在继续。",
      commemorativeFacts: [],
    };
  }
  const clip = (text: string) => (text.length > 24 ? `${text.slice(0, 23)}…` : text);
  const original = clip(input.originalAction);
  const replacement = clip(input.replacementAction);
  return {
    timeline: [
      { label: "一个月以后", summary: `这一次，你选择了「${replacement}」。最初的变化很小，只是日常安排有了一点不同。` },
      { label: "五年以后", summary: "很多事情和原来那条路相似，也有一些因为那个决定而慢慢不同。" },
    ],
    currentState: "五年过去了。这条路上的日子和原来那条路有相似的地方，也有一些只属于这个选择的变化。",
    reunionAnswer: "差不多还是那些事，只是当年那个决定之后，节奏变得不太一样了。",
    commemorativeFacts: [`第四年选择了「${replacement}」`],
    comparison: {
      changedByDecision: [`第四年的决定：「${original}」换成「${replacement}」`],
      unchanged: ["那个决定之前发生的所有事情"],
      external: [],
    },
  };
}

export function buildFallbackOutcomeDraft(actionLabel: string): Record<string, unknown> {
  const label = actionLabel.length > 24 ? `${actionLabel.slice(0, 23)}…` : actionLabel;
  return {
    narrative: `你决定「${label}」，并照着这个决定做了下去。事情没有想象中那么顺利，也没有想象中那么糟。几天之后，生活因为这个决定有了一点变化，也留下了一些还没想清楚的事。`,
    gains: ["按自己的决定行动了"],
    costs: ["花掉了原本安排给别处的时间"],
    unresolvedConsequences: [],
    facts: [{ kind: "ACTIVITY", statement: `按「${label}」的方式处理了这件事`, causalReasons: ["PLAYER_DECISION"] }],
  };
}

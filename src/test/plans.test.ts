import { describe, expect, it } from "vitest";

import { IntentCandidateSchema, SearchQueryTextSchema } from "@/ai/contracts";
import { PLAN_GROUPS, PLAN_OPTIONS, draftIntentFromPlans, planQueries } from "@/app/play/plans";
import { intentKeywords } from "@/zhihu/rank";

describe("Act 1 plan options", () => {
  it("has unique labels and valid search phrases", () => {
    const labels = PLAN_OPTIONS.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const option of PLAN_OPTIONS) {
      expect(SearchQueryTextSchema.safeParse(option.query).success).toBe(true);
    }
  });

  it("keeps every group non-empty", () => {
    for (const group of PLAN_GROUPS) expect(group.options.length).toBeGreaterThan(0);
  });

  it("gives every option at least one ranking keyword", () => {
    // A chip nothing in the lexicon matches would silently drop every card.
    for (const option of PLAN_OPTIONS) {
      const intent = draftIntentFromPlans([option.label], "");
      expect(intent).not.toBeNull();
      expect(intentKeywords(intent!).length).toBeGreaterThan(0);
    }
  });
});

describe("draftIntentFromPlans", () => {
  it("returns null when nothing is ticked", () => {
    expect(draftIntentFromPlans([], "随便写点什么")).toBeNull();
  });

  it("builds a schema-valid candidate from chips alone", () => {
    const intent = draftIntentFromPlans(["帮家里做生意", "做自媒体"], "  ");
    expect(IntentCandidateSchema.safeParse(intent).success).toBe(true);
    expect(intent?.goals).toEqual(["做自媒体", "帮家里做生意"]);
    expect(intent?.rawText).toContain("帮家里做生意");
  });

  it("prefers what the player actually wrote", () => {
    const intent = draftIntentFromPlans(["考研"], "我想再试一年考研。");
    expect(intent?.rawText).toBe("我想再试一年考研。");
  });

  it("ignores labels that are not options and caps goals at eight", () => {
    const every = PLAN_OPTIONS.map((option) => option.label);
    const intent = draftIntentFromPlans([...every, "凭空捏造的打算"], "");
    expect(intent?.goals).toHaveLength(8);
    expect(intent?.goals).not.toContain("凭空捏造的打算");
    expect(IntentCandidateSchema.safeParse(intent).success).toBe(true);
  });
});

describe("planQueries", () => {
  it("sends at most three phrases", () => {
    const queries = planQueries(PLAN_OPTIONS.map((option) => option.label));
    expect(queries).toHaveLength(3);
  });

  it("is empty when nothing matches", () => {
    expect(planQueries(["凭空捏造的打算"])).toEqual([]);
  });
});

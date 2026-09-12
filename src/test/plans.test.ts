import { describe, expect, it } from "vitest";

import { IntentCandidateSchema, SearchQueryTextSchema } from "@/ai/contracts";
import { PLAN_OPTIONS, VALUE_OPTIONS, draftIntentFromPlans, planIntents, planQueries } from "@/app/play/plans";
import { intentKeywords } from "@/zhihu/rank";

const labelsOf = (options: readonly { label: string }[]) => options.map((option) => option.label);

describe("Act 1 plan options", () => {
  it("has unique short labels and unique full phrases", () => {
    const labels = labelsOf(PLAN_OPTIONS);
    const intents = PLAN_OPTIONS.map((option) => option.intent);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(intents).size).toBe(intents.length);
  });

  it("keeps every search phrase valid, or explicitly null", () => {
    for (const option of PLAN_OPTIONS) {
      if (option.query === null) continue;
      expect(SearchQueryTextSchema.safeParse(option.query).success).toBe(true);
    }
  });

  it("fits the request schema's 40-char cap on each plan sent to the model", () => {
    for (const option of PLAN_OPTIONS) expect(option.intent.length).toBeLessThanOrEqual(40);
  });

  it("gives every searchable option at least one ranking keyword", () => {
    // A plan nothing in the lexicon matches would silently drop every card.
    for (const option of PLAN_OPTIONS) {
      if (option.query === null) continue;
      const intent = draftIntentFromPlans([option.label], "");
      expect(intent).not.toBeNull();
      expect(intentKeywords(intent!).length).toBeGreaterThan(0);
    }
  });
});

describe("planIntents", () => {
  it("maps short labels to the full phrases", () => {
    expect(planIntents(["帮家里经营", "做自媒体"])).toEqual(["做自媒体", "帮家里做生意"]);
  });

  it("ignores labels that are not options", () => {
    expect(planIntents(["凭空捏造的打算"])).toEqual([]);
  });
});

describe("planQueries", () => {
  it("sends at most three phrases", () => {
    expect(planQueries(labelsOf(PLAN_OPTIONS))).toHaveLength(3);
  });

  it("skips options that carry no search phrase", () => {
    // "其他" alone must not produce a request: queries is .min(1) server-side.
    expect(planQueries(["其他"])).toEqual([]);
  });

  it("is empty when nothing matches", () => {
    expect(planQueries(["凭空捏造的打算"])).toEqual([]);
  });
});

describe("draftIntentFromPlans", () => {
  it("returns null when nothing is ticked", () => {
    expect(draftIntentFromPlans([], "随便写点什么")).toBeNull();
  });

  it("builds a schema-valid candidate from the full phrases", () => {
    const intent = draftIntentFromPlans(["帮家里经营", "做自媒体"], "  ");
    expect(IntentCandidateSchema.safeParse(intent).success).toBe(true);
    expect(intent?.goals).toEqual(["做自媒体", "帮家里做生意"]);
    expect(intent?.rawText).toContain("帮家里做生意");
  });

  it("prefers what the player actually wrote", () => {
    const intent = draftIntentFromPlans(["考研"], "我想再试一年考研。");
    expect(intent?.rawText).toBe("我想再试一年考研。");
  });

  it("caps goals at eight", () => {
    const intent = draftIntentFromPlans([...labelsOf(PLAN_OPTIONS), "凭空捏造的打算"], "");
    expect(intent?.goals).toHaveLength(8);
    expect(intent?.goals).not.toContain("凭空捏造的打算");
    expect(IntentCandidateSchema.safeParse(intent).success).toBe(true);
  });
});

describe("Act 1 value options", () => {
  it("has unique labels that fit the request schema", () => {
    expect(VALUE_OPTIONS.length).toBeGreaterThan(0);
    expect(new Set(VALUE_OPTIONS).size).toBe(VALUE_OPTIONS.length);
    for (const value of VALUE_OPTIONS) expect(value.length).toBeLessThanOrEqual(40);
  });

  it("stays out of the Zhihu lookup", () => {
    // Values are not plans: ticking one must not add a search phrase.
    expect(planQueries([...VALUE_OPTIONS])).toEqual([]);
    expect(draftIntentFromPlans([...VALUE_OPTIONS], "")).toBeNull();
  });
});

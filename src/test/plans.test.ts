import { describe, expect, it } from "vitest";

import { IntentCandidateSchema, SearchQueryTextSchema } from "@/ai/contracts";
import { ADVICE_INTENT, ADVICE_QUERIES, PLAN_OPTIONS, VALUE_OPTIONS, planIntents } from "@/app/play/plans";
import { ExperienceRequestSchema } from "@/zhihu/contracts";
import { intentKeywords } from "@/zhihu/rank";

describe("Act 1 plan options", () => {
  it("has unique short labels and unique full phrases", () => {
    const labels = PLAN_OPTIONS.map((option) => option.label);
    const intents = PLAN_OPTIONS.map((option) => option.intent);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(intents).size).toBe(intents.length);
  });

  it("fits the request schema's 40-char cap on each plan sent to the model", () => {
    for (const option of PLAN_OPTIONS) expect(option.intent.length).toBeLessThanOrEqual(40);
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

describe("Act 1 value options", () => {
  it("has unique labels that fit the request schema", () => {
    expect(VALUE_OPTIONS.length).toBeGreaterThan(0);
    expect(new Set(VALUE_OPTIONS).size).toBe(VALUE_OPTIONS.length);
    for (const value of VALUE_OPTIONS) expect(value.length).toBeLessThanOrEqual(40);
  });
});

describe("Act 1 graduation-advice lookup", () => {
  it("sends a request the server will accept", () => {
    const request = { intent: ADVICE_INTENT, situation: null, queries: [...ADVICE_QUERIES] };
    expect(ExperienceRequestSchema.safeParse(request).success).toBe(true);
    expect(IntentCandidateSchema.safeParse(ADVICE_INTENT).success).toBe(true);
    for (const query of ADVICE_QUERIES) expect(SearchQueryTextSchema.safeParse(query).success).toBe(true);
  });

  it("keeps the ranking intent broad enough for general advice to survive", () => {
    // selectEvidence drops anything whose text hits none of these keywords, so a
    // narrow intent would filter out exactly the "how should I choose" pieces
    // this block exists to surface.
    const keywords = intentKeywords(ADVICE_INTENT);
    expect(keywords.length).toBeGreaterThanOrEqual(6);
    for (const term of ["找工作", "考研", "考公", "留学", "创业"]) {
      expect(keywords).toContain(term);
    }
  });
});

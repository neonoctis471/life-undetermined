import { describe, expect, it } from "vitest";

import { GRADUATION_STATS, NO_DATA_TEXT } from "@/app/play/graduation-stats";

describe("Act 1 graduation statistics", () => {
  it("gives every figure a citable source", () => {
    // docs/BACKEND_HANDOFF_V2.md: a real source with year, scope and method,
    // or 「暂无已验证数据」 — never a percentage without provenance.
    for (const stat of GRADUATION_STATS) {
      expect(stat.label.trim().length).toBeGreaterThan(0);
      expect(stat.cohort.trim().length).toBeGreaterThan(0);
      expect(stat.scope.trim().length).toBeGreaterThan(0);
      expect(stat.note.trim().length).toBeGreaterThan(0);
      expect(stat.sourceName.trim().length).toBeGreaterThan(0);
      expect(stat.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("does not pretend to be a distribution", () => {
    // These are separate survey results. If they ever summed to ~100% someone
    // has quietly turned them back into a 去向分布, which is not what they are.
    const numbers = GRADUATION_STATS.map((stat) => Number.parseFloat(stat.value ?? "0")).filter((n) => !Number.isNaN(n));
    const total = numbers.reduce((sum, n) => sum + n, 0);
    expect(total).toBeGreaterThan(100);
  });

  it("has a fallback string for unverified figures", () => {
    expect(NO_DATA_TEXT.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";

import {
  CausalReasonSchema,
  ChapterSchema,
  ContentProvenanceSchema,
  GamePhaseSchema,
  IdSchema,
  LongTextSchema,
  ShortTextSchema,
  TimestampSchema,
} from "@/contracts/game/common";

describe("shared game contracts", () => {
  it("accepts canonical identifiers, timestamps, phases and provenance", () => {
    expect(IdSchema.parse("11111111-1111-4111-8111-111111111111")).toBeTruthy();
    expect(TimestampSchema.parse("2026-09-09T12:00:00.000Z")).toBeTruthy();
    expect(GamePhaseSchema.parse("INTENT_CONFIRMED")).toBe("INTENT_CONFIRMED");
    expect(ChapterSchema.parse("MONTH_7")).toBe("MONTH_7");
    expect(ContentProvenanceSchema.parse("ZHIHU_ADAPTED")).toBe("ZHIHU_ADAPTED");
  });

  it("rejects invented enum values and malformed identifiers", () => {
    expect(IdSchema.safeParse("game-1").success).toBe(false);
    expect(GamePhaseSchema.safeParse("AI_DECIDES_LIFE").success).toBe(false);
    expect(ContentProvenanceSchema.safeParse("UNKNOWN_SOURCE").success).toBe(false);
  });

  it("trims short text and enforces its one-to-160 character bounds", () => {
    expect(ShortTextSchema.parse("  hello world  ")).toBe("hello world");
    expect(ShortTextSchema.parse("a")).toBe("a");
    expect(ShortTextSchema.parse("x".repeat(160))).toHaveLength(160);
    expect(ShortTextSchema.safeParse("").success).toBe(false);
    expect(ShortTextSchema.safeParse("x".repeat(161)).success).toBe(false);
    expect(ShortTextSchema.safeParse("   ").success).toBe(false);
  });

  it("trims long text and enforces its one-to-4000 character bounds", () => {
    expect(LongTextSchema.parse("  a longer narrative  ")).toBe("a longer narrative");
    expect(LongTextSchema.parse("a")).toBe("a");
    expect(LongTextSchema.parse("x".repeat(4_000))).toHaveLength(4_000);
    expect(LongTextSchema.safeParse("").success).toBe(false);
    expect(LongTextSchema.safeParse("x".repeat(4_001)).success).toBe(false);
    expect(LongTextSchema.safeParse("   ").success).toBe(false);
  });

  it("requires timestamps to include UTC or a non-zero offset", () => {
    expect(TimestampSchema.parse("2026-09-09T12:00:00.000-04:00")).toBe(
      "2026-09-09T12:00:00.000-04:00",
    );
    expect(TimestampSchema.safeParse("2026-09-09T12:00:00.000").success).toBe(false);
  });

  it("accepts every causal reason and rejects unknown reasons", () => {
    const reasons = [
      "PLAYER_DECISION",
      "PRIOR_FACT",
      "EXTERNAL_EVENT",
      "MIXED_CAUSE",
    ] as const;

    for (const reason of reasons) {
      expect(CausalReasonSchema.parse(reason)).toBe(reason);
    }
    expect(CausalReasonSchema.safeParse("AI_DECISION").success).toBe(false);
  });

  it("accepts every game phase and rejects unknown phases", () => {
    const phases = [
      "CREATED",
      "INTENT_CONFIRMED",
      "SITUATION_READY",
      "DECISION_RECORDED",
      "OUTCOME_RESOLVED",
      "LONG_TERM_READY",
      "REUNION_READY",
      "FORK_READY",
      "COMPARISON_READY",
      "COMPLETED",
    ] as const;

    for (const phase of phases) {
      expect(GamePhaseSchema.parse(phase)).toBe(phase);
    }
    expect(GamePhaseSchema.safeParse("AI_DECIDES_LIFE").success).toBe(false);
  });

  it("accepts every chapter and rejects unknown chapters", () => {
    const chapters = ["DAY_8", "MONTH_7", "YEAR_4", "YEAR_5", "COUNTERFACTUAL"] as const;

    for (const chapter of chapters) {
      expect(ChapterSchema.parse(chapter)).toBe(chapter);
    }
    expect(ChapterSchema.safeParse("YEAR_10").success).toBe(false);
  });

  it("accepts every content provenance and rejects unknown provenance", () => {
    const provenances = [
      "ZHIHU_ORIGINAL",
      "ZHIHU_ADAPTED",
      "AI_SUPPLEMENT",
      "GAME_SIMULATION",
    ] as const;

    for (const provenance of provenances) {
      expect(ContentProvenanceSchema.parse(provenance)).toBe(provenance);
    }
    expect(ContentProvenanceSchema.safeParse("UNKNOWN_SOURCE").success).toBe(false);
  });
});

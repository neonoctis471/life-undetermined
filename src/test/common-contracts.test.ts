import { describe, expect, it } from "vitest";

import {
  ChapterSchema,
  ContentProvenanceSchema,
  GamePhaseSchema,
  IdSchema,
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
});

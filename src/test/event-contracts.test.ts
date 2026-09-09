import { describe, expect, it } from "vitest";

import { GameEventSchema } from "@/contracts/game";

const event = {
  id: "11111111-1111-4111-8111-111111111111",
  gameId: "22222222-2222-4222-8222-222222222222",
  branchId: "33333333-3333-4333-8333-333333333333",
  eventVersion: 1,
  occurredAt: "2026-09-09T12:00:00.000Z",
  idempotencyKey: "intent-submit-001",
  type: "INTENT_CONFIRMED",
  payload: {
    rawText: "先找工作，同时学习新技能。",
    goals: ["找到工作"],
    priorities: ["经济安全"],
    constraints: [],
    currentActions: ["投递简历"],
    confirmedAt: "2026-09-09T12:00:00.000Z",
  },
} as const;

describe("authoritative event contract", () => {
  it("parses a typed event envelope", () => {
    expect(GameEventSchema.parse(event).eventVersion).toBe(1);
  });

  it("rejects unknown event types and negative versions", () => {
    expect(
      GameEventSchema.safeParse({ ...event, type: "FACTS_REWRITTEN" }).success,
    ).toBe(false);
    expect(
      GameEventSchema.safeParse({ ...event, eventVersion: -1 }).success,
    ).toBe(false);
  });
});

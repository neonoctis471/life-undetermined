import { describe, expect, it } from "vitest";

import { MAX_REFLECTION_ITEMS, normalizeOutcomeDraft, type OutcomeContext } from "@/ai/normalize";
import { GameStateSchema } from "@/game-state/contracts";
import { createInitialGameState } from "@/game-state";
import { OutcomeSchema, ResolvedOutcomeSchema } from "@/contracts/game";

const deps = { createId: () => "11111111-2222-4333-8444-555555555555" };
const context: OutcomeContext = {
  decisionId: "99999999-8888-4777-8666-555555555555",
  facts: [{ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }],
  actionLabel: "和家里商量，留二十分钟把视频拍完",
  validation: "ACCEPTED",
};

const draft = (reflection: unknown) => ({
  narrative: "你和家里说明了想先拍完再帮忙，最后谈成了二十分钟。",
  facts: [
    { kind: "ACTIVITY", statement: "完成了第一条短视频", causalReasons: ["PLAYER_DECISION"] },
    { kind: "RELATIONSHIP", statement: "第一次和家人协商拍摄时间", causalReasons: ["PLAYER_DECISION"] },
  ],
  reflection,
});

describe("reflection normalization", () => {
  it("keeps well-formed items and maps 1-based fact indexes", () => {
    const outcome = normalizeOutcomeDraft(
      draft([
        { kind: "METHOD", content: "这是你第一次主动协商时间，而不是直接放弃其中一个安排。", horizon: "LASTING", factIndexes: [2] },
        { kind: "COST", content: "今晚留给剪辑的时间更少了。", horizon: "IMMEDIATE", factIndexes: [] },
      ]),
      context,
      deps,
    );
    expect(outcome.reflection).toHaveLength(2);
    expect(outcome.reflection?.[0]).toMatchObject({ kind: "METHOD", horizon: "LASTING", evidenceFactIndexes: [1] });
    expect(outcome.reflection?.[1]).toMatchObject({ kind: "COST", horizon: "IMMEDIATE", evidenceFactIndexes: [] });
  });

  it("accepts the Chinese labels the model sometimes echoes instead of the enum", () => {
    const outcome = normalizeOutcomeDraft(
      draft([{ kind: "付出的代价", content: "两个安排都保住了，但准备的时间更少。", horizon: "当下" }]),
      context,
      deps,
    );
    expect(outcome.reflection?.[0]).toMatchObject({ kind: "COST", horizon: "IMMEDIATE" });
  });

  it("drops out-of-range fact indexes rather than pointing at nothing", () => {
    const outcome = normalizeOutcomeDraft(
      draft([{ kind: "METHOD", content: "你先问了有没有调整余地。", factIndexes: [1, 9, 0, -3] }]),
      context,
      deps,
    );
    expect(outcome.reflection?.[0]?.evidenceFactIndexes).toEqual([0]);
  });

  it("caps the list and drops duplicates", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ kind: "PERSPECTIVE", content: `第 ${index} 条留下的东西。` }));
    const outcome = normalizeOutcomeDraft(draft([...many, { kind: "PERSPECTIVE", content: "第 0 条留下的东西。" }]), context, deps);
    expect(outcome.reflection).toHaveLength(MAX_REFLECTION_ITEMS);
  });

  it("omits reflection entirely when the model returns nothing", () => {
    for (const empty of [undefined, [], null, "不知道", ["不知道"], [""]]) {
      const outcome = normalizeOutcomeDraft(draft(empty), context, deps);
      expect(outcome.reflection).toBeUndefined();
      expect(ResolvedOutcomeSchema.safeParse(outcome).success).toBe(true);
    }
  });

  it("never lets a broken reflection cost the Facts", () => {
    // Facts are hard state; reflection is not worth a single one of them.
    for (const hostile of [[{ kind: 42, content: {} }], [null, 7, []], "reflection", { items: [] }]) {
      const outcome = normalizeOutcomeDraft(draft(hostile), context, deps);
      expect(outcome.addedFacts).toHaveLength(2);
      expect(ResolvedOutcomeSchema.safeParse(outcome).success).toBe(true);
    }
  });

  it("truncates a very long item instead of rejecting it", () => {
    const outcome = normalizeOutcomeDraft(draft([{ kind: "REALITY", content: "很长".repeat(400) }]), context, deps);
    expect(outcome.reflection?.[0]?.content.length).toBeLessThanOrEqual(120);
    expect(ResolvedOutcomeSchema.safeParse(outcome).success).toBe(true);
  });
});

describe("save compatibility", () => {
  it("reads an Outcome written before reflection existed", () => {
    const legacy = {
      id: "11111111-2222-4333-8444-555555555555",
      decisionId: context.decisionId,
      narrative: "旧存档里的结果。",
      gains: [],
      costs: [],
      addedFacts: [],
      unresolvedConsequences: [],
      validation: "ACCEPTED" as const,
    };
    expect(OutcomeSchema.safeParse(legacy).success).toBe(true);
    expect("reflection" in OutcomeSchema.parse(legacy)).toBe(false);
  });

  it("still parses a whole GameState that has no reflection anywhere", () => {
    // Guards the .strict() outcome schema against becoming save-breaking.
    const state = createInitialGameState({ createId: () => crypto.randomUUID(), now: () => new Date().toISOString() });
    expect(GameStateSchema.safeParse(state).success).toBe(true);
  });
});

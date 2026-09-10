import { describe, expect, it, vi } from "vitest";

import type { Intent } from "@/contracts/game";
import { createGameStateStore } from "@/game-state/store";
import type { GameStorage } from "@/game-state/storage";

const timestamp = "2026-09-09T12:00:00.000Z";
const gameIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];
const intent: Intent = {
  rawText: "先回家帮忙。",
  goals: ["帮助家庭"],
  priorities: ["家庭责任"],
  constraints: [],
  currentActions: ["回家"],
  confirmedAt: timestamp,
};

function memoryGameStorage(): GameStorage & { saved: unknown[]; cleared: number } {
  let stored: ReturnType<GameStorage["load"]> = { status: "empty" };
  return {
    saved: [],
    cleared: 0,
    load: () => stored,
    save(state) {
      this.saved.push(state);
      stored = { status: "restored", state };
    },
    clear() {
      this.cleared += 1;
      stored = { status: "empty" };
    },
  };
}

describe("persistent game state store", () => {
  it("creates and saves a new game when no save exists", () => {
    const storage = memoryGameStorage();
    const store = createGameStateStore({
      storage,
      engine: { createId: () => gameIds[0]!, now: () => timestamp },
    });

    expect(store.restoreStatus).toBe("created");
    expect(store.getState().gameId).toBe(gameIds[0]);
    expect(storage.saved).toHaveLength(1);
  });

  it("dispatches through the engine, saves once and notifies subscribers", () => {
    const storage = memoryGameStorage();
    const store = createGameStateStore({ storage, engine: { createId: () => gameIds[0]!, now: () => timestamp } });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    const next = store.dispatch({ type: "CONFIRM_INTENT", intent });

    expect(next.currentStage).toBe("INTENT_CONFIRMED");
    expect(storage.saved).toHaveLength(2);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    store.reset();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("restores an existing game without replacing it", () => {
    const storage = memoryGameStorage();
    const first = createGameStateStore({ storage, engine: { createId: () => gameIds[0]!, now: () => timestamp } });
    first.dispatch({ type: "CONFIRM_INTENT", intent });
    const restored = createGameStateStore({ storage, engine: { createId: () => gameIds[1]!, now: () => timestamp } });

    expect(restored.restoreStatus).toBe("restored");
    expect(restored.getState().gameId).toBe(gameIds[0]);
    expect(restored.getState().currentStage).toBe("INTENT_CONFIRMED");
  });

  it("resets only the game save and immediately persists a fresh game", () => {
    const storage = memoryGameStorage();
    let index = 0;
    const store = createGameStateStore({ storage, engine: { createId: () => gameIds[index++]!, now: () => timestamp } });

    const fresh = store.reset();

    expect(storage.cleared).toBe(1);
    expect(fresh.gameId).toBe(gameIds[1]);
    expect(fresh.currentStage).toBe("CREATED");
  });

  it("keeps state and listeners unchanged when dispatch persistence fails", () => {
    const storage = memoryGameStorage();
    const store = createGameStateStore({ storage, engine: { createId: () => gameIds[0]!, now: () => timestamp } });
    const before = store.getState();
    const listener = vi.fn();
    store.subscribe(listener);
    storage.save = () => {
      throw new Error("storage unavailable");
    };

    expect(() => store.dispatch({ type: "CONFIRM_INTENT", intent })).toThrow("storage unavailable");
    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });
});

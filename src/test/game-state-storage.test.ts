import { beforeEach, describe, expect, it } from "vitest";

import { createInitialGameState } from "@/game-state/engine";
import {
  GAME_STORAGE_KEY,
  GameStorageError,
  createGameStorage,
  type StorageLike,
} from "@/game-state/storage";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const timestamp = "2026-09-09T12:00:00.000Z";
const gameId = "11111111-1111-4111-8111-111111111111";

describe("game localStorage adapter", () => {
  let browserStorage: MemoryStorage;

  beforeEach(() => { browserStorage = new MemoryStorage(); });

  it("saves and restores a runtime-validated GameState", () => {
    const storage = createGameStorage(browserStorage);
    const state = createInitialGameState({ createId: () => gameId, now: () => timestamp });

    storage.save(state);

    expect(storage.load()).toEqual({ status: "restored", state });
  });

  it("returns empty when the fixed key does not exist", () => {
    expect(createGameStorage(browserStorage).load()).toEqual({ status: "empty" });
  });

  it.each([
    ["INVALID_JSON", "{"],
    ["INVALID_SCHEMA", JSON.stringify({ schemaVersion: 999 })],
  ] as const)("discards %s data without touching other keys", (reason, raw) => {
    browserStorage.setItem(GAME_STORAGE_KEY, raw);
    browserStorage.setItem("another-app", "keep-me");

    expect(createGameStorage(browserStorage).load()).toEqual({ status: "discarded", reason });
    expect(browserStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(browserStorage.getItem("another-app")).toBe("keep-me");
  });

  it("clears only the game key", () => {
    browserStorage.setItem(GAME_STORAGE_KEY, "game");
    browserStorage.setItem("another-app", "keep-me");
    createGameStorage(browserStorage).clear();
    expect(browserStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
    expect(browserStorage.getItem("another-app")).toBe("keep-me");
  });

  it("rejects invalid writes and maps quota failures to a stable error", () => {
    const storage = createGameStorage(browserStorage);
    expect(() => storage.save({ schemaVersion: 999 } as never)).toThrow(GameStorageError);

    const quotaStorage: StorageLike = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => { throw new DOMException("full", "QuotaExceededError"); },
    };
    expect(() => createGameStorage(quotaStorage).save(
      createInitialGameState({ createId: () => gameId, now: () => timestamp }),
    )).toThrowError(expect.objectContaining({ code: "WRITE_FAILED" }));
  });

  it("discards oversized stored data", () => {
    browserStorage.setItem(GAME_STORAGE_KEY, "x".repeat(33));
    expect(createGameStorage(browserStorage, { maxBytes: 32 }).load()).toEqual({
      status: "discarded",
      reason: "TOO_LARGE",
    });
    expect(browserStorage.getItem(GAME_STORAGE_KEY)).toBeNull();
  });

  it("refuses to write a valid state above the configured byte cap", () => {
    const state = createInitialGameState({ createId: () => gameId, now: () => timestamp });
    expect(() => createGameStorage(browserStorage, { maxBytes: 8 }).save(state)).toThrowError(
      expect.objectContaining({ code: "STATE_TOO_LARGE" }),
    );
  });

  it("maps browser read failures without deleting unrelated data", () => {
    const failingStorage: StorageLike = {
      getItem: () => { throw new DOMException("blocked", "SecurityError"); },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(() => createGameStorage(failingStorage).load()).toThrowError(
      expect.objectContaining({ code: "READ_FAILED" }),
    );
  });

  it("returns discarded invalid JSON when cleanup fails", () => {
    const failingCleanupStorage: StorageLike = {
      getItem: () => "{",
      setItem: () => undefined,
      removeItem: () => { throw new DOMException("blocked", "SecurityError"); },
    };
    expect(createGameStorage(failingCleanupStorage).load()).toEqual({
      status: "discarded",
      reason: "INVALID_JSON",
    });
  });

  it("maps clear cleanup failures to a stable write error", () => {
    const failingCleanupStorage: StorageLike = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => { throw new DOMException("blocked", "SecurityError"); },
    };
    expect(() => createGameStorage(failingCleanupStorage).clear()).toThrowError(
      expect.objectContaining({ code: "WRITE_FAILED" }),
    );
  });
});

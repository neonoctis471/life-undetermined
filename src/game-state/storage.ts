import { GameStateSchema, type GameState } from "./contracts";

export const GAME_STORAGE_KEY = "zhihu-five-years-game:v1";
export const MAX_GAME_STATE_BYTES = 1_000_000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadGameResult =
  | { status: "empty" }
  | { status: "restored"; state: GameState }
  | { status: "discarded"; reason: "INVALID_JSON" | "INVALID_SCHEMA" | "TOO_LARGE" };

export type GameStorageErrorCode = "INVALID_STATE" | "STATE_TOO_LARGE" | "READ_FAILED" | "WRITE_FAILED";

export class GameStorageError extends Error {
  constructor(public readonly code: GameStorageErrorCode, message: string) {
    super(message);
    this.name = "GameStorageError";
  }
}

export interface GameStorage {
  load(): LoadGameResult;
  save(state: GameState): void;
  clear(): void;
}

export function createGameStorage(
  storage: StorageLike,
  options: { maxBytes?: number } = {},
): GameStorage {
  const maxBytes = options.maxBytes ?? MAX_GAME_STATE_BYTES;
  return {
    load() {
      let raw: string | null;
      try {
        raw = storage.getItem(GAME_STORAGE_KEY);
      } catch {
        throw new GameStorageError("READ_FAILED", "unable to read local game state");
      }
      if (raw === null) return { status: "empty" };
      if (new TextEncoder().encode(raw).byteLength > maxBytes) {
        storage.removeItem(GAME_STORAGE_KEY);
        return { status: "discarded", reason: "TOO_LARGE" };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        storage.removeItem(GAME_STORAGE_KEY);
        return { status: "discarded", reason: "INVALID_JSON" };
      }
      const result = GameStateSchema.safeParse(parsed);
      if (!result.success) {
        storage.removeItem(GAME_STORAGE_KEY);
        return { status: "discarded", reason: "INVALID_SCHEMA" };
      }
      return { status: "restored", state: result.data };
    },
    save(state) {
      const result = GameStateSchema.safeParse(state);
      if (!result.success) throw new GameStorageError("INVALID_STATE", "refusing to save invalid game state");
      const raw = JSON.stringify(result.data);
      if (new TextEncoder().encode(raw).byteLength > maxBytes) {
        throw new GameStorageError("STATE_TOO_LARGE", "local game state exceeds one megabyte");
      }
      try {
        storage.setItem(GAME_STORAGE_KEY, raw);
      } catch {
        throw new GameStorageError("WRITE_FAILED", "unable to save local game state");
      }
    },
    clear() {
      storage.removeItem(GAME_STORAGE_KEY);
    },
  };
}

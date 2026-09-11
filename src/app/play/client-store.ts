import { useSyncExternalStore } from "react";

import {
  createGameStateStore,
  createGameStorage,
  type EngineDependencies,
  type GameState,
  type GameStateStore,
  type StorageLike,
} from "@/game-state";

/* Browser-only GameState store: localStorage when available, memory otherwise. */

export const engineDeps: EngineDependencies = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
};

let holder: { store: GameStateStore; snapshot: GameState } | null = null;

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

export function getGameStore(): GameStateStore {
  if (!holder) {
    let store: GameStateStore;
    try {
      store = createGameStateStore({ storage: createGameStorage(window.localStorage), engine: engineDeps });
    } catch {
      store = createGameStateStore({ storage: createGameStorage(memoryStorage()), engine: engineDeps });
    }
    const created = { store, snapshot: store.getState() };
    store.subscribe((state) => {
      created.snapshot = state;
    });
    holder = created;
  }
  return holder.store;
}

function subscribe(onChange: () => void) {
  const unsubscribe = getGameStore().subscribe(() => onChange());
  return () => {
    unsubscribe();
  };
}

function getSnapshot(): GameState | null {
  getGameStore();
  return holder!.snapshot;
}

const getServerSnapshot = (): GameState | null => null;

export function useGameState(): GameState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

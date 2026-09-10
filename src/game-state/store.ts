import type { GameState } from "./contracts";
import {
  createInitialGameState,
  transitionGameState,
  type EngineDependencies,
  type GameAction,
} from "./engine";
import type { GameStorage } from "./storage";

export type RestoreStatus = "created" | "restored" | "discarded";
export type GameStateListener = (state: GameState) => void;

export interface GameStateStore {
  readonly restoreStatus: RestoreStatus;
  getState(): GameState;
  dispatch(action: GameAction): GameState;
  reset(): GameState;
  subscribe(listener: GameStateListener): () => void;
}

export function createGameStateStore(options: {
  storage: GameStorage;
  engine: EngineDependencies;
}): GameStateStore {
  const loaded = options.storage.load();
  let restoreStatus: RestoreStatus = loaded.status === "restored"
    ? "restored"
    : loaded.status === "discarded"
      ? "discarded"
      : "created";
  let state = loaded.status === "restored" ? loaded.state : createInitialGameState(options.engine);
  const listeners = new Set<GameStateListener>();

  if (loaded.status !== "restored") options.storage.save(state);

  const publish = () => listeners.forEach((listener) => listener(state));

  return {
    get restoreStatus() {
      return restoreStatus;
    },
    getState: () => state,
    dispatch(action) {
      const next = transitionGameState(state, action, options.engine);
      options.storage.save(next);
      state = next;
      publish();
      return state;
    },
    reset() {
      options.storage.clear();
      const fresh = createInitialGameState(options.engine);
      options.storage.save(fresh);
      state = fresh;
      restoreStatus = "created";
      publish();
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

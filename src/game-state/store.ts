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
  let state = loaded.status === "restored" ? cloneState(loaded.state) : createInitialGameState(options.engine);
  const listeners = new Set<GameStateListener>();

  if (loaded.status !== "restored") options.storage.save(cloneState(state));

  const publish = () => {
    for (const listener of listeners) {
      try {
        listener(cloneState(state));
      } catch {
        // State has already committed; subscriber failures are isolated.
      }
    }
  };

  return {
    get restoreStatus() {
      return restoreStatus;
    },
    getState: () => cloneState(state),
    dispatch(action) {
      const next = transitionGameState(state, action, options.engine);
      options.storage.save(cloneState(next));
      state = next;
      publish();
      return cloneState(state);
    },
    reset() {
      const fresh = createInitialGameState(options.engine);
      options.storage.save(cloneState(fresh));
      state = fresh;
      restoreStatus = "created";
      publish();
      return cloneState(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

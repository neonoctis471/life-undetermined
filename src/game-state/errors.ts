export type GameStateErrorCode =
  | "INVALID_STATE"
  | "INVALID_STAGE"
  | "INVALID_CHAPTER"
  | "INVALID_FACT_REFERENCE"
  | "INVALID_SITUATION_REFERENCE"
  | "INVALID_ACTION_REFERENCE"
  | "INVALID_DECISION_REFERENCE"
  | "DUPLICATE_ENTITY"
  | "KEY_SNAPSHOT_REQUIRED"
  | "KEY_SNAPSHOT_MISMATCH"
  | "KEY_DECISION_ALREADY_EXISTS"
  | "FINAL_RESULT_MISSING";

export class GameStateError extends Error {
  constructor(
    public readonly code: GameStateErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GameStateError";
  }
}

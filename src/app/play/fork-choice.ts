/*
 * The replacement choice for the parallel life is AI input only and never
 * enters GameState. It is remembered per game in localStorage so the
 * comparison page can still name it after a refresh.
 */

const KEY = "zhihu-five-years-game:fork-choice:v1";

export interface ForkChoice {
  gameId: string;
  text: string;
}

export function loadForkChoice(): ForkChoice | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ForkChoice> | null;
    return typeof value?.gameId === "string" && typeof value.text === "string"
      ? { gameId: value.gameId, text: value.text.slice(0, 400) }
      : null;
  } catch {
    return null;
  }
}

export function saveForkChoice(choice: ForkChoice | null): void {
  try {
    if (choice) window.localStorage.setItem(KEY, JSON.stringify(choice));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Best effort only; the game itself does not depend on it.
  }
}

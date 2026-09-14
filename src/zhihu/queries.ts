/*
 * Search is the one part of this that is not deterministic: the service
 * occasionally answers a perfectly good query with nothing at all, and the
 * situation lookup was sending a single query because that is all the model is
 * obliged to write. One blip then cost the player every real Zhihu voice on
 * that screen.
 *
 * Topping the list up with the queries written for the player's own intent
 * costs nothing — the searches already run in parallel — and means no single
 * empty answer can empty the block.
 */

/** The request contract accepts at most three. */
export const MAX_QUERIES = 3;

export function topUpQueries(
  primary: readonly string[],
  fallback: readonly string[],
  limit = MAX_QUERIES,
): string[] {
  const seen = new Set<string>();
  const chosen: string[] = [];
  for (const query of [...primary, ...fallback]) {
    const trimmed = query.trim();
    // The contract requires 2-40 characters; anything else would fail validation.
    if (trimmed.length < 2 || trimmed.length > 40 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    chosen.push(trimmed);
    if (chosen.length === limit) break;
  }
  return chosen;
}

/*
 * Broad queries built from what the player said they wanted. The queries the
 * model wrote for the intent live only in memory, so a reload halfway through a
 * game loses them; the Intent itself is in the save and always available.
 */
export function intentQueries(intent: { goals: readonly string[]; currentActions: readonly string[] }): string[] {
  return [...intent.goals, ...intent.currentActions]
    .map((phrase) => `毕业后${phrase.trim()}`)
    .filter((query) => query.length >= 2 && query.length <= 40);
}

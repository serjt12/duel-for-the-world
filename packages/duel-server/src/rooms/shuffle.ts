/**
 * Returns a shuffled copy (Fisher-Yates); the input is left untouched.
 *
 * Lives on the server, not in duel-engine, on purpose: the engine takes
 * decks already in draw order and never randomizes anything itself, which
 * is what keeps every engine test deterministic. Randomness is a
 * room-setup concern. `random` is injectable (defaults to Math.random) so
 * tests can pin the order.
 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * Which set a card belongs to. Each edition is played on its own: a room
 * picks one, and both decks are built only from that edition's cards.
 *
 * - "world": PALACIO -- World Edition, the global base game. English only.
 * - "colombia": Edición Colombia, a special edition with Colombian
 *   political culture and slang (the original 24 cards).
 */
export type Edition = "world" | "colombia";

export const EDITIONS: readonly Edition[] = ["world", "colombia"];

/** The discard pile's name and phrasing in each edition. */
export const EMBASSY_TEXT: Record<Edition, { the: string; your: string; theirs: string }> = {
  world: { the: "the Embassy", your: "your Embassy", theirs: "your opponent's Embassy" },
  colombia: { the: "La Embajada", your: "your Embajada", theirs: "your opponent's Embajada" },
};

import { CARDS } from "./Cards";
import type { CardId } from "./CardId";
import type { Edition } from "./Edition";
import type { CardFilter, InstantEffect } from "./Effects";

/** Every card id in an edition, in the pool's listing order. */
export function cardsOfEdition(edition: Edition): CardId[] {
  return (Object.keys(CARDS) as CardId[]).filter((id) => CARDS[id].edition === edition);
}

/** Does a card match an Embassy filter? (Actors' `maxAtk` uses printed ATK.) */
export function matchesFilter(cardId: CardId, filter: CardFilter): boolean {
  const card = CARDS[cardId];
  if (filter.category && card.category !== filter.category) return false;
  if (filter.maxAtk !== undefined && (card.category !== "actor" || card.atk > filter.maxAtk)) return false;
  return true;
}

/**
 * The first effect in a list that lets its player pick a card from an
 * Embassy, if any -- the client uses it to open the picker.
 */
export function embassyChoiceIn(
  effects: readonly InstantEffect[] | undefined,
): Extract<InstantEffect, { kind: "retrieve-from-embassy" }> | null {
  for (const effect of effects ?? []) {
    if (effect.kind === "retrieve-from-embassy") return effect;
  }
  return null;
}

// Localized card content (Phase C of claude/palacio_i18n_plan.md) -- a
// thin companion to index.ts's UI-string t()/tf(), kept separate because
// card text is data keyed by card id rather than a flat UI key.
//
// Only World Edition cards have an entry in WORLD_CARD_TEXT_ES: Edición
// Colombia's cards are already authored in Spanish directly in
// packages/duel-content, so they fall straight through to their own
// (already-correct) text in every locale, by design -- see that file's
// header note and the open design question in palacio_i18n_plan.md.

import type { CardId } from "@duel-for-the-world/duel-content";
import { locale } from "./index";
import { WORLD_CARD_TEXT_ES } from "./locales/cardText.es";

/**
 * A card's localized display name. `baseName` is the card definition's own
 * `name` (the correct text for English, and for Edición Colombia in every
 * locale); it's returned unchanged whenever the current locale has no
 * translation for this id.
 */
export function localizedCardName(cardId: CardId, baseName: string): string {
  if (locale() === "es") {
    const entry = WORLD_CARD_TEXT_ES[cardId];
    if (entry) return entry.name;
  }
  return baseName;
}

/** Same as localizedCardName(), for `flavorText`. */
export function localizedCardFlavor(cardId: CardId, baseFlavorText: string): string {
  if (locale() === "es") {
    const entry = WORLD_CARD_TEXT_ES[cardId];
    if (entry) return entry.flavorText;
  }
  return baseFlavorText;
}

import { CARDS } from "@duel-for-the-world/duel-content";
import type { CardId } from "@duel-for-the-world/duel-content";
import { t } from "../i18n";
import { localizedCardFlavor, localizedCardName } from "../i18n/cardText";

export interface CardDisplay {
  name: string;
  category: "actor" | "policy" | "scandal";
  statsLine: string | null;
  tagLine: string;
  flavorText: string;
}

export function describeCard(cardId: CardId): CardDisplay {
  const card = CARDS[cardId];
  const name = localizedCardName(cardId, card.name);
  const flavorText = localizedCardFlavor(cardId, card.flavorText);

  if (card.category === "actor") {
    return {
      name,
      category: "actor",
      statsLine: `ATK ${card.atk} / DEF ${card.def}`,
      tagLine: `${t(`tier.${card.tier}`)} · ${t(`role.${card.role}`)}`,
      flavorText,
    };
  }

  if (card.category === "policy") {
    return {
      name,
      category: "policy",
      statsLine: null,
      tagLine: `${t("cardInfo.category.policy")} · ${t(`policyKind.${card.kind}`)}`,
      flavorText,
    };
  }

  return {
    name,
    category: "scandal",
    statsLine: null,
    tagLine: `${t("cardInfo.category.scandal")} · ${t(`scandalKind.${card.kind}`)}`,
    flavorText,
  };
}

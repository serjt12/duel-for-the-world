import { CARDS } from "@duel-for-the-world/duel-content";
import type { CardId } from "@duel-for-the-world/duel-content";

export interface CardDisplay {
  name: string;
  category: "actor" | "policy" | "scandal";
  statsLine: string | null;
  tagLine: string;
  flavorText: string;
}

const TIER_LABEL = { grassroots: "Grassroots", establishment: "Establishment", leader: "Leader" } as const;

export function describeCard(cardId: CardId): CardDisplay {
  const card = CARDS[cardId];

  if (card.category === "actor") {
    return {
      name: card.name,
      category: "actor",
      statsLine: `ATK ${card.atk} / DEF ${card.def}`,
      tagLine: `${TIER_LABEL[card.tier]} · ${card.role}`,
      flavorText: card.flavorText,
    };
  }

  if (card.category === "policy") {
    return {
      name: card.name,
      category: "policy",
      statsLine: null,
      tagLine: `Policy · ${card.kind}`,
      flavorText: card.flavorText,
    };
  }

  return {
    name: card.name,
    category: "scandal",
    statsLine: null,
    tagLine: `Scandal · ${card.kind}`,
    flavorText: card.flavorText,
  };
}

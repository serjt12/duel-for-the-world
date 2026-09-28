// Writes docs/CARDS.md: every card of every edition, straight from the
// card data, so the list can never drift from the game.
//
//   pnpm docs:cards
import { writeFileSync } from "node:fs";
import { ACTOR_CARDS, CARDS, EDITIONS, POLICY_CARDS, cardsOfEdition, rulesText } from "@duel-for-the-world/duel-content";
import type { CardId, Edition } from "@duel-for-the-world/duel-content";

const EDITION_TITLES: Record<Edition, string> = {
  world: "World Edition (English, the global base game)",
  colombia: "Edición Colombia (special edition, Spanish card names)",
};

const TIER_LABEL = { grassroots: "Grassroots", establishment: "Establishment", leader: "Leader" } as const;

// Markdown table cells can't contain a pipe or a line break.
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

function row(id: CardId): string {
  const card = CARDS[id];
  const rules = rulesText(id) ?? "—";
  if (card.category === "actor") {
    const actor = ACTOR_CARDS[card.id];
    const tier = TIER_LABEL[actor.tier] + (actor.rarity === "uncommon" ? " (uncommon)" : "");
    return `| ${cell(actor.name)} | ${tier} | ${actor.atk} / ${actor.def} | ${cell(rules)} |`;
  }
  if (card.category === "policy") {
    const policy = POLICY_CARDS[card.id];
    return `| ${cell(policy.name)} | Policy (${policy.kind}) | | ${cell(rules)} |`;
  }
  return `| ${cell(card.name)} | Scandal | | ${cell(rules)} |`;
}

const order = (id: CardId): number => {
  const card = CARDS[id];
  if (card.category === "actor") return { grassroots: 0, establishment: 1, leader: 2 }[ACTOR_CARDS[card.id].tier];
  return card.category === "policy" ? 3 : 4;
};

const lines: string[] = [
  "# Card list",
  "",
  "_Generated from the card data by `pnpm docs:cards` — don't edit by hand._",
  "",
  "ATK / DEF are printed values. Rules text is exactly what the game shows on the card.",
  "",
];

for (const edition of EDITIONS) {
  const ids = cardsOfEdition(edition).sort((a, b) => order(a) - order(b));
  lines.push(`## ${EDITION_TITLES[edition]}`, "", `${ids.length} cards.`, "", "| Card | Type | ATK / DEF | Rules |", "|---|---|---|---|");
  for (const id of ids) lines.push(row(id));
  lines.push("");
}

const target = new URL("../../../docs/CARDS.md", import.meta.url);
writeFileSync(target, lines.join("\n"));
console.log(`Wrote ${target.pathname}`);

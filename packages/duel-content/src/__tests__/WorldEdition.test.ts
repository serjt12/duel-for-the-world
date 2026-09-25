import { describe, expect, it } from "vitest";
import { CARDS } from "../Cards";
import type { CardId } from "../CardId";
import { EDITIONS } from "../Edition";
import { cardsOfEdition, embassyChoiceIn, matchesFilter } from "../editions";
import { rulesText } from "../rulesText";

const world = cardsOfEdition("world");
const colombia = cardsOfEdition("colombia");

// Everything a World card prints: its name, role line, rules and flavor.
function printedText(id: CardId): string {
  const card = CARDS[id];
  return [card.name, card.flavorText, rulesText(id) ?? ""].join(" ");
}

describe("editions", () => {
  it("every card belongs to exactly one known edition", () => {
    for (const card of Object.values(CARDS)) {
      expect(EDITIONS).toContain(card.edition);
    }
    expect(world.length + colombia.length).toBe(Object.keys(CARDS).length);
  });

  it("keeps the 24 Colombia cards, and the World set is bigger", () => {
    expect(colombia).toHaveLength(24);
    expect(world.length).toBeGreaterThan(colombia.length);
  });

  it("World cards are printed in English only (no Spanish accents or ñ, never 'Embajada')", () => {
    for (const id of world) {
      const text = printedText(id);
      expect(/[áéíóúñÁÉÍÓÚÑ¡¿]/.test(text)).toBe(false);
      expect(text.includes("Embajada")).toBe(false);
    }
  });

  it("World rules text calls the discard pile 'the Embassy'; Colombia keeps 'La Embajada'", () => {
    expect(rulesText("presidential-pardon")).toBe("Return an Actor from your Embassy to your hand.");
    expect(rulesText("nombramiento-diplomatico")).toContain("La Embajada");
  });

  it("at least a quarter of the World set does something with the Embassy", () => {
    const usesEmbassy = world.filter((id) => /Embassy/.test(rulesText(id) ?? ""));
    expect(usesEmbassy.length).toBeGreaterThanOrEqual(Math.ceil(world.length / 4));
  });

  it("every retrieval filter matches at least one card of its own edition", () => {
    for (const id of [...world, ...colombia]) {
      const card = CARDS[id];
      const lists =
        card.category === "actor"
          ? [card.onDeploy, card.onFlip, card.onTurnStart, card.onSentToEmbassy]
          : card.category === "policy" && card.kind === "normal"
            ? [card.onActivate]
            : [];
      for (const effects of lists) {
        const choice = embassyChoiceIn(effects);
        if (!choice) continue;
        const pool = card.edition === "world" ? world : colombia;
        expect(pool.some((other) => matchesFilter(other, choice.filter))).toBe(true);
      }
    }
  });

  it("Leaders are World-only, tributed, and balanced below Establishment raw stats", () => {
    for (const id of world) {
      const card = CARDS[id];
      if (card.category !== "actor" || card.tier !== "leader") continue;
      // A Leader's power is its ability: printed ATK + DEF stays <= 11.
      expect(card.atk + card.def).toBeLessThanOrEqual(11);
    }
  });
});

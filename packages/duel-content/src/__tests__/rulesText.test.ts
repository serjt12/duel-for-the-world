import { describe, expect, it } from "vitest";
import { ACTOR_CARDS, CARDS } from "../Cards";
import type { CardId } from "../CardId";
import { describeInstantEffect, describeStatModifier, rulesText } from "../rulesText";

describe("rulesText", () => {
  it("describes today's three effect cards from their data", () => {
    expect(rulesText("decreto-de-emergencia")).toBe("Gain 5 Mandate.");
    expect(rulesText("maletin-de-sobornos")).toBe("Equipped Actor gets +2 ATK / +2 DEF.");
    expect(rulesText("escandalo-de-corrupcion")).toBe(
      "When your Actor is attacked, destroy the attacker.",
    );
  });

  it("has no rules text for vanilla Actors", () => {
    for (const card of Object.values(ACTOR_CARDS)) {
      if (card.onDeploy || card.onFlip || card.onTurnStart || card.onSentToEmbassy || card.passives?.length) continue;
      expect(rulesText(card.id as CardId)).toBeNull();
    }
  });

  it("describes wave 2 cards from their data", () => {
    expect(rulesText("la-influencer")).toBe("On deploy: draw 1 card.");
    expect(rulesText("periodista-investigativa")).toBe("On flip: opponent loses 3 Mandate.");
    expect(rulesText("el-contratista")).toBe("On deploy: lose 2 Mandate.");
    expect(rulesText("el-expresidente")).toBe("On deploy: opponent loses 2 Mandate.");
    expect(rulesText("encuesta-amanada")).toBe("Draw 2 cards.");
    expect(rulesText("nombramiento-diplomatico")).toBe("Target an opposing Actor. Send it to La Embajada.");
    expect(rulesText("llamado-a-consultas")).toBe("Return an Actor from your Embajada to your hand.");
    expect(rulesText("campana-de-desprestigio")).toBe("Equip to an opposing Actor: it gets −3 ATK.");
    expect(rulesText("subsidio-electoral")).toBe("Equipped Actor gets +1 ATK / +3 DEF.");
    expect(rulesText("chuzadas")).toBe("When you're attacked directly, destroy the attacker.");
    expect(rulesText("mocion-de-censura")).toBe(
      "When your opponent deploys an Establishment face-up, send it to La Embajada.",
    );
    expect(rulesText("filtracion-a-la-prensa")).toBe(
      "When your Actor is attacked, opponent loses 3 Mandate.",
    );
  });

  it("gives every Actor with an effect some rules text", () => {
    for (const card of Object.values(ACTOR_CARDS)) {
      if (!card.onDeploy && !card.onFlip) continue;
      expect(typeof rulesText(card.id) === "string").toBe(true);
    }
  });

  it("produces text for every non-Actor card in the pool", () => {
    for (const card of Object.values(CARDS)) {
      if (card.category === "actor") continue;
      const text = rulesText(card.id);
      expect(typeof text === "string" && text.length > 0).toBe(true);
    }
  });

  it("words Mandate changes for both recipients and both directions", () => {
    expect(describeInstantEffect({ kind: "change-mandate", recipient: "you", amount: 3 })).toBe(
      "Gain 3 Mandate.",
    );
    expect(describeInstantEffect({ kind: "change-mandate", recipient: "you", amount: -2 })).toBe(
      "Lose 2 Mandate.",
    );
    expect(
      describeInstantEffect({ kind: "change-mandate", recipient: "opponent", amount: -4 }),
    ).toBe("Opponent loses 4 Mandate.");
    expect(
      describeInstantEffect({ kind: "change-mandate", recipient: "opponent", amount: 1 }),
    ).toBe("Opponent gains 1 Mandate.");
  });

  it("formats stat modifiers with signs and leaves out zero parts", () => {
    expect(describeStatModifier({ atk: 2, def: 2 })).toBe("+2 ATK / +2 DEF");
    expect(describeStatModifier({ atk: 3, def: 0 })).toBe("+3 ATK");
    expect(describeStatModifier({ atk: 0, def: -1 })).toBe("−1 DEF");
  });
});

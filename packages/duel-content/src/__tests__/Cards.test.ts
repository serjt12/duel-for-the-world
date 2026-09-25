import { describe, expect, it } from "vitest";
import {
  ACTOR_CARDS,
  CARDS,
  POLICY_CARDS,
  SCANDAL_CARDS,
} from "../Cards";
import { RESPONSES_FOR_EVENT } from "../Effects";
import type { InstantEffect } from "../Effects";

describe("CARDS", () => {
  it("every ACTOR_CARDS entry's key matches its own id", () => {
    for (const [key, card] of Object.entries(ACTOR_CARDS)) {
      expect(String(card.id)).toBe(key);
      expect(card.category).toBe("actor");
    }
  });

  it("every POLICY_CARDS entry's key matches its own id", () => {
    for (const [key, card] of Object.entries(POLICY_CARDS)) {
      expect(String(card.id)).toBe(key);
      expect(card.category).toBe("policy");
    }
  });

  it("every SCANDAL_CARDS entry's key matches its own id", () => {
    for (const [key, card] of Object.entries(SCANDAL_CARDS)) {
      expect(String(card.id)).toBe(key);
      expect(card.category).toBe("scandal");
    }
  });

  it("merges all three pools with no id collisions", () => {
    const expectedCount =
      Object.keys(ACTOR_CARDS).length +
      Object.keys(POLICY_CARDS).length +
      Object.keys(SCANDAL_CARDS).length;

    expect(Object.keys(CARDS)).toHaveLength(expectedCount);
  });

  it("gives every Actor card non-negative integer ATK and DEF", () => {
    for (const card of Object.values(ACTOR_CARDS)) {
      expect(Number.isInteger(card.atk)).toBe(true);
      expect(Number.isInteger(card.def)).toBe(true);
      expect(card.atk >= 0).toBe(true);
      expect(card.def >= 0).toBe(true);
    }
  });

  it("includes at least one Establishment-tier Actor to exercise the tribute rule", () => {
    const establishmentActors = Object.values(ACTOR_CARDS).filter(
      (card) => card.tier === "establishment",
    );

    expect(establishmentActors.length > 0).toBe(true);
  });

  it("includes at least one Grassroots-tier Actor for every role", () => {
    const roles = ["militant", "enforcer", "orator", "operator"] as const;

    for (const role of roles) {
      const hasGrassrootsForRole = Object.values(ACTOR_CARDS).some(
        (card) => card.role === role && card.tier === "grassroots",
      );

      expect(hasGrassrootsForRole).toBe(true);
    }
  });

  // Content lint: these scale with the card pool, catching a malformed
  // card definition before it ever reaches the engine.
  // Every instant effect a card declares, with the card it's on.
  function everyInstantEffect(): Array<{ cardId: string; effect: InstantEffect; targeted: boolean }> {
    const found: Array<{ cardId: string; effect: InstantEffect; targeted: boolean }> = [];
    for (const card of Object.values(ACTOR_CARDS)) {
      for (const effect of [...(card.onDeploy ?? []), ...(card.onFlip ?? [])]) {
        found.push({ cardId: card.id, effect, targeted: false });
      }
    }
    for (const card of Object.values(POLICY_CARDS)) {
      if (card.kind !== "normal") continue;
      for (const effect of card.onActivate) {
        found.push({ cardId: card.id, effect, targeted: card.target !== undefined });
      }
    }
    return found;
  }

  it("gives every Normal Policy at least one effect", () => {
    for (const card of Object.values(POLICY_CARDS)) {
      if (card.kind !== "normal") continue;
      expect(card.onActivate.length > 0).toBe(true);
    }
  });

  it("uses whole, non-zero Mandate amounts and positive whole draw counts", () => {
    for (const { effect } of everyInstantEffect()) {
      if (effect.kind === "change-mandate") {
        expect(Number.isInteger(effect.amount) && effect.amount !== 0).toBe(true);
      }
      if (effect.kind === "draw-cards") {
        expect(Number.isInteger(effect.count) && effect.count > 0).toBe(true);
      }
    }
  });

  it("only uses a targeted effect on a card that declares a target, and vice versa", () => {
    for (const { cardId, effect, targeted } of everyInstantEffect()) {
      if (effect.kind === "send-target-to-embassy") {
        expect(`${cardId}: targeted=${targeted}`).toBe(`${cardId}: targeted=true`);
      }
    }
    for (const card of Object.values(POLICY_CARDS)) {
      if (card.kind === "normal" && card.target !== undefined) {
        expect(card.onActivate.some((effect) => effect.kind === "send-target-to-embassy")).toBe(true);
      }
    }
  });

  it("gives every Equip Policy a whole-number, non-empty stat modifier and an attach side", () => {
    for (const card of Object.values(POLICY_CARDS)) {
      if (card.kind !== "equip") continue;
      expect(Number.isInteger(card.whileEquipped.atk)).toBe(true);
      expect(Number.isInteger(card.whileEquipped.def)).toBe(true);
      expect(card.whileEquipped.atk !== 0 || card.whileEquipped.def !== 0).toBe(true);
      expect(["your-actor", "opponent-actor"]).toContain(card.attachTo);
    }
  });

  it("gives every Scandal a trigger with responses that fit its event", () => {
    for (const card of Object.values(SCANDAL_CARDS)) {
      expect(card.trigger.responses.length > 0).toBe(true);
      for (const response of card.trigger.responses) {
        expect(`${card.id}: ${response.kind}`).toBe(
          RESPONSES_FOR_EVENT[card.trigger.event].includes(response.kind)
            ? `${card.id}: ${response.kind}`
            : `${card.id}: (not allowed for ${card.trigger.event})`,
        );
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { updateCardCooldowns } from "../CardCooldownSystem";
import { createInitialCardCooldowns, type PlayerState } from "../../players/PlayerState";

function createTestPlayer(): PlayerState {
  return {
    id: "player1",
    capital: 5,
    mandato: 0,
    capitalRegenElapsedMs: 0,
    cardCooldowns: createInitialCardCooldowns(),
  };
}

describe("CardCooldownSystem", () => {
  it("reduces a cooldown by exactly one simulation tick", () => {
    const player = createTestPlayer();

    player.cardCooldowns.militant = 6000;

    updateCardCooldowns(player);

    expect(player.cardCooldowns.militant).toBe(5950);
  });

  it("never reduces a cooldown below zero", () => {
    const player = createTestPlayer();

    player.cardCooldowns.militant = 25;

    updateCardCooldowns(player);

    expect(player.cardCooldowns.militant).toBe(0);
  });

  it("updates each card cooldown independently", () => {
    const player = createTestPlayer();

    player.cardCooldowns.militant = 6000;
    player.cardCooldowns.enforcer = 14000;
    player.cardCooldowns.orator = 0;
    player.cardCooldowns.operator = 50;

    updateCardCooldowns(player);

    expect(player.cardCooldowns.militant).toBe(5950);
    expect(player.cardCooldowns.enforcer).toBe(13950);
    expect(player.cardCooldowns.orator).toBe(0);
    expect(player.cardCooldowns.operator).toBe(0);
  });
});

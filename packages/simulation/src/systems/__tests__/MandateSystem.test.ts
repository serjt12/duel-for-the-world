import { describe, expect, it } from "vitest";
import type { PlayerState } from "../../players/PlayerState";
import { createInitialCardCooldowns } from "../../players/PlayerState";
import type { ZoneState } from "../../zones/ZoneState";
import { updateMandateGeneration } from "../MandateSystem";

function createTestPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: "player1",
    capital: 5,
    mandato: 0,
    capitalRegenElapsedMs: 0,
    cardCooldowns: createInitialCardCooldowns(),
    ...overrides,
  };
}

function createZone(overrides: Partial<ZoneState> = {}): ZoneState {
  return {
    id: "zoneA",
    ownerId: null,
    controlHp: 100,
    maxControlHp: 100,
    ...overrides,
  };
}

describe("MandateSystem", () => {
  it("generates no Mandate when no zones are owned", () => {
    const player1 = createTestPlayer({ id: "player1" });
    const player2 = createTestPlayer({ id: "player2" });
    const zones = [
      createZone({ id: "zoneA", ownerId: null }),
      createZone({ id: "zoneB", ownerId: null }),
      createZone({ id: "zoneC", ownerId: null }),
    ];

    updateMandateGeneration(zones, { player1, player2 }, 1000);

    expect(player1.mandato).toBe(0);
    expect(player2.mandato).toBe(0);
  });

  it("generates Mandate for the owner of a single controlled zone", () => {
    const player1 = createTestPlayer({ id: "player1" });
    const player2 = createTestPlayer({ id: "player2" });
    const zones = [
      createZone({ id: "zoneA", ownerId: "player1" }),
      createZone({ id: "zoneB", ownerId: null }),
      createZone({ id: "zoneC", ownerId: null }),
    ];

    updateMandateGeneration(zones, { player1, player2 }, 1000);

    expect(player1.mandato).toBe(1);
    expect(player2.mandato).toBe(0);
  });

  it("credits each player independently for the zones they own", () => {
    const player1 = createTestPlayer({ id: "player1" });
    const player2 = createTestPlayer({ id: "player2" });
    const zones = [
      createZone({ id: "zoneA", ownerId: "player1" }),
      createZone({ id: "zoneB", ownerId: "player2" }),
      createZone({ id: "zoneC", ownerId: null }),
    ];

    updateMandateGeneration(zones, { player1, player2 }, 1000);

    expect(player1.mandato).toBe(1);
    expect(player2.mandato).toBe(1);
  });

  it("stacks Mandate generation across multiple zones owned by the same player", () => {
    const player1 = createTestPlayer({ id: "player1" });
    const player2 = createTestPlayer({ id: "player2" });
    const zones = [
      createZone({ id: "zoneA", ownerId: "player1" }),
      createZone({ id: "zoneB", ownerId: "player1" }),
      createZone({ id: "zoneC", ownerId: "player1" }),
    ];

    updateMandateGeneration(zones, { player1, player2 }, 1000);

    expect(player1.mandato).toBe(3);
  });

  it("still generates Mandate for a contested zone -- ownership, not uncontested presence, is what counts", () => {
    // ZoneControlSystem freezes controlHp while contested, but the owner
    // hasn't lost the zone yet, so Mandate keeps flowing until they do.
    const player1 = createTestPlayer({ id: "player1" });
    const player2 = createTestPlayer({ id: "player2" });
    const zones = [
      createZone({ id: "zoneA", ownerId: "player1", controlHp: 40 }),
    ];

    updateMandateGeneration(zones, { player1, player2 }, 1000);

    expect(player1.mandato).toBe(1);
  });

  it("scales Mandate generation proportionally to elapsed time", () => {
    const player1 = createTestPlayer({ id: "player1" });
    const player2 = createTestPlayer({ id: "player2" });
    const zones = [
      createZone({ id: "zoneA", ownerId: "player1" }),
    ];

    updateMandateGeneration(zones, { player1, player2 }, 500);

    expect(player1.mandato).toBe(0.5);
  });

  it("produces (up to floating-point rounding) the same Mandate across equivalent time slices", () => {
    // Twenty additions of a rate*deltaSeconds value that isn't exactly
    // representable in binary (1 * 0.05) drift by ~2e-16 versus a single
    // multiplication by 1.0 -- that's IEEE754 double rounding, not a bug,
    // so this asserts approximate rather than strict equality (mirrors
    // vitest's own toBeCloseTo, which is exactly what this kind of
    // accumulated-float assertion is for).
    const playerA = createTestPlayer({ id: "player1" });
    const playerB = createTestPlayer({ id: "player1" });
    const zonesA = [createZone({ id: "zoneA", ownerId: "player1" })];
    const zonesB = [createZone({ id: "zoneA", ownerId: "player1" })];

    updateMandateGeneration(zonesA, { player1: playerA, player2: createTestPlayer({ id: "player2" }) }, 1000);

    for (let i = 0; i < 20; i += 1) {
      updateMandateGeneration(zonesB, { player1: playerB, player2: createTestPlayer({ id: "player2" }) }, 50);
    }

    expect(playerA.mandato).toBeCloseTo(playerB.mandato, 9);
    expect(playerA.mandato).toBeCloseTo(1, 9);
  });

  it("accumulates across repeated calls rather than resetting", () => {
    const player1 = createTestPlayer({ id: "player1" });
    const player2 = createTestPlayer({ id: "player2" });
    const zones = [createZone({ id: "zoneA", ownerId: "player1" })];

    updateMandateGeneration(zones, { player1, player2 }, 1000);
    updateMandateGeneration(zones, { player1, player2 }, 1000);

    expect(player1.mandato).toBe(2);
  });
});

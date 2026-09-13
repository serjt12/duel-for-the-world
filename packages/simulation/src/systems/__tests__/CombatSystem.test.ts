import { describe, expect, it } from "vitest";
import type { UnitState } from "../../units/UnitState";
import { selectTarget, updateCombat } from "../CombatSystem";
import { SIMULATION_TICK_MS } from "../../config/SimulationTime";

function createUnit(overrides: Partial<UnitState> = {}): UnitState {
  return {
    id: 1,
    ownerId: "player1",
    cardId: "militant",
    health: 100,
    targetZoneId: "zoneA",
    attackCooldownMs: 0,
    ...overrides,
  };
}

describe("CombatSystem", () => {
  describe("selectTarget", () => {
    it("returns undefined when no enemy shares the zone", () => {
      const units = [createUnit({ id: 1, ownerId: "player1" })];

      expect(selectTarget(units, "zoneA", "player1")).toBeUndefined();
    });

    it("ignores dead enemies and enemies targeting another zone", () => {
      const units = [
        createUnit({ id: 1, ownerId: "player2", health: 0 }),
        createUnit({ id: 2, ownerId: "player2", targetZoneId: "zoneB" }),
        createUnit({ id: 3, ownerId: "player2" }),
      ];

      expect(selectTarget(units, "zoneA", "player1")?.id).toBe(3);
    });

    it("ignores units belonging to the attacker's own side", () => {
      const units = [
        createUnit({ id: 1, ownerId: "player1" }),
        createUnit({ id: 2, ownerId: "player1" }),
      ];

      expect(selectTarget(units, "zoneA", "player1")).toBeUndefined();
    });

    it("picks the lowest-id living enemy for determinism", () => {
      const units = [
        createUnit({ id: 5, ownerId: "player2" }),
        createUnit({ id: 2, ownerId: "player2" }),
        createUnit({ id: 9, ownerId: "player2" }),
      ];

      expect(selectTarget(units, "zoneA", "player1")?.id).toBe(2);
    });
  });

  describe("updateCombat", () => {
    it("does nothing when a unit has no enemy at its zone", () => {
      const units = [createUnit({ id: 1, ownerId: "player1" })];

      updateCombat(units, SIMULATION_TICK_MS);

      expect(units[0]).toEqual(createUnit({ id: 1, ownerId: "player1" }));
    });

    it("does not attack while the cooldown is still running", () => {
      const attacker = createUnit({
        id: 1,
        ownerId: "player1",
        attackCooldownMs: 1000,
      });
      const defender = createUnit({ id: 2, ownerId: "player2" });
      const units = [attacker, defender];

      updateCombat(units, SIMULATION_TICK_MS);

      expect(defender.health).toBe(100);
      expect(attacker.attackCooldownMs).toBe(950);
    });

    it("deals the attacking card's damage once the cooldown reaches zero", () => {
      const attacker = createUnit({ id: 1, ownerId: "player1" });
      const defender = createUnit({ id: 2, ownerId: "player2" });
      const units = [attacker, defender];

      updateCombat(units, SIMULATION_TICK_MS);

      expect(defender.health).toBe(80);
      expect(attacker.attackCooldownMs).toBe(1000);
    });

    it("never reduces health below zero", () => {
      const attacker = createUnit({ id: 1, ownerId: "player1" });
      const defender = createUnit({
        id: 2,
        ownerId: "player2",
        health: 10,
      });
      const units = [attacker, defender];

      updateCombat(units, SIMULATION_TICK_MS);

      expect(defender.health).toBe(0);
    });

    it("stops a dead unit from attacking", () => {
      const attacker = createUnit({
        id: 1,
        ownerId: "player1",
        health: 0,
      });
      const defender = createUnit({ id: 2, ownerId: "player2" });
      const units = [attacker, defender];

      updateCombat(units, SIMULATION_TICK_MS);

      expect(defender.health).toBe(100);
    });

    it("resolves mutual damage in the same tick when both cooldowns are ready", () => {
      const unit1 = createUnit({ id: 1, ownerId: "player1" });
      const unit2 = createUnit({ id: 2, ownerId: "player2" });
      const units = [unit1, unit2];

      updateCombat(units, SIMULATION_TICK_MS);

      expect(unit1.health).toBe(80);
      expect(unit2.health).toBe(80);
    });

    it("attacks again every attackIntervalMs, not just once", () => {
      const unit1 = createUnit({ id: 1, ownerId: "player1" });
      const unit2 = createUnit({ id: 2, ownerId: "player2" });
      const units = [unit1, unit2];

      // militant attackIntervalMs = 1000ms = 20 ticks of 50ms
      for (let i = 0; i < 20; i += 1) {
        updateCombat(units, SIMULATION_TICK_MS);
      }

      expect(unit1.health).toBe(80);
      expect(unit2.health).toBe(80);

      updateCombat(units, SIMULATION_TICK_MS);

      expect(unit1.health).toBe(60);
      expect(unit2.health).toBe(60);
    });

    it("the lower-id unit lands the decisive blow when both would die on the same tick", () => {
      // Two equal militants (100 health, 20 damage, 1000ms interval) trade
      // blows every 20 ticks: 80/80 -> 60/60 -> 40/40 -> 20/20 -> the 5th
      // exchange would bring both to 0, but the lower-id unit (id 1) is
      // processed first, kills the id-2 unit, and the dead unit never gets
      // to land its own 5th hit -- so the lower id survives at 20 health.
      // This is the documented deterministic tie-break, not a bug.
      const unit1 = createUnit({ id: 1, ownerId: "player1" });
      const unit2 = createUnit({ id: 2, ownerId: "player2" });
      const units = [unit1, unit2];

      for (let i = 0; i < 81; i += 1) {
        updateCombat(units, SIMULATION_TICK_MS);
      }

      expect(unit1.health).toBe(20);
      expect(unit2.health).toBe(0);
    });

    it("a unit killed this tick stops being a valid target for further attacks", () => {
      const attacker = createUnit({ id: 1, ownerId: "player1" });
      const defender = createUnit({
        id: 2,
        ownerId: "player2",
        health: 10,
      });
      const units = [attacker, defender];

      updateCombat(units, SIMULATION_TICK_MS);

      expect(selectTarget(units, "zoneA", "player1")).toBeUndefined();
    });
  });
});

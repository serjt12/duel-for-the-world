import { CARDS } from "@project-palacio/content";
import type { PlayerId } from "../players/PlayerState";
import type { UnitState } from "../units/UnitState";
import type { ZoneId } from "../zones/ZoneId";

/**
 * Picks the enemy a unit will attack this tick: the living enemy unit
 * present at the same zone with the lowest id. Lowest-id is an arbitrary
 * but deterministic tie-break, consistent with the project's
 * deterministic-simulation requirement.
 */
export function selectTarget(
  units: UnitState[],
  zoneId: ZoneId,
  attackerOwnerId: PlayerId,
): UnitState | undefined {
  return units
    .filter(
      (unit) =>
        unit.ownerId !== attackerOwnerId &&
        unit.targetZoneId === zoneId &&
        unit.health > 0,
    )
    .reduce<UnitState | undefined>((lowest, unit) => {
      if (!lowest || unit.id < lowest.id) {
        return unit;
      }

      return lowest;
    }, undefined);
}

/**
 * Resolves combat for one simulation tick. A unit attacks when its
 * attackCooldownMs has counted down to zero and a living enemy shares its
 * target zone; the attack deals the attacking card's damage and resets the
 * cooldown to the card's attackIntervalMs.
 *
 * Like CardCooldownSystem, this assumes it is called once per fixed
 * SIMULATION_TICK_MS tick, not with an arbitrary deltaMs -- it does not
 * account for a single call spanning more than one attack interval.
 *
 * Units are processed in array order (i.e. ascending id, since ids are only
 * ever appended), so a unit that dies earlier in this same tick will not
 * get to counter-attack -- this is a deliberate, deterministic tie-break
 * rather than an oversight.
 */
export function updateCombat(units: UnitState[], deltaMs: number): void {
  for (const unit of units) {
    if (unit.health <= 0) {
      continue;
    }

    if (unit.attackCooldownMs > 0) {
      unit.attackCooldownMs = Math.max(0, unit.attackCooldownMs - deltaMs);
    }

    if (unit.attackCooldownMs > 0) {
      continue;
    }

    const target = selectTarget(units, unit.targetZoneId, unit.ownerId);

    if (!target) {
      continue;
    }

    const card = CARDS[unit.cardId];

    target.health = Math.max(0, target.health - card.damage);
    unit.attackCooldownMs = card.attackIntervalMs;
  }
}

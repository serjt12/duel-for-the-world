import type { PlayerId, PlayerState } from "../players/PlayerState";
import type { ZoneState } from "../zones/ZoneState";
import { MANDATE_RATE_PER_ZONE_PER_SECOND } from "../config/EconomyConfig";

/**
 * Converts territorial control into political legitimacy: every zone a
 * player currently owns generates Mandate for them each second, at
 * MANDATE_RATE_PER_ZONE_PER_SECOND. Ownership is what counts, not whether
 * the zone is presently uncontested -- a zone under enemy pressure
 * (controlHp draining, per ZoneControlSystem) still generates Mandate for
 * its current owner right up until it actually flips.
 */
export function updateMandateGeneration(
  zones: ZoneState[],
  players: Record<PlayerId, PlayerState>,
  deltaMs: number,
): void {
  const deltaSeconds = deltaMs / 1000;

  for (const zone of zones) {
    if (zone.ownerId === null) {
      continue;
    }

    players[zone.ownerId].mandato +=
      MANDATE_RATE_PER_ZONE_PER_SECOND * deltaSeconds;
  }
}

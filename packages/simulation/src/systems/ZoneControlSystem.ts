import { CARDS } from "@project-palacio/content";
import type { PlayerId } from "../players/PlayerState";
import type { UnitState } from "../units/UnitState";
import type { ZoneState } from "../zones/ZoneState";
import { ZONE_CONTROL_RATE_PER_SECOND } from "../config/EconomyConfig";

export function calculateCapturePower(
  units: UnitState[],
  zone: ZoneState,
  playerId: PlayerId,
): number {
  return units
    .filter(
      (unit) =>
        unit.ownerId === playerId &&
        unit.targetZoneId === zone.id &&
        unit.health > 0,
    )
    .reduce((total, unit) => total + CARDS[unit.cardId].capturePower, 0);
}

export function applyCapturePressure(
  zone: ZoneState,
  capturePower: number,
  deltaMs: number,
): void {
  if (capturePower <= 0 || deltaMs <= 0) {
    return;
  }

  const deltaSeconds = deltaMs / 1000;

  const controlDamage =
    capturePower * ZONE_CONTROL_RATE_PER_SECOND * deltaSeconds;

  zone.controlHp = Math.max(0, zone.controlHp - controlDamage);
}

export type ZoneControlStatus =
  | "neutral"
  | "player1"
  | "player2"
  | "contested";

export function getZoneControlStatus(
  units: UnitState[],
  zone: ZoneState,
): ZoneControlStatus {
  const player1Power = calculateCapturePower(units, zone, "player1");
  const player2Power = calculateCapturePower(units, zone, "player2");

  if (player1Power > 0 && player2Power > 0) {
    return "contested";
  }

  if (player1Power > 0) {
    return "player1";
  }

  if (player2Power > 0) {
    return "player2";
  }

  return "neutral";
}

export function updateZoneControl(
  zone: ZoneState,
  units: UnitState[],
  deltaMs: number,
): void {
  const status = getZoneControlStatus(units, zone);

  if (status === "contested") {
    return;
  }

  if (zone.ownerId === null) {
    if (status === "neutral") {
      return;
    }

    const capturePower = calculateCapturePower(units, zone, status);

    applyCapturePressure(zone, capturePower, deltaMs);

    if (zone.controlHp === 0) {
      zone.ownerId = status;
      zone.controlHp = zone.maxControlHp;
    }

    return;
  }

  if (status === zone.ownerId) {
    const deltaSeconds = deltaMs / 1000;
    const recovery =
      ZONE_CONTROL_RATE_PER_SECOND * deltaSeconds;

    zone.controlHp = Math.min(
      zone.maxControlHp,
      zone.controlHp + recovery,
    );

    return;
  }

  if (status === "neutral") {
    const deltaSeconds = deltaMs / 1000;
    const recovery =
      ZONE_CONTROL_RATE_PER_SECOND * deltaSeconds;

    zone.controlHp = Math.min(
      zone.maxControlHp,
      zone.controlHp + recovery,
    );

    return;
  }

  const capturePower = calculateCapturePower(units, zone, status);

  applyCapturePressure(zone, capturePower, deltaMs);

  if (zone.controlHp === 0) {
    zone.ownerId = null;
  }
}
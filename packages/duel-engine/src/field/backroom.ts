import type { PolicyCardId } from "@duel-for-the-world/duel-content";
import { BACKROOM_ZONE_COUNT } from "../config/DuelConfig";
import type { DuelistState } from "../duelists/DuelistState";
import type { DuelState } from "../duel/DuelState";
import type { FieldPolicy } from "./FieldPolicy";
import { firstFreeZone, isValidZone } from "./zones";

/** Every Backroom zone in use: Set Scandals and Policies share them. */
export function occupiedBackroomZones(duelist: DuelistState): number[] {
  return [
    ...duelist.setScandals.map((scandal) => scandal.zone),
    ...duelist.backroomPolicies.map((policy) => policy.zone),
  ];
}

export type BackroomZoneResult =
  | { ok: true; zone: number }
  | { ok: false; reason: "invalid-zone" | "zone-occupied" | "backroom-full" };

/**
 * Validates a requested Backroom zone, or picks the first free one when
 * none was requested. Never mutates anything.
 */
export function pickBackroomZone(duelist: DuelistState, requested: number | undefined): BackroomZoneResult {
  const occupied = occupiedBackroomZones(duelist);

  if (requested === undefined) {
    const free = firstFreeZone(occupied, BACKROOM_ZONE_COUNT);
    return free === null ? { ok: false, reason: "backroom-full" } : { ok: true, zone: free };
  }
  if (!isValidZone(requested, BACKROOM_ZONE_COUNT)) {
    return { ok: false, reason: "invalid-zone" };
  }
  if (occupied.includes(requested)) {
    return { ok: false, reason: "zone-occupied" };
  }
  return { ok: true, zone: requested };
}

/**
 * The face-up Equip Policies attached to an Actor. They can sit in either
 * duelist's Backroom: your own equips (Maletin) are in yours, while an
 * opponent's hostile equip (Campaña de Desprestigio) sits in theirs.
 */
export function equipPoliciesOn(state: DuelState, actorInstanceId: number): FieldPolicy[] {
  return [state.duelists.duelist1, state.duelists.duelist2].flatMap((duelist) =>
    duelist.backroomPolicies.filter((policy) => !policy.faceDown && policy.equippedToInstanceId === actorInstanceId),
  );
}

/** The card ids of the equips attached to an Actor (see equipPoliciesOn). */
export function equipsOf(state: DuelState, actorInstanceId: number): PolicyCardId[] {
  return equipPoliciesOn(state, actorInstanceId).map((policy) => policy.cardId);
}

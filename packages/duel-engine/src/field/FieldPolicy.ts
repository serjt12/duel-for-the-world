import type { PolicyCardId } from "@project-palacio/duel-content";
import type { DuelistId } from "../duelists/DuelistId";

/**
 * A Policy card sitting in one of its controller's Backroom zones (the
 * same zones Set Scandals use). Either:
 *
 * - Set face-down (`faceDown: true`), waiting to be activated on a later
 *   action -- like a Set spell card; or
 * - a face-up Equip Policy attached to one of its controller's Actors
 *   (`equippedToInstanceId`). This link is the ONLY record of an equip:
 *   effective stats are derived from it, and the card goes to the archive
 *   with the Actor it's attached to.
 *
 * Normal Policies never stay face-up: they resolve and go to the archive.
 */
export interface FieldPolicy {
  instanceId: number;
  cardId: PolicyCardId;
  controllerId: DuelistId;
  zone: number;
  faceDown: boolean;
  equippedToInstanceId: number | null;
}

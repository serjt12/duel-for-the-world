import type { CardId } from "@project-palacio/content";
import type { PlayerId } from "../players/PlayerState";
import type { ZoneId } from "../zones/ZoneId";

export interface UnitState {
  id: number;
  ownerId: PlayerId;
  cardId: CardId;
  health: number;
  targetZoneId: ZoneId;
  attackCooldownMs: number;
}

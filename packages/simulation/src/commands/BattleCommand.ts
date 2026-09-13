import type { CardId } from "@project-palacio/content";
import type { PlayerId } from "../players/PlayerState";
import type { ZoneId } from "../zones/ZoneId";

export interface DeployUnitCommand {
  type: "DEPLOY_UNIT";
  playerId: PlayerId;
  cardId: CardId;
  targetZoneId: ZoneId;
}

export type BattleCommand = DeployUnitCommand;

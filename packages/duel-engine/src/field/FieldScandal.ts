import type { ScandalCardId } from "@duel-for-the-world/duel-content";
import type { DuelistId } from "../duelists/DuelistId";

// A Scandal card Set face-down on its controller's field, waiting on its
// trigger condition. See systems/ScandalSystem.ts for Setting it and
// BattleSystem.ts for Escandalo de Corrupcion's Ambush Destroy trigger.
export interface FieldScandal {
  instanceId: number;
  cardId: ScandalCardId;
  controllerId: DuelistId;
  // Which Backroom zone (0..BACKROOM_ZONE_COUNT-1) it's Set in. Unique per
  // duelist.
  zone: number;
}

import type { PlayerId } from "../players/PlayerState";
import type { ZoneId } from "./ZoneId";

export interface ZoneState {
  id: ZoneId;
  ownerId: PlayerId | null;
  controlHp: number;
  maxControlHp: number;
}

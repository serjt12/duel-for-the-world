import type { PlayerId, PlayerState } from "../players/PlayerState";
import type { UnitState } from "../units/UnitState";
import type { ZoneState } from "../zones/ZoneState";
import type { ZoneId } from "../zones/ZoneId";

export type MatchPhase =
  | "normal"
  | "election"
  | "extraordinary-election"
  | "sudden-death"
  | "finished";

export interface BattleState {
  tick: number;
  elapsedMs: number;
  phase: MatchPhase;
  players: Record<PlayerId, PlayerState>;
  units: UnitState[];
  nextUnitId: number;
  zones: Record<ZoneId, ZoneState>;
}

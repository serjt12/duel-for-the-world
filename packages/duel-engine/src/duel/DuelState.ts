import type { DuelistId } from "../duelists/DuelistId";
import type { DuelistState } from "../duelists/DuelistState";
import type { DuelPhase } from "./DuelPhase";
import type { DuelEvent } from "../events/DuelEvent";

export interface DuelState {
  // Shared, monotonically increasing counter -- turn 1 is duelist1's
  // first turn, turn 2 is duelist2's first turn, turn 3 is duelist1's
  // second turn, and so on. Used (among other things) to tell whether a
  // FieldActor was deployed this turn.
  turnNumber: number;
  activeDuelistId: DuelistId;
  phase: DuelPhase;
  duelists: Record<DuelistId, DuelistState>;
  winnerId: DuelistId | null;
  nextInstanceId: number;
  // Everything that has happened, in order (see DuelEvent). Public by
  // construction, so it can be shown to both players.
  log: DuelEvent[];
  // Election Night (see ElectionSystem): the votes are counted when turn
  // `turn` ends. `runoff` once a close first round has called a runoff.
  election: { turn: number; runoff: boolean };
}

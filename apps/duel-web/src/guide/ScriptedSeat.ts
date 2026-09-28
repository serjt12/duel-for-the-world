import type { DuelistId } from "@duel-for-the-world/duel-engine";
import type { PlayerAction } from "@duel-for-the-world/duel-server";
import type { ActionResult, DuelRoom } from "@duel-for-the-world/duel-server/offline";

/**
 * A computer seat that follows a fixed script instead of thinking: the
 * moves listed for each "turn:phase" in order, then Advance Phase. Same
 * shape as AiPlayer, so LocalDuel can drive either. A scripted move the
 * rules reject is skipped (the script can't get stuck).
 */
export class ScriptedSeat {
  readonly room: DuelRoom;
  readonly seat: DuelistId;
  private readonly script: Record<string, PlayerAction[]>;
  private phaseKey = "";
  private next = 0;

  constructor(room: DuelRoom, seat: DuelistId, script: Record<string, PlayerAction[]>) {
    this.room = room;
    this.seat = seat;
    this.script = script;
  }

  isToMove(): boolean {
    const state = this.room.state;
    return state.winnerId === null && state.activeDuelistId === this.seat;
  }

  step(): { action: PlayerAction; result: ActionResult } | null {
    if (!this.isToMove()) return null;
    const state = this.room.state;
    const key = `${state.turnNumber}:${state.phase}`;
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      this.next = 0;
    }
    const moves = this.script[key] ?? [];
    const action: PlayerAction = this.next < moves.length ? moves[this.next] : { type: "advance-phase" };
    this.next += 1;
    return { action, result: this.room.applyAction(this.seat, action) };
  }
}

import type { DuelistId } from "@duel-for-the-world/duel-engine";
import type { PlayerAction } from "../protocol/Messages";
import { redactStateFor } from "../protocol/redact";
import type { ActionResult, DuelRoom } from "../rooms/DuelRoom";
import { actionKey, chooseAiAction } from "./chooseAiAction";
import type { AiLevel } from "./chooseAiAction";

// After this many rejected tries in one phase, just move on (a safety net:
// the AI only proposes legal-looking moves, but the room has the final say).
const MAX_REJECTIONS_PER_PHASE = 12;

/**
 * Drives one seat of a DuelRoom for the computer. Each step() makes ONE
 * move (so a UI can show them one by one); it sees only its own redacted
 * view of the duel.
 */
export class AiPlayer {
  readonly room: DuelRoom;
  readonly seat: DuelistId;
  readonly level: AiLevel;
  private readonly random: () => number;
  private rejected = new Set<string>();
  private phaseKey = "";

  // (No constructor parameter properties: Node's type-stripping runs this file as-is.)
  constructor(room: DuelRoom, seat: DuelistId, level: AiLevel, random: () => number = Math.random) {
    this.room = room;
    this.seat = seat;
    this.level = level;
    this.random = random;
  }

  /** Whether the AI should move now. */
  isToMove(): boolean {
    const state = this.room.state;
    return state.winnerId === null && state.activeDuelistId === this.seat;
  }

  /** Makes one move; returns it (or null if it isn't the AI's turn). */
  step(): { action: PlayerAction; result: ActionResult } | null {
    if (!this.isToMove()) return null;
    const state = this.room.state;
    const key = `${state.turnNumber}:${state.phase}`;
    if (key !== this.phaseKey) {
      this.phaseKey = key;
      this.rejected = new Set();
    }
    const view = redactStateFor(state, this.seat, { edition: this.room.edition });
    const action: PlayerAction =
      this.rejected.size >= MAX_REJECTIONS_PER_PHASE
        ? { type: "advance-phase" }
        : chooseAiAction(view, this.seat, this.level, { random: this.random, rejected: this.rejected });
    const result = this.room.applyAction(this.seat, action);
    // A rejected move is remembered for this phase; the next step tries
    // something else (and eventually just advances).
    if (!result.ok) this.rejected.add(actionKey(action));
    return { action, result };
  }

  /** Plays until it's no longer the AI's turn (for tests and simulations). */
  playTurn(maxSteps = 200): number {
    let steps = 0;
    while (this.isToMove() && steps < maxSteps) {
      this.step();
      steps += 1;
    }
    return steps;
  }
}

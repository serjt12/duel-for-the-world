import type { Edition } from "@project-palacio/duel-content";
import type { DuelistId } from "@project-palacio/duel-engine";
import type { PlayerAction, PublicDuelState } from "@project-palacio/duel-server";
import { AiPlayer, DuelRoom, redactStateFor } from "@project-palacio/duel-server/offline";
import type { AiLevel } from "@project-palacio/duel-server/offline";
import type { GameClient } from "./GameClient";

// A duel against the computer, entirely on this device: the same DuelRoom
// (rules, validation) and the same redaction the online server uses, with
// the AI in the other seat. No network, so it works offline.
//
// The AI moves one step at a time with a short pause, so the player can
// follow what it does (and the field effects have time to play).

export interface LocalDuelHandlers {
  // A new duel started (the first one, or a rematch): which seat is yours.
  onSeat(you: DuelistId): void;
  onState(state: PublicDuelState): void;
  onActionRejected(reason: string): void;
  // True while the computer is taking its turn.
  onThinking(thinking: boolean): void;
}

const AI_STEP_MS = 850;
const AI_PHASE_MS = 320; // a plain "advance phase" doesn't need a long look

export class LocalDuel implements GameClient {
  private room!: DuelRoom;
  private ai!: AiPlayer;
  private human: DuelistId = "duelist1";
  private timer: number | null = null;
  private stopped = false;
  readonly edition: Edition;
  readonly level: AiLevel;
  private readonly handlers: LocalDuelHandlers;
  private readonly random: () => number;

  constructor(edition: Edition, level: AiLevel, handlers: LocalDuelHandlers, random: () => number = Math.random) {
    this.edition = edition;
    this.level = level;
    this.handlers = handlers;
    this.random = random;
  }

  /** Deals a new duel. Who goes first is a coin flip. */
  start(): void {
    this.clearTimer();
    this.room = new DuelRoom(undefined, undefined, this.random, this.edition);
    this.human = this.random() < 0.5 ? "duelist1" : "duelist2";
    const aiSeat: DuelistId = this.human === "duelist1" ? "duelist2" : "duelist1";
    this.ai = new AiPlayer(this.room, aiSeat, this.level, this.random);
    this.handlers.onSeat(this.human);
    this.push();
    this.scheduleAi();
  }

  /** Leaving the duel: no more AI moves or state updates. */
  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  createRoom(): void {
    // Not used offline: start() deals the duel.
  }

  joinRoom(): void {
    // Not used offline.
  }

  sendAction(action: PlayerAction): void {
    if (this.stopped) return;
    if (action.type === "rematch") {
      // The computer always accepts: straight into a new duel.
      if (this.room.state.winnerId) this.start();
      return;
    }
    const result = this.room.applyAction(this.human, action);
    // Answer asynchronously, like the network would.
    window.setTimeout(() => {
      if (this.stopped) return;
      if (!result.ok) {
        this.handlers.onActionRejected(result.reason);
        return;
      }
      this.push();
      this.scheduleAi();
    }, 0);
  }

  private push(): void {
    this.handlers.onState(
      redactStateFor(this.room.state, this.human, { rematchVotes: this.room.rematchVotes(), edition: this.edition }),
    );
  }

  private clearTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleAi(delay = AI_STEP_MS): void {
    this.clearTimer();
    const toMove = this.ai.isToMove();
    this.handlers.onThinking(toMove);
    if (!toMove || this.stopped) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (this.stopped) return;
      const move = this.ai.step();
      // Only successful moves change what the player sees.
      if (move?.result.ok) this.push();
      const next = this.ai.isToMove() && this.room.state.phase !== "agenda" ? AI_STEP_MS : AI_PHASE_MS;
      const quick = move && (!move.result.ok || move.action.type === "advance-phase");
      this.scheduleAi(quick ? AI_PHASE_MS : next);
    }, delay);
  }
}

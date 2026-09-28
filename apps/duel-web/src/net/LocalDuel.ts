import type { CardId, Edition } from "@duel-for-the-world/duel-content";
import type { DuelistId } from "@duel-for-the-world/duel-engine";
import type { PlayerAction, PublicDuelState } from "@duel-for-the-world/duel-server";
import { AiPlayer, DuelRoom, redactStateFor } from "@duel-for-the-world/duel-server/offline";
import type { ActionResult, AiLevel } from "@duel-for-the-world/duel-server/offline";
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

/** Whoever plays the other seat: the AI, or a script (the tutorial). */
export interface ComputerSeat {
  isToMove(): boolean;
  step(): { action: PlayerAction; result: ActionResult } | null;
}

export interface LocalDuelSetup {
  edition: Edition;
  // The AI's level (when no `opponent` is given).
  level: AiLevel;
  // Stacked decks, in draw order (default: shuffled default decks).
  decks?: { duelist1: CardId[]; duelist2: CardId[] };
  // Restricts a default (non-`decks`) deal to this pool -- the offline
  // card-unlock system's currently-unlocked cards. Ignored when `decks`
  // is given (the tutorial's fixed decks, e.g.).
  cardPool?: CardId[];
  // Your seat (default: a coin flip, i.e. who goes first).
  humanSeat?: DuelistId;
  // Count the votes when this turn ends instead of the usual turn.
  electionTurn?: number;
  // Who plays the other seat (default: the AI at `level`).
  opponent?: (room: DuelRoom, seat: DuelistId) => ComputerSeat;
  // Milliseconds between the computer's moves (default 850).
  stepMs?: number;
}

const AI_STEP_MS = 850;
const AI_PHASE_MS = 320; // a plain "advance phase" doesn't need a long look

export class LocalDuel implements GameClient {
  private room!: DuelRoom;
  private ai!: ComputerSeat;
  private human: DuelistId = "duelist1";
  private timer: number | null = null;
  private stopped = false;
  readonly edition: Edition;
  private readonly setup: LocalDuelSetup;
  private readonly handlers: LocalDuelHandlers;
  private readonly random: () => number;
  private readonly stepMs: number;

  constructor(setup: LocalDuelSetup, handlers: LocalDuelHandlers, random: () => number = Math.random) {
    this.setup = setup;
    this.edition = setup.edition;
    this.handlers = handlers;
    this.random = random;
    this.stepMs = setup.stepMs ?? AI_STEP_MS;
  }

  /** Deals a new duel. Who goes first is a coin flip (unless the setup says). */
  start(): void {
    this.clearTimer();
    const { decks, electionTurn, opponent, level } = this.setup;
    this.room = new DuelRoom(decks?.duelist1, decks?.duelist2, this.random, this.edition, this.setup.cardPool);
    if (electionTurn !== undefined) this.room.state.election.turn = electionTurn;
    this.human = this.setup.humanSeat ?? (this.random() < 0.5 ? "duelist1" : "duelist2");
    const aiSeat: DuelistId = this.human === "duelist1" ? "duelist2" : "duelist1";
    this.ai = opponent ? opponent(this.room, aiSeat) : new AiPlayer(this.room, aiSeat, level, this.random);
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

  private scheduleAi(delay = this.stepMs): void {
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
      const next = this.ai.isToMove() && this.room.state.phase !== "agenda" ? this.stepMs : AI_PHASE_MS;
      const quick = move && (!move.result.ok || move.action.type === "advance-phase");
      this.scheduleAi(quick ? AI_PHASE_MS : next);
    }, delay);
  }
}

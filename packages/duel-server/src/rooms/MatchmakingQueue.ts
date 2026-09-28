import type { Edition } from "@duel-for-the-world/duel-content";

/**
 * Quick match: at most one waiting "ticket" per edition. `T` is
 * deliberately generic (server.ts passes a WebSocket) so this stays a
 * plain, socket-free data structure to unit test -- the same way
 * RoomManager doesn't know anything about sockets either.
 */
export class MatchmakingQueue<T> {
  private readonly waiting = new Map<Edition, T>();

  /**
   * Looks for someone already waiting for this edition. If there is one
   * (and it isn't `ticket` itself), removes and returns them -- the
   * caller pairs the two up into a room. Otherwise remembers `ticket` as
   * the one now waiting and returns null.
   */
  match(edition: Edition, ticket: T): T | null {
    const opponent = this.waiting.get(edition);
    if (opponent !== undefined && opponent !== ticket) {
      this.waiting.delete(edition);
      return opponent;
    }
    this.waiting.set(edition, ticket);
    return null;
  }

  /**
   * Stops `ticket` waiting, wherever it's queued (a manual cancel, or its
   * connection dropped). Safe to call for a ticket that isn't actually
   * queued.
   */
  remove(ticket: T): void {
    for (const [edition, waitingTicket] of this.waiting) {
      if (waitingTicket === ticket) {
        this.waiting.delete(edition);
        return;
      }
    }
  }

  /** Is this ticket the one currently waiting (for any edition)? */
  isWaiting(ticket: T): boolean {
    for (const waitingTicket of this.waiting.values()) {
      if (waitingTicket === ticket) return true;
    }
    return false;
  }
}

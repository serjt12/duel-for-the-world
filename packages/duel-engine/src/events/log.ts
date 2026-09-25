import type { DuelistId } from "../duelists/DuelistId";
import type { DuelState } from "../duel/DuelState";
import type { DuelEventBody, WinReason } from "./DuelEvent";

/** Appends an event to the duel's log. */
export function logEvent(state: DuelState, event: DuelEventBody): void {
  state.log.push({ ...event, seq: state.log.length + 1 });
}

export function otherDuelist(id: DuelistId): DuelistId {
  return id === "duelist1" ? "duelist2" : "duelist1";
}

/**
 * Ends the duel in `winnerId`'s favor (once -- a decided duel stays
 * decided) and logs it.
 */
export function declareWinner(state: DuelState, winnerId: DuelistId, reason: WinReason): void {
  if (state.winnerId) {
    return;
  }
  state.winnerId = winnerId;
  logEvent(state, { kind: "duel-won", duelistId: winnerId, reason });
}

/**
 * Changes a duelist's Mandate by `amount` (floored at 0) and, if that
 * brings them to 0, ends the duel in the other duelist's favor.
 * `logChange`: false for battle damage (the battle event already reports
 * it).
 */
export function changeMandate(state: DuelState, duelistId: DuelistId, amount: number, logChange = true): void {
  const duelist = state.duelists[duelistId];
  const before = duelist.mandate;
  duelist.mandate = Math.max(0, duelist.mandate + amount);
  if (logChange && duelist.mandate !== before) {
    logEvent(state, { kind: "mandate-changed", duelistId, amount: duelist.mandate - before, mandate: duelist.mandate });
  }
  if (duelist.mandate <= 0) {
    declareWinner(state, otherDuelist(duelistId), "mandate");
  }
}

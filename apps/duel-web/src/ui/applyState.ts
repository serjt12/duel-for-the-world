import type { PublicDuelState } from "@project-palacio/duel-server";
import type { ClientState } from "../state/ClientState";
import { resetCardMemory } from "./cardView";
import { prepareFieldFx } from "./fieldFx";
import { setEdition } from "./flavor";
import { noteNewEvents } from "./headlines";
import { resetBoardMemory } from "./renderBoard";

/** Forget everything about the current duel's display (new duel, or leaving it). */
export function resetDuelView(state: ClientState): void {
  state.duel = null;
  state.lastSeenSeq = null;
  state.headlines = [];
  state.finaleDismissed = false;
  state.viewingEmbassy = null;
  state.embassyPick = null;
  state.interaction = { mode: "idle" };
  resetCardMemory();
  resetBoardMemory();
}

/**
 * Takes a new state from the server into ClientState. Returns the function
 * to call right AFTER re-rendering (it plays the field effects, which need
 * the old board still on screen when this runs). Shared by main.ts and the
 * test harness so they can't drift apart.
 */
export function applyServerState(state: ClientState, duel: PublicDuelState, rerender: () => void): () => void {
  // A rematch starts a brand-new duel in the same room: its log restarts,
  // instance ids are reused, and the results screen should go away.
  const last = duel.log.length > 0 ? duel.log[duel.log.length - 1].seq : 0;
  const newDuel = state.duel !== null && state.lastSeenSeq !== null && last < state.lastSeenSeq;
  if (newDuel) {
    state.lastSeenSeq = null;
    state.headlines = [];
    state.finaleDismissed = false;
    state.viewingEmbassy = null;
    state.embassyPick = null;
    resetCardMemory();
    resetBoardMemory();
  }

  // Everything the UI says depends on the room's edition (flavor.ts).
  setEdition(duel.edition);
  const playFieldFx = prepareFieldFx(newDuel ? null : state.duel, duel, state.lastSeenSeq);
  noteNewEvents(state, duel, rerender);
  state.duel = duel;
  state.interaction = { mode: "idle" };
  return playFieldFx;
}

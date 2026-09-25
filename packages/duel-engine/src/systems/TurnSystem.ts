import type { DuelistId } from "../duelists/DuelistId";
import type { DuelPhase } from "../duel/DuelPhase";
import type { DuelState } from "../duel/DuelState";
import { declareWinner, logEvent } from "../events/log";
import { resolveActorEffect } from "../effects/resolveInstantEffects";
import { holdElection } from "./ElectionSystem";

const PHASE_ORDER: DuelPhase[] = [
  "agenda",
  "campaign-1",
  "confrontation",
  "campaign-2",
  "recess",
];

function otherDuelist(id: DuelistId): DuelistId {
  return id === "duelist1" ? "duelist2" : "duelist1";
}

/**
 * Advances to the next phase in the turn, and -- when Recess Phase ends
 * -- rolls over into the other duelist's Agenda Phase for the next turn:
 * turn/active-duelist counters update, per-turn flags reset, and the new
 * active duelist draws (deck-out on an empty deck ends the duel
 * immediately in the other duelist's favor). A no-op once the duel is
 * already won.
 */
export function advancePhase(state: DuelState): void {
  if (state.winnerId) {
    return;
  }

  const currentIndex = PHASE_ORDER.indexOf(state.phase);
  const isLastPhase = currentIndex === PHASE_ORDER.length - 1;

  if (!isLastPhase) {
    state.phase = PHASE_ORDER[currentIndex + 1];
    return;
  }

  // Election Night: the votes are counted as the election turn ends,
  // before the next duelist's turn begins.
  if (state.turnNumber === state.election.turn) {
    holdElection(state);
    if (state.winnerId) {
      return;
    }
  }

  state.activeDuelistId = otherDuelist(state.activeDuelistId);
  state.turnNumber += 1;
  state.phase = "agenda";

  const duelist = state.duelists[state.activeDuelistId];
  duelist.hasNormalDeployedThisTurn = false;
  duelist.hasSetScandalThisTurn = false;

  for (const actor of duelist.field) {
    actor.hasAttackedThisTurn = false;
    actor.hasChangedStanceThisTurn = false;
  }

  logEvent(state, { kind: "turn-started", duelistId: state.activeDuelistId, turn: state.turnNumber });
  drawForActiveDuelist(state);

  // "Each turn" abilities of the new active duelist's face-up Actors.
  for (const actor of [...duelist.field]) {
    if (state.winnerId) break;
    if (actor.facing === "face-up" && duelist.field.includes(actor)) {
      resolveActorEffect(state, actor, "turn-start");
    }
  }
}

function drawForActiveDuelist(state: DuelState): void {
  const duelist = state.duelists[state.activeDuelistId];
  const drawnCard = duelist.deck.shift();

  if (drawnCard === undefined) {
    declareWinner(state, otherDuelist(state.activeDuelistId), "deck-out");
    return;
  }

  duelist.hand.push(drawnCard);
}

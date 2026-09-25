import type { CardId } from "@project-palacio/duel-content";
import { ELECTION_TURN, STARTING_HAND_SIZE, STARTING_MANDATE } from "../config/DuelConfig";
import type { DuelistId } from "../duelists/DuelistId";
import type { DuelistState } from "../duelists/DuelistState";
import type { DuelState } from "./DuelState";

function createDuelist(id: DuelistId, deck: CardId[]): DuelistState {
  const deckCopy = [...deck];
  const hand = deckCopy.splice(0, STARTING_HAND_SIZE);

  return {
    id,
    mandate: STARTING_MANDATE,
    deck: deckCopy,
    hand,
    field: [],
    archive: [],
    setScandals: [],
    backroomPolicies: [],
    hasNormalDeployedThisTurn: false,
    hasSetScandalThisTurn: false,
    bonusVotes: 0,
  };
}

/**
 * Builds a fresh duel from two decks, already in draw order (this
 * engine doesn't shuffle -- that's a presentation-layer concern, so
 * callers and tests control ordering directly and deterministically).
 * Each duelist draws an opening hand of STARTING_HAND_SIZE.
 *
 * The duel starts in duelist1's Agenda Phase on turn 1, without an
 * extra draw beyond the opening hand -- the "going first skips the
 * first draw" rule falls out naturally from advancePhase() only ever
 * drawing when it *enters* an Agenda Phase via a phase transition, which
 * this initial state is not.
 */
export function createDuel(deck1: CardId[], deck2: CardId[]): DuelState {
  return {
    turnNumber: 1,
    activeDuelistId: "duelist1",
    phase: "agenda",
    duelists: {
      duelist1: createDuelist("duelist1", deck1),
      duelist2: createDuelist("duelist2", deck2),
    },
    winnerId: null,
    nextInstanceId: 1,
    log: [{ kind: "turn-started", duelistId: "duelist1", turn: 1, seq: 1 }],
    election: { turn: ELECTION_TURN, runoff: false },
  };
}

import type { DuelistId } from "../duelists/DuelistId";
import type { DuelState } from "../duel/DuelState";
import { RUNOFF_EXTRA_TURNS, RUNOFF_MARGIN } from "../config/DuelConfig";
import { declareWinner, logEvent } from "../events/log";
import { fireScandal } from "../effects/fireScandal";
import { passiveOf } from "../field/passives";
import { getEffectiveStats } from "./EffectiveStats";

/**
 * A duelist's votes if the election were held right now: their Mandate
 * (legitimacy) plus their campaign strength -- the total effective ATK of
 * their Actors in Campaign Stance -- plus votes from cards. So in the final turns there's a real
 * choice between campaigning in the open (more votes, but exposed to
 * attack) and hunkering down in Resistance. All of it is public
 * information (Campaign Actors are always face-up).
 */
export interface VoteCount {
  mandate: number;
  campaign: number;
  // Votes from cards: gained votes (Bot Farm...) plus "+N votes" passives.
  bonus: number;
  total: number;
}

export function countVotes(state: DuelState, duelistId: DuelistId): VoteCount {
  const duelist = state.duelists[duelistId];
  const campaign = duelist.field
    .filter((actor) => actor.stance === "campaign")
    .reduce((sum, actor) => sum + getEffectiveStats(actor, state).atk, 0);
  const passiveVotes = duelist.field.reduce((sum, actor) => sum + (passiveOf(actor, "votes-bonus")?.amount ?? 0), 0);
  const bonus = duelist.bonusVotes + passiveVotes;
  return { mandate: duelist.mandate, campaign, bonus, total: duelist.mandate + campaign + bonus };
}

/**
 * Election Night. Called by TurnSystem when the election turn ends.
 *
 * - First round: a lead of more than RUNOFF_MARGIN votes wins the duel
 *   outright. Otherwise a runoff is called: RUNOFF_EXTRA_TURNS more turns
 *   (one each), with doubled battle Mandate damage (see BattleSystem),
 *   then a final count.
 * - Runoff: any lead wins. A dead heat goes to whoever has fewer cards in
 *   La Embajada (the cleaner record); if that's level too, to duelist2 --
 *   the one who didn't get to play first.
 */
export function holdElection(state: DuelState): void {
  // Last-minute Scandals (Recount) get their say before the count.
  fireScandal(state, "duelist1", "election-night", {});
  fireScandal(state, "duelist2", "election-night", {});
  if (state.winnerId) return;

  const votes = {
    duelist1: countVotes(state, "duelist1"),
    duelist2: countVotes(state, "duelist2"),
  };
  const lead = votes.duelist1.total - votes.duelist2.total;
  const leader: DuelistId | null = lead > 0 ? "duelist1" : lead < 0 ? "duelist2" : null;
  const round = state.election.runoff ? "runoff" : "first";

  logEvent(state, { kind: "election-held", duelistId: leader ?? "duelist1", round, votes, leaderId: leader });

  if (round === "first") {
    if (leader && Math.abs(lead) > RUNOFF_MARGIN) {
      declareWinner(state, leader, "election");
      return;
    }
    state.election = { turn: state.turnNumber + RUNOFF_EXTRA_TURNS, runoff: true };
    logEvent(state, { kind: "runoff-called", duelistId: leader ?? "duelist1", untilTurn: state.election.turn });
    return;
  }

  if (leader) {
    declareWinner(state, leader, "runoff");
    return;
  }
  const embassy1 = state.duelists.duelist1.archive.length;
  const embassy2 = state.duelists.duelist2.archive.length;
  declareWinner(state, embassy1 < embassy2 ? "duelist1" : "duelist2", "tiebreak");
}

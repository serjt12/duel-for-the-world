// Rule-level balance values (tuned with the balance simulator:
// packages/duel-server/scripts/balance-sim.ts).
//
// Card-specific numbers (e.g. how much Mandate Decreto de Emergencia
// grants) are NOT here: they live on each card's own definition in
// duel-content, so tuning a card is a content change.
export const STARTING_MANDATE = 20;
export const STARTING_HAND_SIZE = 5;

// Yu-Gi-Oh-style field zones: how many Actors, and how many Set Scandals
// (the "Backroom" row), a duelist can have out at once. Each field card
// occupies one numbered zone (0..count-1) and stays in it.
export const ACTOR_ZONE_COUNT = 5;
export const BACKROOM_ZONE_COUNT = 5;

// Election Night (see ElectionSystem.ts). The duel doesn't only end by
// knockout: when turn ELECTION_TURN ends (each duelist has had 6 turns),
// the votes are counted. A lead of RUNOFF_MARGIN votes or less forces a
// runoff: RUNOFF_EXTRA_TURNS more turns (one each) in which battle
// Mandate damage is multiplied by RUNOFF_DAMAGE_MULTIPLIER, then a final
// count.
export const ELECTION_TURN = 12;
export const RUNOFF_MARGIN = 3;
export const RUNOFF_EXTRA_TURNS = 2;
export const RUNOFF_DAMAGE_MULTIPLIER = 2;

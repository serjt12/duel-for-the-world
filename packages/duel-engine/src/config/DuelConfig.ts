// Rule-level balance values (tuned with the balance simulator:
// packages/duel-server/scripts/balance-sim.ts).
//
// Card-specific numbers (e.g. how much Mandate Decreto de Emergencia
// grants) are NOT here: they live on each card's own definition in
// duel-content, so tuning a card is a content change.
//
// STARTING_MANDATE was 20 (bumped to 26): playtesting found matches felt
// short next to Magic/Yu-Gi-Oh, where there's no turn ceiling at all, only
// the knockout floor. A higher starting Mandate means knockouts take
// longer too, not just a longer clock before a forced election.
export const STARTING_MANDATE = 26;
export const STARTING_HAND_SIZE = 5;

// Yu-Gi-Oh-style field zones: how many Actors, and how many Set Scandals
// (the "Backroom" row), a duelist can have out at once. Each field card
// occupies one numbered zone (0..count-1) and stays in it.
export const ACTOR_ZONE_COUNT = 5;
export const BACKROOM_ZONE_COUNT = 5;

// Election Night (see ElectionSystem.ts). The duel doesn't only end by
// knockout: when turn ELECTION_TURN ends (each duelist has had 9 turns),
// the votes are counted. A lead of RUNOFF_MARGIN votes or less forces a
// runoff: RUNOFF_EXTRA_TURNS more turns (one each) in which battle
// Mandate damage is multiplied by RUNOFF_DAMAGE_MULTIPLIER, then a final
// count.
//
// ELECTION_TURN was 12 (6 turns each), RUNOFF_MARGIN was 3. Both moved
// together with STARTING_MANDATE above: RUNOFF_MARGIN has to scale with
// Mandate, not stay fixed, or a fixed 3-point gap becomes statistically
// rarer as vote totals get bigger from a higher Mandate baseline -- close
// elections would get quietly rarer as a side effect, not because anyone
// meant to change how often runoffs happen.
export const ELECTION_TURN = 18;
export const RUNOFF_MARGIN = 4;
export const RUNOFF_EXTRA_TURNS = 2;
export const RUNOFF_DAMAGE_MULTIPLIER = 2;

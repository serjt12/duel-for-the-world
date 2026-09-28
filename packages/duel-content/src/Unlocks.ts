import type { CardId } from "./CardId";
import type { Edition } from "./Edition";
import { cardsOfEdition } from "./editions";

/**
 * Offline progression: which World Edition cards a brand-new player
 * already has, and which unlock later by winning matches against the
 * computer. Online (room-code) duels never gate on this -- see
 * `packages/duel-server/src/rooms/DuelRoom.ts`'s `cardPool` argument to
 * `buildDefaultDeck`, which offline play alone supplies.
 *
 * The starter set is every "common" grassroots Actor plus a handful of
 * simple Establishment/Leader/Policy/Scandal cards -- enough to play a
 * full, varied duel from the first match. Everything else unlocks two
 * offline wins apart, roughly ordered from simplest to most complex kit,
 * saving a few of the flashiest cards (Lobbying Deal, the tuned outlier;
 * Government-in-Exile, the scaling Leader) for last.
 *
 * An edition with no entry here (Colombia, for now) is always fully
 * unlocked: there's nothing curated to gate it with yet.
 */

const WORLD_STARTER_CARDS: readonly CardId[] = [
  // Grassroots (the 7 "common"-rarity Actors; the 5 "uncommon" ones, all
  // built around an Embassy-retrieval effect, are unlock rewards below).
  "protester",
  "riot-cop",
  "intern",
  "pollster",
  "party-loyalist",
  "talk-show-host",
  "bureaucrat",
  // Establishment (2 of 4 -- the plainest kits).
  "career-senator",
  "media-mogul",
  // Leaders (3 of 8 -- enough for an early deck to vary its head of state).
  "eternal-incumbent",
  "oil-baron",
  "tweeting-tycoon",
  // Policies (5 of 9).
  "presidential-pardon",
  "bot-farm",
  "stimulus-package",
  "attack-ad",
  "persona-non-grata",
  // Scandals (3 of 6).
  "leaked-emails",
  "hot-mic",
  "paper-trail",
];

/** One unlock: which card, and how many offline wins it takes. */
export interface UnlockStep {
  id: CardId;
  winsRequired: number;
}

// Sorted ascending by winsRequired -- unlockedCardsOfEdition and
// nextUnlock both depend on that order (checked by Unlocks.test.ts).
const WORLD_UNLOCK_ORDER: readonly UnlockStep[] = [
  { id: "lobbyist", winsRequired: 2 },
  { id: "impeachment", winsRequired: 4 },
  { id: "ghostwriter", winsRequired: 6 },
  { id: "political-comeback", winsRequired: 8 },
  { id: "defector", winsRequired: 10 },
  { id: "party-chairman", winsRequired: 12 },
  { id: "martyrdom", winsRequired: 14 },
  { id: "whistleblower", winsRequired: 16 },
  { id: "referendum-czar", winsRequired: 18 },
  { id: "declassified-files", winsRequired: 20 },
  { id: "revolving-door-consultant", winsRequired: 22 },
  { id: "comeback-kid", winsRequired: 24 },
  { id: "recount", winsRequired: 26 },
  { id: "algorithm-chairman", winsRequired: 28 },
  { id: "lobbying-deal", winsRequired: 30 },
  { id: "lifelong-generalissimo", winsRequired: 32 },
  { id: "international-summit", winsRequired: 34 },
  { id: "victim-in-chief", winsRequired: 36 },
  { id: "government-in-exile", winsRequired: 38 },
];

const STARTER_CARDS: Partial<Record<Edition, readonly CardId[]>> = {
  world: WORLD_STARTER_CARDS,
};

const UNLOCK_ORDER: Partial<Record<Edition, readonly UnlockStep[]>> = {
  world: WORLD_UNLOCK_ORDER,
};

/** Does this edition gate any of its cards behind offline progress? */
export function hasUnlocks(edition: Edition): boolean {
  return edition in STARTER_CARDS;
}

/** The cards a brand-new player can already use offline, in this edition. */
export function starterCardsOfEdition(edition: Edition): CardId[] {
  return [...(STARTER_CARDS[edition] ?? cardsOfEdition(edition))];
}

/** The rest of the edition's cards, in the order offline wins unlock them. */
export function unlockOrderOfEdition(edition: Edition): readonly UnlockStep[] {
  return UNLOCK_ORDER[edition] ?? [];
}

/**
 * Every card available offline once `offlineWins` matches have been won
 * against the computer. Editions with no curated starter set are always
 * fully unlocked.
 */
export function unlockedCardsOfEdition(edition: Edition, offlineWins: number): CardId[] {
  if (!hasUnlocks(edition)) return cardsOfEdition(edition);
  const unlocked = new Set(starterCardsOfEdition(edition));
  for (const step of unlockOrderOfEdition(edition)) {
    if (offlineWins >= step.winsRequired) unlocked.add(step.id);
  }
  return [...unlocked];
}

/**
 * The next card offline play will unlock, and how many wins it needs --
 * null once every card in the edition is already unlocked (or the
 * edition doesn't gate cards at all).
 */
export function nextUnlock(edition: Edition, offlineWins: number): UnlockStep | null {
  return unlockOrderOfEdition(edition).find((step) => step.winsRequired > offlineWins) ?? null;
}

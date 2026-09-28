import { CARDS, cardsOfEdition } from "@duel-for-the-world/duel-content";
import type { ActorCardId, CardId, Edition } from "@duel-for-the-world/duel-content";
import {
  activatePolicy,
  activateSetPolicy,
  advancePhase,
  changeStance,
  createDuel,
  declareAttack,
  deployActor,
  setPolicy,
  setScandal,
} from "@duel-for-the-world/duel-engine";
import type { DuelistId, DuelState } from "@duel-for-the-world/duel-engine";
import type { PlayerAction } from "../protocol/Messages";
import { shuffle } from "./shuffle";

export type PlayerSlot = DuelistId;

export type ActionResult = { ok: true } | { ok: false; reason: string };

// The default deck every player uses until deck-building exists, per
// edition. Built from the content pool, so new cards join automatically.
// Listed in a fixed order; the room shuffles it (see the constructor).
//
// - Edición Colombia (34 cards): 2 of each Grassroots Actor, 1 of each
//   Establishment Actor, 1 of each Policy and Scandal.
// - World Edition (40 cards): 2 of each common and 1 of each uncommon
//   Grassroots Actor, 1 of each Establishment Actor, WORLD_LEADERS_PER_DECK
//   Leaders picked at random (a different head of state each duel), 1 of
//   each Policy and Scandal.
export const GRASSROOTS_COPIES = 2;
export const WORLD_LEADERS_PER_DECK = 2;

/**
 * `pool` restricts which cards the deck is built from -- omitted, it's
 * the whole edition (every online/server call site). Offline play alone
 * passes a restricted pool, for the card-unlock system (see
 * `@duel-for-the-world/duel-content`'s Unlocks.ts): a new player's deck
 * comes only from their unlocked cards until they win more matches.
 */
export function buildDefaultDeck(
  edition: Edition,
  random: () => number = Math.random,
  pool: CardId[] = cardsOfEdition(edition),
): CardId[] {
  const deck: CardId[] = [];
  const leaders: ActorCardId[] = [];

  for (const id of pool) {
    const card = CARDS[id];
    if (card.category !== "actor") continue;
    if (card.tier === "leader") {
      leaders.push(card.id);
      continue;
    }
    const copies =
      card.tier !== "grassroots" ? 1 : edition === "world" && card.rarity === "uncommon" ? 1 : GRASSROOTS_COPIES;
    for (let i = 0; i < copies; i += 1) deck.push(card.id);
  }
  deck.push(...shuffle(leaders, random).slice(0, WORLD_LEADERS_PER_DECK));
  deck.push(...pool.filter((id) => CARDS[id].category === "policy"));
  deck.push(...pool.filter((id) => CARDS[id].category === "scandal"));

  return deck;
}

/**
 * A single authoritative duel. This is the server-side boundary that keeps
 * clients from ever running the rules themselves: a connected client sends
 * a PlayerAction, the room checks whose turn it actually is and hands off
 * to duel-engine, and the (possibly rejected) result is all the caller
 * gets back. Two PlayerSlots (duelist1/duelist2) are handed out on a
 * first-come basis via join().
 */
export class DuelRoom {
  // Replaced (not mutated) when a rematch starts a fresh duel.
  state: DuelState;
  // Which card set this room plays with (fixed for the room's lifetime).
  readonly edition: Edition;
  private readonly newDuel: () => DuelState;
  private readonly rematchRequests = new Set<PlayerSlot>();
  private readonly filledSlots: Record<PlayerSlot, boolean> = {
    duelist1: false,
    duelist2: false,
  };
  // A per-slot secret handed out once, when that slot is first taken (by
  // join() or a later reconnect() -- see below). Whoever holds it can
  // reclaim that slot after a dropped connection: the socket layer
  // (server.ts) is what actually drops and re-associates connections, but
  // it needs somewhere to check a presented token against the slot it
  // claims to belong to, and that's here, next to the rest of "who is in
  // this room."
  private readonly tokens: Partial<Record<PlayerSlot, string>> = {};
  // Whether each taken slot currently has a live socket. A slot can be
  // filled (join() was called) but not connected (its socket dropped and
  // hasn't rejoined yet).
  private readonly connectedSlots: Record<PlayerSlot, boolean> = {
    duelist1: false,
    duelist2: false,
  };

  /**
   * Explicit decks are used exactly as given, in draw order (tests rely on
   * that). Omitted decks get the default deck, shuffled -- otherwise its
   * fixed listing order would bury the Policy/Scandal cards at the bottom
   * where nobody draws them for many turns. `random` is
   * injectable so tests can pin the shuffle.
   */
  constructor(
    deck1?: CardId[],
    deck2?: CardId[],
    random: () => number = Math.random,
    edition: Edition = "world",
    // Restricts default (unspecified) decks to this pool -- see
    // buildDefaultDeck's `pool` param. Explicit deck1/deck2 ignore it
    // entirely, same as always. Re-read on every rematch (the closure
    // below), so a rematch still re-rolls leaders and shuffle order.
    cardPool?: CardId[],
  ) {
    this.edition = edition;
    this.newDuel = () =>
      createDuel(
        deck1 ? [...deck1] : shuffle(buildDefaultDeck(edition, random, cardPool), random),
        deck2 ? [...deck2] : shuffle(buildDefaultDeck(edition, random, cardPool), random),
      );
    this.state = this.newDuel();
  }

  /** Who has asked for a rematch (only meaningful once the duel is over). */
  rematchVotes(): PlayerSlot[] {
    return [...this.rematchRequests].sort();
  }

  // Either player may ask once the duel is over; when both have, a fresh
  // duel (re-shuffled decks) starts in the same room.
  private requestRematch(playerSlot: PlayerSlot): ActionResult {
    if (!this.state.winnerId) {
      return { ok: false, reason: "duel-not-over" };
    }
    this.rematchRequests.add(playerSlot);
    if (this.rematchRequests.size === 2) {
      this.rematchRequests.clear();
      this.state = this.newDuel();
    }
    return { ok: true };
  }

  // Assigns the next open player slot, or null once both are taken. Also
  // mints that slot's reconnect token and marks it connected.
  join(): PlayerSlot | null {
    let slot: PlayerSlot | null = null;

    if (!this.filledSlots.duelist1) {
      this.filledSlots.duelist1 = true;
      slot = "duelist1";
    } else if (!this.filledSlots.duelist2) {
      this.filledSlots.duelist2 = true;
      slot = "duelist2";
    }

    if (slot) {
      this.tokens[slot] = crypto.randomUUID();
      this.connectedSlots[slot] = true;
    }

    return slot;
  }

  isFull(): boolean {
    return this.filledSlots.duelist1 && this.filledSlots.duelist2;
  }

  /** The reconnect token for a slot that's already been join()ed. */
  tokenFor(slot: PlayerSlot): string | undefined {
    return this.tokens[slot];
  }

  /**
   * Reclaims a slot from a presented reconnect token: marks it connected
   * again and returns which slot it was. Returns null for an unrecognized
   * token so the caller can reject the attempt without knowing (or caring)
   * which slots exist.
   */
  reconnect(token: string): PlayerSlot | null {
    for (const slot of ["duelist1", "duelist2"] as const) {
      if (this.tokens[slot] === token) {
        this.connectedSlots[slot] = true;
        return slot;
      }
    }
    return null;
  }

  /** Marks a slot's socket as gone (its reconnect token still stands). */
  disconnectSlot(slot: PlayerSlot): void {
    this.connectedSlots[slot] = false;
  }

  isSlotConnected(slot: PlayerSlot): boolean {
    return this.connectedSlots[slot];
  }

  /** True once every slot that's ever been filled has gone quiet. */
  allFilledSlotsDisconnected(): boolean {
    return (["duelist1", "duelist2"] as const).every(
      (slot) => !this.filledSlots[slot] || !this.connectedSlots[slot],
    );
  }

  applyAction(playerSlot: PlayerSlot, action: PlayerAction): ActionResult {
    // `action` arrives as parsed JSON from an untrusted client: the type
    // annotation describes what a well-behaved client sends, not a
    // guarantee. Anything malformed must be rejected here, never allowed
    // to throw -- an exception in here would take the whole server down.
    if (typeof action !== "object" || action === null) {
      return { ok: false, reason: "invalid-action" };
    }

    // A rematch can be asked for by either player, whoever's turn it was.
    if (action.type === "rematch") {
      return this.requestRematch(playerSlot);
    }

    if (this.state.winnerId) {
      return { ok: false, reason: "duel-over" };
    }

    if (playerSlot !== this.state.activeDuelistId) {
      return { ok: false, reason: "not-your-turn" };
    }

    switch (action.type) {
      case "advance-phase":
        advancePhase(this.state);
        return { ok: true };
      case "deploy-actor":
        return deployActor(this.state, action.actorCardId, action.options);
      case "declare-attack":
        return declareAttack(this.state, action.attackerInstanceId, action.targetInstanceId);
      case "activate-policy":
        return activatePolicy(this.state, action.policyCardId, action.options ?? {});
      case "set-policy":
        return setPolicy(this.state, action.policyCardId, action.zone);
      case "activate-set-policy":
        return activateSetPolicy(this.state, action.instanceId, action.options ?? {});
      case "set-scandal":
        return setScandal(this.state, action.scandalCardId, action.zone);
      case "change-stance":
        return changeStance(this.state, action.instanceId, action.options ?? {});
      default:
        return { ok: false, reason: "unknown-action" };
    }
  }
}

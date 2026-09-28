// The effect vocabulary: what cards can *do*, described as data.
//
// Cards declare their effects using the types below; duel-engine owns the
// one implementation of each effect kind. Adding a card whose effect uses
// existing kinds is purely a content change (a new entry in Cards.ts, plus
// art). Adding a genuinely new *kind* of effect means extending a union
// here AND adding its resolver case in duel-engine -- TypeScript's
// exhaustiveness checks point at every place that needs updating.
//
// Deliberately small: only the kinds today's cards actually use, each
// generalized just enough to be reusable (amounts, recipients, stat
// values are parameters, not hard-coded). New kinds get added alongside
// the cards that need them, not speculatively.

// The discard pile is "the Embassy" (La Embajada in Edición Colombia):
// an unwanted politician gets "sent off as ambassador". Internally it's
// still called `archive` (DuelistState.archive); its per-edition names
// live in Edition.ts (EMBASSY_TEXT).

/**
 * Which cards in an Embassy an effect may pick from. `maxAtk` applies to
 * Actors' printed ATK.
 */
export interface CardFilter {
  category?: "actor" | "policy" | "scandal";
  maxAtk?: number;
}

/** Who an effect applies to, relative to the player who played the card. */
export type EffectRecipient = "you" | "opponent";

/**
 * One-shot effects that resolve immediately -- when a Normal Policy is
 * activated, or when an Actor with an on-deploy / on-flip effect is
 * deployed / flipped face-up.
 */
export type InstantEffect =
  // Positive amount = gain, negative = loss. Mandate never drops below 0,
  // and a player brought to 0 loses the duel (same rule as battle damage).
  | { kind: "change-mandate"; recipient: EffectRecipient; amount: number }
  // Draw from the top of the deck. Stops quietly if the deck runs out --
  // only the turn's own draw can deck a player out.
  | { kind: "draw-cards"; recipient: EffectRecipient; count: number }
  // Sends the card's chosen target Actor (see PolicyTarget) to its
  // controller's Embajada, with anything equipped to it. Only valid on a
  // card that declares a target.
  | { kind: "send-target-to-embassy" }
  // Takes one matching card from an Embassy -- yours or your opponent's --
  // into your hand, or (Actors only, to: "field") back onto your field
  // face-up in Resistance ("revive"; needs a free Actor zone). The player
  // picks which card when they play it; with no pick (e.g. a triggered
  // effect) it takes the most recent match. Does nothing if nothing
  // matches.
  | { kind: "retrieve-from-embassy"; from: "yours" | "opponents"; filter: CardFilter; to: "hand" | "field" }
  // Votes that count on Election Night on top of Mandate and campaign
  // strength (see duel-engine's countVotes).
  | { kind: "gain-votes"; amount: number }
  // Discard the card(s) you've held longest (the front of the hand).
  | { kind: "discard-oldest"; count: number }
  // Moves Election Night later (before any runoff has been called).
  | { kind: "postpone-election"; turns: number };

/**
 * Always-on abilities of an Actor, active only while it is face-up on
 * the field.
 */
export type Passive =
  // Your OTHER Actors get this bonus.
  | { kind: "buff-others"; atk: number; def: number }
  // Extra votes on Election Night.
  | { kind: "votes-bonus"; amount: number }
  // +amount ATK for each Actor card in its controller's Embassy, up to
  // +max total (uncapped if max is omitted).
  | { kind: "atk-per-embassy-actor"; amount: number; max?: number }
  // Opposing card effects can't target it or send it to the Embassy.
  | { kind: "immune-to-effects" }
  // Can't be deployed in, or switched to, Resistance.
  | { kind: "campaign-only" }
  // Its controller sees the opponent's face-down cards.
  | { kind: "reveal-opponent-hidden" }
  // Whenever ANOTHER of its controller's Actors is sent to the Embassy
  // (not by tribute), its controller gains `amount` Mandate.
  | { kind: "mandate-when-ally-lost"; amount: number };

/**
 * A continuous change to an Actor's ATK/DEF, e.g. while an Equip Policy is
 * attached. Values may be negative; effective stats never drop below 0.
 */
export interface StatModifier {
  atk: number;
  def: number;
}

/**
 * Which Actor a card must be pointed at when it's played:
 * - "your-actor": one of the player's own field Actors.
 * - "opponent-actor": one of the opponent's field Actors (face-up or not).
 */
export type ActorTarget = "your-actor" | "opponent-actor";

/**
 * The game events a Set Scandal can lie in wait for, from the point of
 * view of the Scandal's controller. All fire automatically, and each Set
 * Scandal fires (and is spent) at most once.
 *
 * - "attack-on-your-actor": an opposing Actor declares an attack that
 *   targets one of your Actors. Resolves before any damage.
 * - "direct-attack-on-you": an opposing Actor attacks your Mandate
 *   directly. Resolves before any damage.
 * - "opponent-deploys-establishment": your opponent deploys an
 *   Establishment-tier Actor face-up (after its tribute is paid, before
 *   its own on-deploy effect). A face-down Set doesn't trigger it -- the
 *   Scandal can't react to a card it can't see.
 */
export type ScandalEvent =
  | "attack-on-your-actor"
  | "direct-attack-on-you"
  // Your opponent deploys an Establishment (or Leader) Actor face-up.
  | "opponent-deploys-establishment"
  // One of your Actors is destroyed in battle (after the battle).
  | "your-actor-destroyed-in-battle"
  // Your opponent activates a Policy (after it resolves).
  | "opponent-activates-policy"
  // Election Night is about to be counted (first round or runoff).
  | "election-night";

/** What a triggered Scandal does in response. */
export type ScandalResponse =
  // Attack events only: destroys the attacking Actor, so the attack does
  // nothing further.
  | { kind: "destroy-attacker" }
  // Deploy event only: the just-deployed Actor goes to its controller's
  // Embajada (its tribute stays paid).
  | { kind: "send-deployed-to-embassy" }
  // Actor-destroyed event only: that Actor goes from your Embassy back to
  // your hand.
  | { kind: "return-destroyed-to-hand" }
  // Any event: votes for the Scandal's controller.
  | { kind: "gain-votes"; amount: number }
  // Any event. Recipient is relative to the Scandal's controller.
  | { kind: "change-mandate"; recipient: EffectRecipient; amount: number };

export interface ScandalTrigger {
  event: ScandalEvent;
  responses: ScandalResponse[];
}

/** Which responses make sense for which events (checked by content lint). */
export const RESPONSES_FOR_EVENT: Record<ScandalEvent, ReadonlyArray<ScandalResponse["kind"]>> = {
  "attack-on-your-actor": ["destroy-attacker", "change-mandate"],
  "direct-attack-on-you": ["destroy-attacker", "change-mandate"],
  "opponent-deploys-establishment": ["send-deployed-to-embassy", "change-mandate"],
  "your-actor-destroyed-in-battle": ["return-destroyed-to-hand", "change-mandate", "gain-votes"],
  "opponent-activates-policy": ["change-mandate", "gain-votes"],
  "election-night": ["gain-votes", "change-mandate"],
};

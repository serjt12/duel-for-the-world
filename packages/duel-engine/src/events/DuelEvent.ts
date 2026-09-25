import type { ActorCardId, CardId, PolicyCardId, ScandalCardId } from "@project-palacio/duel-content";
import type { DuelistId } from "../duelists/DuelistId";
import type { ActorStance } from "../field/FieldActor";
import type { VoteCount } from "../systems/ElectionSystem";

/** How a duel was won. */
export type WinReason = "mandate" | "deck-out" | "election" | "runoff" | "tiebreak";

/** Why a card went to its controller's Embajada (the discard pile). */
export type EmbassyReason = "battle" | "tribute" | "scandal" | "effect";

/**
 * One thing that happened in the duel, in the order it happened. The
 * engine appends these to DuelState.log as it resolves actions, so every
 * client can show exactly what an action did -- including the parts no
 * one asked for, like a Scandal firing.
 *
 * **Public by construction:** an event never names a card that is still
 * hidden from the opponent. A face-down deploy or a Set card is logged
 * without its cardId; an attack on a face-down Actor names it only once
 * the battle has flipped it face-up. The server can therefore send the
 * log to both players unredacted.
 *
 * `duelistId` is always the player the event is about (who acted, whose
 * card moved, whose Mandate changed).
 */
export type DuelEventBody =
  | { kind: "turn-started"; duelistId: DuelistId; turn: number }
  | {
      kind: "actor-deployed";
      duelistId: DuelistId;
      // null when Set face-down.
      cardId: ActorCardId | null;
      stance: ActorStance;
      tributedCardId: ActorCardId | null;
    }
  | { kind: "stance-changed"; duelistId: DuelistId; cardId: ActorCardId; stance: ActorStance; flipped: boolean }
  | { kind: "card-set"; duelistId: DuelistId; category: "policy" | "scandal" }
  | {
      kind: "policy-activated";
      duelistId: DuelistId;
      cardId: PolicyCardId;
      // The Actor it was aimed at, if any (null if that Actor is face-down).
      targetCardId: ActorCardId | null;
    }
  // An Actor's own ability is about to resolve: on deploy, on flip, at
  // the start of its controller's turn, when it falls (is sent to the
  // Embassy), or a passive reacting to an ally falling.
  | {
      kind: "actor-effect";
      duelistId: DuelistId;
      cardId: ActorCardId;
      trigger: "deploy" | "flip" | "turn-start" | "fall" | "ally-fell";
    }
  | { kind: "scandal-triggered"; duelistId: DuelistId; cardId: ScandalCardId }
  | {
      kind: "attack-declared";
      duelistId: DuelistId;
      attackerCardId: ActorCardId;
      // null for a direct attack, or when the target is still face-down.
      targetCardId: ActorCardId | null;
      direct: boolean;
    }
  | {
      kind: "battle";
      duelistId: DuelistId;
      // Field instance ids (public -- positions are public) let a client
      // point its hit effects at the right cards.
      attackerInstanceId: number;
      attackerCardId: ActorCardId;
      attackerAtk: number;
      // null for a direct attack. `value` is the ATK (Campaign) or DEF
      // (Resistance) the attacker was compared against.
      target: { instanceId: number; cardId: ActorCardId; stance: ActorStance; value: number } | null;
      attackerDestroyed: boolean;
      defenderDestroyed: boolean;
      mandateDamage: number;
    }
  | { kind: "sent-to-embassy"; duelistId: DuelistId; cardId: CardId; reason: EmbassyReason }
  // Effect-driven Mandate changes (battle damage is in the battle event).
  | { kind: "mandate-changed"; duelistId: DuelistId; amount: number; mandate: number }
  | { kind: "cards-drawn"; duelistId: DuelistId; count: number }
  // A card taken from an Embassy into `duelistId`'s hand -- their own, or
  // (fromOpponent) their opponent's.
  | { kind: "returned-to-hand"; duelistId: DuelistId; cardId: CardId; fromOpponent: boolean }
  // An Actor revived from `duelistId`'s Embassy onto their field.
  | { kind: "returned-to-field"; duelistId: DuelistId; cardId: ActorCardId }
  | { kind: "card-discarded"; duelistId: DuelistId; cardId: CardId }
  | { kind: "votes-gained"; duelistId: DuelistId; amount: number; total: number }
  | { kind: "election-postponed"; duelistId: DuelistId; toTurn: number }
  | {
      kind: "election-held";
      // The leader (or duelist1 on a dead heat -- see leaderId).
      duelistId: DuelistId;
      round: "first" | "runoff";
      votes: Record<DuelistId, VoteCount>;
      leaderId: DuelistId | null;
    }
  | { kind: "runoff-called"; duelistId: DuelistId; untilTurn: number }
  | { kind: "duel-won"; duelistId: DuelistId; reason: WinReason };

/** A logged event: its body plus its 1-based position in the log. */
export type DuelEvent = DuelEventBody & { seq: number };

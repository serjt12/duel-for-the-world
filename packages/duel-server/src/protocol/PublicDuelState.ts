import type { CardId, Edition, PolicyCardId } from "@duel-for-the-world/duel-content";
import type { ActorFacing, ActorStance, DuelEvent, DuelistId, DuelPhase, VoteCount } from "@duel-for-the-world/duel-engine";

// A field Actor as shown to a particular viewer. A face-up Actor (either
// stance) reveals everything; a face-down Resistance-stance Actor hides
// its identity from anyone but its controller -- cardId is omitted
// entirely rather than sent and merely not rendered, so someone reading
// the raw WebSocket traffic in devtools still can't see it. For the same
// reason a hidden Actor carries no ATK/DEF (stats would narrow down which
// card it is). Equipped Policies stay visible on both: an Equip is played
// face-up, so both players already saw it happen.
export type PublicFieldActor =
  | {
      instanceId: number;
      cardId: CardId;
      controllerId: DuelistId;
      zone: number;
      stance: ActorStance;
      facing: ActorFacing;
      turnDeployed: number;
      hasAttackedThisTurn: boolean;
      hasChangedStanceThisTurn: boolean;
      // Effective stats, i.e. base card stats plus any Equip bonuses, as
      // computed by duel-engine's getEffectiveStats -- the same numbers
      // BattleSystem actually fights with. Sent precomputed so clients
      // never re-implement a rule.
      atk: number;
      def: number;
      equippedPolicyIds: PolicyCardId[];
    }
  | {
      instanceId: number;
      cardId: null;
      controllerId: DuelistId;
      zone: number;
      stance: "resistance";
      facing: "face-down";
      turnDeployed: number;
      hasAttackedThisTurn: boolean;
      hasChangedStanceThisTurn: boolean;
      equippedPolicyIds: PolicyCardId[];
    };

export interface PublicFieldScandal {
  instanceId: number;
  controllerId: DuelistId;
  zone: number;
  // Present only for the viewer's own Set Scandals; hidden for the
  // opponent's.
  cardId: CardId | null;
}

// A Policy in the Backroom: Set face-down, or a face-up Equip attached to
// an Actor -- which may be one of the OPPONENT's Actors (a hostile equip
// like Campaña de Desprestigio). While face-down its identity is hidden
// from the opponent (cardId null), exactly like a Set Scandal.
export interface PublicFieldPolicy {
  instanceId: number;
  controllerId: DuelistId;
  zone: number;
  faceDown: boolean;
  cardId: CardId | null;
  equippedToInstanceId: number | null;
}

export interface PublicDuelistView {
  id: DuelistId;
  mandate: number;
  deckCount: number;
  // Present only for the viewer's own hand; the opponent's hand is
  // redacted to a count only.
  hand: CardId[] | null;
  handCount: number;
  field: PublicFieldActor[];
  // La Embajada (the discard pile), oldest first. Public, like a
  // Yu-Gi-Oh graveyard.
  archive: CardId[];
  setScandals: PublicFieldScandal[];
  backroomPolicies: PublicFieldPolicy[];
  hasNormalDeployedThisTurn: boolean;
  hasSetScandalThisTurn: boolean;
}

// What actually goes out over the wire in a "state" message -- always
// shaped relative to one specific viewer, never the engine's full
// God's-eye-view DuelState. See protocol/redact.ts.
export interface PublicDuelState {
  turnNumber: number;
  activeDuelistId: DuelistId;
  phase: DuelPhase;
  winnerId: DuelistId | null;
  duelists: Record<DuelistId, PublicDuelistView>;
  // The most recent duel events, oldest first (see duel-engine's
  // DuelEvent; `seq` tells a client which ones it hasn't shown yet).
  log: DuelEvent[];
  // Election Night: votes are counted when turn `election.turn` ends.
  election: { turn: number; runoff: boolean };
  // The live poll: each duelist's votes if the election were held now
  // (duel-engine's countVotes -- public information).
  polls: Record<DuelistId, VoteCount>;
  // Who has asked for a rematch after the duel ended.
  rematchVotes: DuelistId[];
  // Which set this room plays (drives names and flavor text).
  edition: Edition;
}

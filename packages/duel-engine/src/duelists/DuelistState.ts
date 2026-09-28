import type { CardId } from "@duel-for-the-world/duel-content";
import type { FieldActor } from "../field/FieldActor";
import type { FieldPolicy } from "../field/FieldPolicy";
import type { FieldScandal } from "../field/FieldScandal";
import type { DuelistId } from "./DuelistId";

export interface DuelistState {
  id: DuelistId;
  mandate: number;
  // Draw pile, in draw order; index 0 is drawn next. This engine doesn't
  // shuffle -- that's a presentation-layer concern, so callers (and
  // tests) control ordering directly and deterministically.
  deck: CardId[];
  hand: CardId[];
  field: FieldActor[];
  // Where destroyed/used cards go (tributed Actors, resolved Normal
  // Policies, spent Scandals). Not yet surfaced by any system other than
  // DeploySystem's tribute handling -- Battle/Policy/Scandal resolution
  // will push here too once built.
  archive: CardId[];
  // Scandal cards Set face-down, waiting on their trigger condition.
  setScandals: FieldScandal[];
  // Policy cards in the Backroom: Set face-down, or face-up Equips
  // attached to an Actor. Shares the Backroom zones with setScandals.
  backroomPolicies: FieldPolicy[];
  hasNormalDeployedThisTurn: boolean;
  hasSetScandalThisTurn: boolean;
  // Votes gained from cards (Bot Farm, The Pollster...), counted on
  // Election Night on top of Mandate and campaign strength.
  bonusVotes: number;
}

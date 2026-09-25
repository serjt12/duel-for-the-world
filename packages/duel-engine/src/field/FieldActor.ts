import type { ActorCardId } from "@project-palacio/duel-content";
import type { DuelistId } from "../duelists/DuelistId";

// Campaign Stance is always face-up (you can't attack from face-down
// secrecy in this design); Resistance Stance may be face-up or
// face-down -- enforced by DeploySystem, not by this type.
export type ActorStance = "campaign" | "resistance";
export type ActorFacing = "face-up" | "face-down";

export interface FieldActor {
  instanceId: number;
  cardId: ActorCardId;
  controllerId: DuelistId;
  // Which of its controller's Actor zones (0..ACTOR_ZONE_COUNT-1) it sits
  // in. Unique per duelist; the card stays in this zone until it leaves
  // the field.
  zone: number;
  stance: ActorStance;
  facing: ActorFacing;
  // The turnNumber it was deployed on. An Actor can only attack once
  // turnNumber has moved past this -- i.e. not the same turn it was
  // deployed. This is a deliberate v1 design choice (not a claim about
  // any specific existing game's rule): it keeps the first playable
  // version simple to reason about and test, by ruling out same-turn
  // rush plays before there's any counterplay (Scandals, blockers) built
  // to answer them.
  turnDeployed: number;
  hasAttackedThisTurn: boolean;
  // Set by StanceSystem.changeStance; an Actor may change stance at most
  // once per turn. Reset for the newly active duelist at turn rollover.
  hasChangedStanceThisTurn: boolean;
  // (Equips attached to this Actor live in its controller's
  // backroomPolicies -- see FieldPolicy.equippedToInstanceId.)
}

import { ACTOR_CARDS, isActorCardId, POLICY_CARDS } from "@project-palacio/duel-content";
import type { DuelState } from "../duel/DuelState";
import { equipsOf } from "../field/backroom";
import type { FieldActor } from "../field/FieldActor";
import { activePassives, passiveOf } from "../field/passives";

export interface EffectiveStats {
  atk: number;
  def: number;
}

/**
 * A field Actor's current ATK/DEF: the card's base stats, plus
 * - the `whileEquipped` modifier of every face-up Equip attached to it
 *   (from either duelist's Backroom -- see equipsOf),
 * - "buff-others" passives of its controller's OTHER face-up Actors,
 * - its own "atk-per-embassy-actor" passive (per Actor in its
 *   controller's Embassy).
 * BattleSystem, votes and the client all use this, so every bonus is
 * reflected everywhere automatically. Stats never go below 0.
 */
export function getEffectiveStats(actor: FieldActor, state: DuelState): EffectiveStats {
  const base = ACTOR_CARDS[actor.cardId];
  let atk = base.atk;
  let def = base.def;

  for (const policyId of equipsOf(state, actor.instanceId)) {
    const policy = POLICY_CARDS[policyId];
    if (policy.kind === "equip") {
      atk += policy.whileEquipped.atk;
      def += policy.whileEquipped.def;
    }
  }

  const controller = state.duelists[actor.controllerId];
  for (const ally of controller.field) {
    if (ally.instanceId === actor.instanceId) continue;
    for (const passive of activePassives(ally)) {
      if (passive.kind === "buff-others") {
        atk += passive.atk;
        def += passive.def;
      }
    }
  }

  const perEmbassy = passiveOf(actor, "atk-per-embassy-actor");
  if (perEmbassy) {
    atk += perEmbassy.amount * controller.archive.filter((cardId) => isActorCardId(cardId)).length;
  }

  return { atk: Math.max(0, atk), def: Math.max(0, def) };
}

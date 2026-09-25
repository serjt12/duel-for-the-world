import type { DuelState } from "../duel/DuelState";
import { fireScandal } from "../effects/fireScandal";
import { resolveActorEffect } from "../effects/resolveInstantEffects";
import { changeMandate, logEvent } from "../events/log";
import { archiveActor } from "../field/archiveActor";
import type { FieldActor } from "../field/FieldActor";
import { RUNOFF_DAMAGE_MULTIPLIER } from "../config/DuelConfig";
import { getEffectiveStats } from "./EffectiveStats";

export type AttackFailureReason =
  | "wrong-phase"
  | "attacker-not-owned"
  | "attacker-not-in-campaign-stance"
  | "attacker-deployed-this-turn"
  | "attacker-already-attacked"
  | "target-not-owned-by-opponent"
  | "must-target-when-opponent-has-actors";

export interface AttackOutcome {
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  mandateDamage: number;
}

export type AttackResult =
  | { ok: true; outcome: AttackOutcome }
  | { ok: false; reason: AttackFailureReason };

/**
 * The Confrontation Phase action: one Actor in Campaign Stance attacks
 * either one of the opponent's Actors (by instanceId) or, when the
 * opponent controls none, the opponent's Mandate directly (omit
 * targetInstanceId). Battle math:
 *
 * - vs. a Campaign Stance target: higher ATK destroys the lower; the
 *   defending duelist takes Mandate damage equal to the difference only
 *   when THEIR Actor was the one destroyed (a losing attacker just dies
 *   -- no damage either way, to either duelist). A tie destroys both,
 *   no Mandate damage.
 * - vs. a Resistance Stance target: attacker's ATK vs. the target's DEF;
 *   whichever is lower is destroyed, but Resistance Stance never lets
 *   Mandate damage through, win or lose (a deliberate v1 simplification
 *   vs. real Yu-Gi-Oh's piercing-damage nuances). A face-down target is
 *   flipped face-up as part of being attacked, regardless of outcome. A
 *   tie destroys neither.
 * - No blockers (the opponent controls no Actors): the attack must go
 *   through as a direct attack (omit targetInstanceId) -- you can't
 *   choose to attack Mandate directly while the opponent still has an
 *   Actor to defend with. Full ATK becomes Mandate damage.
 *
 * Before any of that, the defender's Set Scandals listening for this
 * attack fire (see fireScandal). A face-down target that gets flipped
 * resolves its on-flip effect after the battle. Every step is logged.
 *
 * If this attack brings the defending duelist's Mandate to 0, the
 * attacking duelist wins immediately (changeMandate applies the rule).
 */
export function declareAttack(
  state: DuelState,
  attackerInstanceId: number,
  targetInstanceId?: number,
): AttackResult {
  if (state.phase !== "confrontation") {
    return { ok: false, reason: "wrong-phase" };
  }

  const attackingDuelist = state.duelists[state.activeDuelistId];
  const defendingDuelistId =
    state.activeDuelistId === "duelist1" ? "duelist2" : "duelist1";
  const defendingDuelist = state.duelists[defendingDuelistId];

  const attacker = attackingDuelist.field.find(
    (actor) => actor.instanceId === attackerInstanceId,
  );

  if (!attacker) {
    return { ok: false, reason: "attacker-not-owned" };
  }

  if (attacker.stance !== "campaign") {
    return { ok: false, reason: "attacker-not-in-campaign-stance" };
  }

  if (attacker.turnDeployed === state.turnNumber) {
    return { ok: false, reason: "attacker-deployed-this-turn" };
  }

  if (attacker.hasAttackedThisTurn) {
    return { ok: false, reason: "attacker-already-attacked" };
  }

  let target: FieldActor | undefined;

  if (targetInstanceId !== undefined) {
    target = defendingDuelist.field.find(
      (actor) => actor.instanceId === targetInstanceId,
    );

    if (!target) {
      return { ok: false, reason: "target-not-owned-by-opponent" };
    }
  } else if (defendingDuelist.field.length > 0) {
    return { ok: false, reason: "must-target-when-opponent-has-actors" };
  }

  attacker.hasAttackedThisTurn = true;

  logEvent(state, {
    kind: "attack-declared",
    duelistId: attackingDuelist.id,
    attackerCardId: attacker.cardId,
    // A face-down target isn't named until the battle flips it.
    targetCardId: target && target.facing === "face-up" ? target.cardId : null,
    direct: !target,
  });

  // The defender's Set Scandals lying in wait for this attack (e.g.
  // Escandalo de Corrupcion when an Actor is targeted, Chuzadas on a
  // direct attack) fire first, before any damage.
  fireScandal(state, defendingDuelistId, target ? "attack-on-your-actor" : "direct-attack-on-you", {
    attackerInstanceId: attacker.instanceId,
  });

  // A Scandal that removed the attacker (or decided the duel) ends the
  // attack outright; one that didn't (e.g. a Mandate penalty) lets the
  // battle go ahead.
  if (!attackingDuelist.field.includes(attacker) || state.winnerId) {
    return {
      ok: true,
      outcome: {
        attackerDestroyed: !attackingDuelist.field.includes(attacker),
        defenderDestroyed: false,
        mandateDamage: 0,
      },
    };
  }

  const attackerStats = getEffectiveStats(attacker, state);
  const outcome: AttackOutcome = {
    attackerDestroyed: false,
    defenderDestroyed: false,
    mandateDamage: 0,
  };
  const targetWasFaceDown = target?.facing === "face-down";
  let comparedValue = 0;

  if (!target) {
    outcome.mandateDamage = attackerStats.atk;
  } else if (target.stance === "campaign") {
    const targetStats = getEffectiveStats(target, state);
    comparedValue = targetStats.atk;

    if (attackerStats.atk > targetStats.atk) {
      outcome.defenderDestroyed = true;
      outcome.mandateDamage = attackerStats.atk - targetStats.atk;
    } else if (attackerStats.atk < targetStats.atk) {
      outcome.attackerDestroyed = true;
    } else {
      outcome.attackerDestroyed = true;
      outcome.defenderDestroyed = true;
    }
  } else {
    // Resistance Stance target: flips face-up as part of being attacked,
    // whatever the outcome.
    target.facing = "face-up";

    const targetStats = getEffectiveStats(target, state);
    comparedValue = targetStats.def;

    if (attackerStats.atk > targetStats.def) {
      outcome.defenderDestroyed = true;
    } else if (attackerStats.atk < targetStats.def) {
      outcome.attackerDestroyed = true;
    }
    // Equal ATK/DEF: neither destroyed, no further effect.
  }

  // Segunda vuelta: everything is at stake -- battle damage to Mandate is
  // multiplied during a runoff.
  if (state.election.runoff) {
    outcome.mandateDamage *= RUNOFF_DAMAGE_MULTIPLIER;
  }

  // Log the battle before its consequences, so the report reads in order:
  // who fought whom, then who went to La Embajada.
  logEvent(state, {
    kind: "battle",
    duelistId: attackingDuelist.id,
    attackerInstanceId: attacker.instanceId,
    attackerCardId: attacker.cardId,
    attackerAtk: attackerStats.atk,
    target: target
      ? { instanceId: target.instanceId, cardId: target.cardId, stance: target.stance, value: comparedValue }
      : null,
    attackerDestroyed: outcome.attackerDestroyed,
    defenderDestroyed: outcome.defenderDestroyed,
    mandateDamage: outcome.mandateDamage,
  });

  if (outcome.attackerDestroyed) {
    archiveActor(state, attacker.instanceId, "battle");
  }
  if (target && outcome.defenderDestroyed) {
    archiveActor(state, target.instanceId, "battle");
  }
  // Scandals answering a battle loss (e.g. Martyrdom), for each side.
  if (outcome.attackerDestroyed && !state.winnerId) {
    fireScandal(state, attackingDuelist.id, "your-actor-destroyed-in-battle", { destroyedCardId: attacker.cardId });
  }
  if (target && outcome.defenderDestroyed && !state.winnerId) {
    fireScandal(state, defendingDuelistId, "your-actor-destroyed-in-battle", { destroyedCardId: target.cardId });
  }

  if (outcome.mandateDamage > 0) {
    changeMandate(state, defendingDuelistId, -outcome.mandateDamage, false);
  }

  // A face-down target that the attack flipped face-up gets its on-flip
  // effect -- even if it was destroyed (like a Yu-Gi-Oh flip effect).
  if (target && targetWasFaceDown) {
    resolveActorEffect(state, target, "flip");
  }

  return { ok: true, outcome };
}


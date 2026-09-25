import type { DuelState } from "../duel/DuelState";
import { resolveActorEffect } from "../effects/resolveInstantEffects";
import { logEvent } from "../events/log";
import { cardHasPassive } from "../field/passives";

export type ChangeStanceFailureReason =
  | "wrong-phase"
  | "actor-not-owned"
  | "deployed-this-turn"
  | "attacked-this-turn"
  | "already-changed-stance"
  // This Actor can't be in Resistance (e.g. The Generalissimo).
  | "campaign-only";

export type ChangeStanceResult =
  | { ok: true }
  | { ok: false; reason: ChangeStanceFailureReason };

/**
 * Switches one of the active duelist's Actors between Campaign and
 * Resistance Stance -- this game's version of Yu-Gi-Oh's "change battle
 * position":
 *
 * - Campaign (face-up) -> Resistance, face-up. You can't go from face-up
 *   back to face-down; secrecy is only available when first Setting.
 * - Resistance (face-up OR face-down) -> Campaign, face-up. Flipping a
 *   face-down Actor this way reveals it to the opponent.
 *
 * Legal only in either Campaign Phase, at most once per Actor per turn,
 * and never on an Actor that was deployed this turn or that has already
 * attacked this turn. Unlike the Normal Deploy it has no per-duelist
 * budget: every eligible Actor may change once.
 *
 * Flipping a face-down Actor this way resolves its on-flip effect.
 *
 * Changing to Campaign in Campaign Phase 1 lets that Actor attack in the
 * Confrontation Phase that follows (it wasn't deployed this turn, so the
 * summoning-sickness rule doesn't apply).
 */
export function changeStance(
  state: DuelState,
  actorInstanceId: number,
  // For an on-flip effect that picks a card from an Embassy.
  options: { embassyPick?: number } = {},
): ChangeStanceResult {
  if (state.phase !== "campaign-1" && state.phase !== "campaign-2") {
    return { ok: false, reason: "wrong-phase" };
  }

  const duelist = state.duelists[state.activeDuelistId];
  // Array.find with === on an untrusted value is safe: a non-number simply
  // matches nothing.
  const actor = duelist.field.find((a) => a.instanceId === actorInstanceId);

  if (!actor) {
    return { ok: false, reason: "actor-not-owned" };
  }

  if (actor.turnDeployed === state.turnNumber) {
    return { ok: false, reason: "deployed-this-turn" };
  }

  if (actor.hasAttackedThisTurn) {
    return { ok: false, reason: "attacked-this-turn" };
  }

  if (actor.hasChangedStanceThisTurn) {
    return { ok: false, reason: "already-changed-stance" };
  }

  if (actor.stance === "campaign" && cardHasPassive(actor, "campaign-only")) {
    return { ok: false, reason: "campaign-only" };
  }

  const flipped = actor.facing === "face-down";
  actor.stance = actor.stance === "campaign" ? "resistance" : "campaign";
  actor.facing = "face-up";
  actor.hasChangedStanceThisTurn = true;

  logEvent(state, {
    kind: "stance-changed",
    duelistId: duelist.id,
    cardId: actor.cardId,
    stance: actor.stance,
    flipped,
  });

  // Flipping face-up this way triggers its on-flip effect, if any.
  if (flipped) {
    resolveActorEffect(state, actor, "flip", { embassyPick: typeof options === "object" && options ? options.embassyPick : undefined });
  }

  return { ok: true };
}

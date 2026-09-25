import { ACTOR_CARDS, isActorCardId } from "@project-palacio/duel-content";
import type { ActorCardId } from "@project-palacio/duel-content";
import type { DuelState } from "../duel/DuelState";
import { ACTOR_ZONE_COUNT } from "../config/DuelConfig";
import { resolveActorEffect } from "../effects/resolveInstantEffects";
import { fireScandal } from "../effects/fireScandal";
import { logEvent, otherDuelist } from "../events/log";
import { archiveActor } from "../field/archiveActor";
import { firstFreeZone, isValidZone } from "../field/zones";
import type { ActorFacing, ActorStance, FieldActor } from "../field/FieldActor";

export interface DeployOptions {
  stance: ActorStance;
  facing: ActorFacing;
  // Required (and validated) iff the card's tier is "establishment";
  // ignored for "grassroots" cards.
  tributeInstanceId?: number;
  // Which Actor zone to deploy into. Optional: defaults to the tributed
  // Actor's zone when tributing, otherwise the first free zone. A
  // tributed Actor's zone counts as free.
  zone?: number;
  // For an on-deploy effect that picks a card from an Embassy: the index
  // picked (see resolveInstantEffects' EffectContext.embassyPick).
  embassyPick?: number;
}

export type DeployFailureReason =
  | "wrong-phase"
  | "not-an-actor"
  | "invalid-stance-or-facing"
  | "already-deployed-this-turn"
  | "card-not-in-hand"
  | "invalid-facing-for-stance"
  | "tribute-required"
  | "tribute-not-owned"
  | "invalid-zone"
  | "zone-occupied"
  | "field-full"
  // There's already a Leader in office (only one at a time).
  | "leader-already-in-office"
  // This Actor can't be in Resistance.
  | "campaign-only";

export type DeployResult =
  | { ok: true }
  | { ok: false; reason: DeployFailureReason };

/**
 * The one-Normal-Deploy-per-turn action: play a Grassroots Actor from
 * hand freely, or tribute one Actor you control to play an Establishment
 * Actor. Only legal during either Campaign Phase, and only once per
 * turn regardless of which Campaign Phase it's used in (the budget is
 * shared between Campaign Phase 1 and 2, not one-each).
 */
export function deployActor(
  state: DuelState,
  actorCardId: ActorCardId,
  options: DeployOptions,
): DeployResult {
  if (state.phase !== "campaign-1" && state.phase !== "campaign-2") {
    return { ok: false, reason: "wrong-phase" };
  }

  // Inputs can come from an untrusted client: reject anything that isn't
  // actually an Actor card or a real stance/facing, rather than letting a
  // bad value throw below or get written into the duel state.
  if (!isActorCardId(actorCardId)) {
    return { ok: false, reason: "not-an-actor" };
  }

  if (
    typeof options !== "object" ||
    options === null ||
    (options.stance !== "campaign" && options.stance !== "resistance") ||
    (options.facing !== "face-up" && options.facing !== "face-down")
  ) {
    return { ok: false, reason: "invalid-stance-or-facing" };
  }

  const duelist = state.duelists[state.activeDuelistId];

  if (duelist.hasNormalDeployedThisTurn) {
    return { ok: false, reason: "already-deployed-this-turn" };
  }

  const handIndex = duelist.hand.indexOf(actorCardId);

  if (handIndex === -1) {
    return { ok: false, reason: "card-not-in-hand" };
  }

  if (options.stance === "campaign" && options.facing === "face-down") {
    return { ok: false, reason: "invalid-facing-for-stance" };
  }

  const card = ACTOR_CARDS[actorCardId];
  let tribute: FieldActor | undefined;

  if (options.stance === "resistance" && card.passives?.some((passive) => passive.kind === "campaign-only")) {
    return { ok: false, reason: "campaign-only" };
  }

  // Establishment and Leaders both cost a tribute.
  if (card.tier !== "grassroots") {
    if (options.tributeInstanceId === undefined) {
      return { ok: false, reason: "tribute-required" };
    }

    tribute = duelist.field.find(
      (actor) => actor.instanceId === options.tributeInstanceId,
    );

    if (!tribute) {
      return { ok: false, reason: "tribute-not-owned" };
    }
  }

  // Only one Leader in office: another Leader must be the one tributed.
  if (
    card.tier === "leader" &&
    duelist.field.some((actor) => actor !== tribute && ACTOR_CARDS[actor.cardId].tier === "leader")
  ) {
    return { ok: false, reason: "leader-already-in-office" };
  }

  // Pick and validate the zone BEFORE changing anything, so a rejected
  // deploy never leaves a half-applied tribute behind.
  const occupiedZones = duelist.field
    .filter((actor) => actor !== tribute)
    .map((actor) => actor.zone);
  let zone: number;

  if (options.zone === undefined) {
    const defaultZone = tribute ? tribute.zone : firstFreeZone(occupiedZones, ACTOR_ZONE_COUNT);
    if (defaultZone === null) {
      return { ok: false, reason: "field-full" };
    }
    zone = defaultZone;
  } else {
    if (!isValidZone(options.zone, ACTOR_ZONE_COUNT)) {
      return { ok: false, reason: "invalid-zone" };
    }
    if (occupiedZones.includes(options.zone)) {
      return { ok: false, reason: "zone-occupied" };
    }
    zone = options.zone;
  }

  if (tribute) {
    archiveActor(state, tribute.instanceId, "tribute");
  }

  // Remove exactly the one copy found above -- splice by index, not a
  // value filter, since a hand can legally hold multiple copies of the
  // same card (up to the deck's max-copies rule) and only one should
  // leave the hand per deploy.
  duelist.hand.splice(handIndex, 1);

  const deployed: FieldActor = {
    instanceId: state.nextInstanceId,
    cardId: actorCardId,
    controllerId: duelist.id,
    zone,
    stance: options.stance,
    facing: options.facing,
    turnDeployed: state.turnNumber,
    hasAttackedThisTurn: false,
    hasChangedStanceThisTurn: false,
  };
  duelist.field.push(deployed);
  state.nextInstanceId += 1;

  duelist.hasNormalDeployedThisTurn = true;

  const faceUp = options.facing === "face-up";
  logEvent(state, {
    kind: "actor-deployed",
    duelistId: duelist.id,
    // A face-down Set stays secret -- the log never names it.
    cardId: faceUp ? actorCardId : null,
    stance: options.stance,
    tributedCardId: tribute ? tribute.cardId : null,
  });

  if (faceUp) {
    // The opponent's Scandals get the first word (e.g. Mocion de Censura
    // sends an Establishment Actor away before its own effect resolves).
    if (card.tier !== "grassroots") {
      fireScandal(state, otherDuelist(duelist.id), "opponent-deploys-establishment", {
        deployedInstanceId: deployed.instanceId,
      });
    }
    if (duelist.field.includes(deployed)) {
      resolveActorEffect(state, deployed, "deploy", { embassyPick: options.embassyPick });
    }
  }

  return { ok: true };
}

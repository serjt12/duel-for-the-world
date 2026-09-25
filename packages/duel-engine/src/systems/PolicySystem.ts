import { isPolicyCardId, POLICY_CARDS } from "@project-palacio/duel-content";
import type { ActorTarget, PolicyCardDefinition, PolicyCardId } from "@project-palacio/duel-content";
import type { DuelState } from "../duel/DuelState";
import type { DuelistState } from "../duelists/DuelistState";
import { canRetrieve, resolveInstantEffects } from "../effects/resolveInstantEffects";
import { logEvent, otherDuelist } from "../events/log";
import { fireScandal } from "../effects/fireScandal";
import { pickBackroomZone } from "../field/backroom";
import { hasPassive } from "../field/passives";
import { getEffectiveStats } from "./EffectiveStats";
import type { FieldActor } from "../field/FieldActor";
import type { FieldPolicy } from "../field/FieldPolicy";

// Policies work like spell cards: from hand they can be activated right
// away, or Set face-down in a Backroom zone and activated later.
//
// - "normal" kind (e.g. Decreto de Emergencia): resolves its onActivate
//   effects, then goes to La Embajada. A targeted one (Nombramiento
//   Diplomatico) needs an opposing Actor picked on activation.
// - "equip" kind (e.g. Maletin de Sobornos): needs an Actor as a target
//   -- one of yours, or for a hostile equip (Campaña de Desprestigio) one
//   of your opponent's -- then stays face-up in its controller's Backroom
//   zone, attached to that Actor (see FieldPolicy). There's no detach
//   mechanic yet; it leaves with the Actor.

export type PolicyFailureReason =
  | "wrong-phase"
  | "not-a-policy"
  | "card-not-in-hand"
  | "target-required"
  // The card needs one of YOUR Actors and the target isn't one.
  | "target-not-owned"
  // The card needs one of your OPPONENT's Actors and the target isn't one.
  | "target-not-opposing"
  // The opposing target can't be targeted by effects (immune).
  | "target-immune"
  // The opposing target's ATK is above the card's limit.
  | "target-too-strong"
  | "invalid-zone"
  | "zone-occupied"
  | "backroom-full"
  | "set-policy-not-found"
  // Its Embassy retrieval would find nothing (or nowhere to revive to).
  | "nothing-to-retrieve";

export interface PolicyActivationOptions {
  // Required for Equips and targeted Normal Policies: the Actor to point
  // the card at (whose side depends on the card). Ignored otherwise.
  targetInstanceId?: number;
  // Equip activated from hand: which Backroom zone it occupies (defaults
  // to the first free one). Ignored for "normal" kind, which doesn't stay.
  zone?: number;
  // For an effect that picks a card from an Embassy: the index picked.
  embassyPick?: number;
}

export type PolicyResult = { ok: true } | { ok: false; reason: PolicyFailureReason };

type TargetCheck = { ok: true; target: FieldActor | null } | { ok: false; reason: PolicyFailureReason };

function isCampaignPhase(state: DuelState): boolean {
  return state.phase === "campaign-1" || state.phase === "campaign-2";
}

/** Which Actor (side) a Policy card must be pointed at, if any. */
export function policyTarget(card: PolicyCardDefinition): ActorTarget | null {
  if (card.kind === "equip") {
    return card.attachTo;
  }
  return card.target ?? null;
}

function checkTarget(
  state: DuelState,
  duelist: DuelistState,
  card: PolicyCardDefinition,
  options: PolicyActivationOptions,
): TargetCheck {
  const side = policyTarget(card);
  if (side === null) {
    return { ok: true, target: null };
  }
  if (typeof options !== "object" || options === null || options.targetInstanceId === undefined) {
    return { ok: false, reason: "target-required" };
  }
  const pool = side === "your-actor" ? duelist.field : state.duelists[otherDuelist(duelist.id)].field;
  const target = pool.find((actor) => actor.instanceId === options.targetInstanceId);
  if (!target) {
    return { ok: false, reason: side === "your-actor" ? "target-not-owned" : "target-not-opposing" };
  }
  if (side === "opponent-actor" && hasPassive(target, "immune-to-effects")) {
    return { ok: false, reason: "target-immune" };
  }
  if (card.kind === "normal" && card.targetMaxAtk !== undefined && getEffectiveStats(target, state).atk > card.targetMaxAtk) {
    return { ok: false, reason: "target-too-strong" };
  }
  return { ok: true, target };
}

// A Normal Policy that retrieves from an Embassy needs something there.
function retrievalFizzles(state: DuelState, duelist: DuelistState, card: PolicyCardDefinition): boolean {
  if (card.kind !== "normal") return false;
  return card.onActivate.some(
    (effect) => effect.kind === "retrieve-from-embassy" && !canRetrieve(state, duelist.id, effect),
  );
}

function logActivation(state: DuelState, duelist: DuelistState, cardId: PolicyCardId, target: FieldActor | null): void {
  logEvent(state, {
    kind: "policy-activated",
    duelistId: duelist.id,
    cardId,
    targetCardId: target && target.facing === "face-up" ? target.cardId : null,
  });
}

/**
 * Resolves a Policy that has already left the hand (or its Set zone): an
 * Equip attaches (the caller supplies the FieldPolicy it becomes), a
 * Normal Policy resolves and goes to La Embajada.
 */
function resolvePolicy(
  state: DuelState,
  duelist: DuelistState,
  cardId: PolicyCardId,
  target: FieldActor | null,
  options: PolicyActivationOptions,
): void {
  const card = POLICY_CARDS[cardId];
  logActivation(state, duelist, cardId, target);
  if (card.kind === "normal") {
    resolveInstantEffects(state, duelist.id, card.onActivate, {
      targetInstanceId: target?.instanceId,
      embassyPick: typeof options === "object" && options !== null ? options.embassyPick : undefined,
    });
    duelist.archive.push(cardId);
  }
  // The opponent's Scandals may answer (e.g. Paper Trail).
  if (!state.winnerId) {
    fireScandal(state, otherDuelist(duelist.id), "opponent-activates-policy", {});
  }
}

/** Activates a Policy straight from hand. */
export function activatePolicy(
  state: DuelState,
  policyCardId: PolicyCardId,
  options: PolicyActivationOptions = {},
): PolicyResult {
  if (!isCampaignPhase(state)) {
    return { ok: false, reason: "wrong-phase" };
  }
  if (!isPolicyCardId(policyCardId)) {
    return { ok: false, reason: "not-a-policy" };
  }

  const duelist = state.duelists[state.activeDuelistId];
  const handIndex = duelist.hand.indexOf(policyCardId);

  if (handIndex === -1) {
    return { ok: false, reason: "card-not-in-hand" };
  }

  const card = POLICY_CARDS[policyCardId];
  const targetCheck = checkTarget(state, duelist, card, options);
  if (!targetCheck.ok) {
    return targetCheck;
  }
  if (retrievalFizzles(state, duelist, card)) {
    return { ok: false, reason: "nothing-to-retrieve" };
  }

  if (card.kind === "equip") {
    const picked = pickBackroomZone(duelist, options.zone);
    if (!picked.ok) {
      return { ok: false, reason: picked.reason };
    }

    duelist.hand.splice(handIndex, 1);
    duelist.backroomPolicies.push({
      instanceId: state.nextInstanceId,
      cardId: policyCardId,
      controllerId: duelist.id,
      zone: picked.zone,
      faceDown: false,
      equippedToInstanceId: (targetCheck.target as FieldActor).instanceId,
    });
    state.nextInstanceId += 1;
    resolvePolicy(state, duelist, policyCardId, targetCheck.target, options);
    return { ok: true };
  }

  duelist.hand.splice(handIndex, 1);
  resolvePolicy(state, duelist, policyCardId, targetCheck.target, options);
  return { ok: true };
}

/**
 * Sets a Policy face-down in a Backroom zone (defaults to the first free
 * one), to be activated later with activateSetPolicy. Unlike Scandals,
 * there's no once-per-turn limit -- only free zones limit it.
 */
export function setPolicy(state: DuelState, policyCardId: PolicyCardId, zone?: number): PolicyResult {
  if (!isCampaignPhase(state)) {
    return { ok: false, reason: "wrong-phase" };
  }
  if (!isPolicyCardId(policyCardId)) {
    return { ok: false, reason: "not-a-policy" };
  }

  const duelist = state.duelists[state.activeDuelistId];
  const handIndex = duelist.hand.indexOf(policyCardId);

  if (handIndex === -1) {
    return { ok: false, reason: "card-not-in-hand" };
  }

  const picked = pickBackroomZone(duelist, zone);
  if (!picked.ok) {
    return { ok: false, reason: picked.reason };
  }

  duelist.hand.splice(handIndex, 1);
  duelist.backroomPolicies.push({
    instanceId: state.nextInstanceId,
    cardId: policyCardId,
    controllerId: duelist.id,
    zone: picked.zone,
    faceDown: true,
    equippedToInstanceId: null,
  });
  state.nextInstanceId += 1;
  logEvent(state, { kind: "card-set", duelistId: duelist.id, category: "policy" });
  return { ok: true };
}

/**
 * Activates one of your face-down Set Policies (by its field instanceId).
 * A Normal Policy resolves and leaves its zone for La Embajada; an Equip
 * flips face-up in place, attached to the chosen Actor.
 */
export function activateSetPolicy(
  state: DuelState,
  instanceId: number,
  options: PolicyActivationOptions = {},
): PolicyResult {
  if (!isCampaignPhase(state)) {
    return { ok: false, reason: "wrong-phase" };
  }

  const duelist = state.duelists[state.activeDuelistId];
  const setCard: FieldPolicy | undefined = duelist.backroomPolicies.find(
    (policy) => policy.instanceId === instanceId && policy.faceDown,
  );

  if (!setCard) {
    return { ok: false, reason: "set-policy-not-found" };
  }

  const card = POLICY_CARDS[setCard.cardId];
  const targetCheck = checkTarget(state, duelist, card, options);
  if (!targetCheck.ok) {
    return targetCheck;
  }
  if (retrievalFizzles(state, duelist, card)) {
    return { ok: false, reason: "nothing-to-retrieve" };
  }

  if (card.kind === "equip") {
    setCard.faceDown = false;
    setCard.equippedToInstanceId = (targetCheck.target as FieldActor).instanceId;
    resolvePolicy(state, duelist, setCard.cardId, targetCheck.target, options);
    return { ok: true };
  }

  duelist.backroomPolicies = duelist.backroomPolicies.filter((policy) => policy !== setCard);
  resolvePolicy(state, duelist, setCard.cardId, targetCheck.target, options);
  return { ok: true };
}

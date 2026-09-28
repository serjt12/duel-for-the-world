import { ACTOR_CARDS, isActorCardId, matchesFilter } from "@duel-for-the-world/duel-content";
import type { CardFilter, InstantEffect } from "@duel-for-the-world/duel-content";
import { ACTOR_ZONE_COUNT } from "../config/DuelConfig";
import type { DuelistId } from "../duelists/DuelistId";
import type { DuelState } from "../duel/DuelState";
import { changeMandate, logEvent, otherDuelist } from "../events/log";
import { archiveActor } from "../field/archiveActor";
import type { FieldActor } from "../field/FieldActor";
import { hasPassive } from "../field/passives";
import { firstFreeZone } from "../field/zones";

function assertNever(value: never): never {
  throw new Error(`Unhandled instant effect: ${JSON.stringify(value)}`);
}

export interface EffectContext {
  // The Actor a targeted card was pointed at (validated by the caller).
  targetInstanceId?: number;
  // The player's pick for an Embassy retrieval: an index into the Embassy
  // (archive) the effect reads from. Invalid or missing picks fall back
  // to the most recent matching card.
  embassyPick?: number;
  // An Embassy index the effect must skip (a card retrieving "another"
  // Actor mustn't pick itself).
  excludeEmbassyIndex?: number;
}

/**
 * The Embassy indices an effect may pick from, oldest first. Exported so
 * the rules and any UI agree on what's eligible.
 */
export function eligibleEmbassyIndices(archive: readonly string[], filter: CardFilter, exclude?: number): number[] {
  const indices: number[] = [];
  archive.forEach((cardId, index) => {
    if (index !== exclude && matchesFilter(cardId as never, filter)) indices.push(index);
  });
  return indices;
}

/**
 * Whether a retrieval effect would find something to bring back right
 * now (a matching card, and -- for a revive -- a free Actor zone). A
 * Policy whose retrieval would fizzle can't be activated, so a player
 * never throws one away by accident.
 */
export function canRetrieve(
  state: DuelState,
  controllerId: DuelistId,
  effect: Extract<InstantEffect, { kind: "retrieve-from-embassy" }>,
): boolean {
  const sourceId = effect.from === "yours" ? controllerId : otherDuelist(controllerId);
  if (eligibleEmbassyIndices(state.duelists[sourceId].archive, effect.filter).length === 0) return false;
  if (effect.to === "field") {
    return firstFreeZone(state.duelists[controllerId].field.map((actor) => actor.zone), ACTOR_ZONE_COUNT) !== null;
  }
  return true;
}

/**
 * Resolves a card's instant effects, in order, on behalf of `controllerId`
 * (the player who played the card). The one implementation of every
 * InstantEffect kind -- cards only ever *describe* effects (duel-content's
 * Effects.ts); this is where they happen.
 *
 * Stops early if an effect ends the duel: nothing resolves after a winner
 * is decided.
 */
export function resolveInstantEffects(
  state: DuelState,
  controllerId: DuelistId,
  effects: readonly InstantEffect[],
  context: EffectContext = {},
): void {
  for (const effect of effects) {
    if (state.winnerId) {
      return;
    }

    switch (effect.kind) {
      case "change-mandate": {
        // Same floor and win rule as battle damage: Mandate bottoms out at
        // 0, and whoever is brought to 0 loses -- even by their own card.
        const recipientId = effect.recipient === "you" ? controllerId : otherDuelist(controllerId);
        changeMandate(state, recipientId, effect.amount);
        break;
      }
      case "draw-cards": {
        const recipientId = effect.recipient === "you" ? controllerId : otherDuelist(controllerId);
        const recipient = state.duelists[recipientId];
        // An effect draw never decks a player out: it just stops early.
        const drawn = recipient.deck.splice(0, Math.min(effect.count, recipient.deck.length));
        recipient.hand.push(...drawn);
        if (drawn.length > 0) {
          logEvent(state, { kind: "cards-drawn", duelistId: recipientId, count: drawn.length });
        }
        break;
      }
      case "send-target-to-embassy": {
        if (context.targetInstanceId === undefined) break;
        const target = [...state.duelists.duelist1.field, ...state.duelists.duelist2.field].find(
          (actor) => actor.instanceId === context.targetInstanceId,
        );
        // An immune Actor can't be removed by an opposing effect.
        if (target && !(target.controllerId !== controllerId && hasPassive(target, "immune-to-effects"))) {
          archiveActor(state, target.instanceId, "effect");
        }
        break;
      }
      case "retrieve-from-embassy":
        retrieveFromEmbassy(state, controllerId, effect, context);
        break;
      case "gain-votes": {
        const duelist = state.duelists[controllerId];
        duelist.bonusVotes += effect.amount;
        logEvent(state, { kind: "votes-gained", duelistId: controllerId, amount: effect.amount, total: duelist.bonusVotes });
        break;
      }
      case "discard-oldest": {
        const duelist = state.duelists[controllerId];
        for (let i = 0; i < effect.count && duelist.hand.length > 0; i += 1) {
          const [cardId] = duelist.hand.splice(0, 1);
          duelist.archive.push(cardId);
          logEvent(state, { kind: "card-discarded", duelistId: controllerId, cardId });
        }
        break;
      }
      case "postpone-election":
        // Only before the first count: a runoff can't be postponed.
        if (!state.election.runoff) {
          state.election.turn += effect.turns;
          logEvent(state, { kind: "election-postponed", duelistId: controllerId, toTurn: state.election.turn });
        }
        break;
      default:
        assertNever(effect);
    }
  }
}

function retrieveFromEmbassy(
  state: DuelState,
  controllerId: DuelistId,
  effect: Extract<InstantEffect, { kind: "retrieve-from-embassy" }>,
  context: EffectContext,
): void {
  const controller = state.duelists[controllerId];
  const sourceId = effect.from === "yours" ? controllerId : otherDuelist(controllerId);
  const source = state.duelists[sourceId];
  const exclude = effect.from === "yours" ? context.excludeEmbassyIndex : undefined;
  const eligible = eligibleEmbassyIndices(source.archive, effect.filter, exclude);
  if (eligible.length === 0) return;

  const index =
    context.embassyPick !== undefined && eligible.includes(context.embassyPick)
      ? context.embassyPick
      : eligible[eligible.length - 1];
  const cardId = source.archive[index];

  if (effect.to === "field") {
    // Revive: back onto the field face-up in Resistance, if there's room.
    if (!isActorCardId(cardId)) return;
    const zone = firstFreeZone(
      controller.field.map((actor) => actor.zone),
      ACTOR_ZONE_COUNT,
    );
    if (zone === null) return;
    source.archive.splice(index, 1);
    controller.field.push({
      instanceId: state.nextInstanceId,
      cardId,
      controllerId,
      zone,
      stance: ACTOR_CARDS[cardId].passives?.some((passive) => passive.kind === "campaign-only") ? "campaign" : "resistance",
      facing: "face-up",
      turnDeployed: state.turnNumber,
      hasAttackedThisTurn: false,
      hasChangedStanceThisTurn: false,
    });
    state.nextInstanceId += 1;
    logEvent(state, { kind: "returned-to-field", duelistId: controllerId, cardId });
    return;
  }

  source.archive.splice(index, 1);
  controller.hand.push(cardId);
  logEvent(state, { kind: "returned-to-hand", duelistId: controllerId, cardId, fromOpponent: sourceId !== controllerId });
}

type ActorTrigger = "deploy" | "flip" | "turn-start" | "fall";

/**
 * Resolves one of an Actor's own triggered abilities (if its card has
 * it), on behalf of its controller.
 */
export function resolveActorEffect(
  state: DuelState,
  actor: FieldActor,
  trigger: ActorTrigger,
  context: EffectContext = {},
): void {
  const card = ACTOR_CARDS[actor.cardId];
  const effects =
    trigger === "deploy"
      ? card.onDeploy
      : trigger === "flip"
        ? card.onFlip
        : trigger === "turn-start"
          ? card.onTurnStart
          : card.onSentToEmbassy;
  if (!effects || effects.length === 0 || state.winnerId) {
    return;
  }
  logEvent(state, { kind: "actor-effect", duelistId: actor.controllerId, cardId: actor.cardId, trigger });
  resolveInstantEffects(state, actor.controllerId, effects, context);
}

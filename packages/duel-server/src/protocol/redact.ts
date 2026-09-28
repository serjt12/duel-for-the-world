import type { Edition } from "@duel-for-the-world/duel-content";
import { countVotes, equipsOf, getEffectiveStats, hasPassive } from "@duel-for-the-world/duel-engine";
import type { DuelistId, DuelState, FieldActor } from "@duel-for-the-world/duel-engine";
import type {
  PublicDuelistView,
  PublicDuelState,
  PublicFieldActor,
} from "./PublicDuelState";

// How many of the most recent log events each state message carries --
// plenty for "what just happened" plus a short history.
export const LOG_EVENTS_SENT = 40;

function otherDuelist(id: DuelistId): DuelistId {
  return id === "duelist1" ? "duelist2" : "duelist1";
}

// Does the viewer see through their opponent's face-down cards (a
// face-up Actor with "reveal-opponent-hidden", e.g. The Algorithm
// Chairman)?
function viewerSeesHidden(state: DuelState, viewer: DuelistId): boolean {
  return state.duelists[viewer].field.some((actor) => hasPassive(actor, "reveal-opponent-hidden"));
}

function redactActor(actor: FieldActor, state: DuelState, viewer: DuelistId, seesHidden: boolean): PublicFieldActor {
  const hidden = actor.facing === "face-down" && actor.controllerId !== viewer && !seesHidden;

  if (hidden) {
    return {
      instanceId: actor.instanceId,
      cardId: null,
      controllerId: actor.controllerId,
      zone: actor.zone,
      stance: "resistance",
      facing: "face-down",
      turnDeployed: actor.turnDeployed,
      hasAttackedThisTurn: actor.hasAttackedThisTurn,
      hasChangedStanceThisTurn: actor.hasChangedStanceThisTurn,
      equippedPolicyIds: equipsOf(state, actor.instanceId),
    };
  }

  const stats = getEffectiveStats(actor, state);
  return {
    instanceId: actor.instanceId,
    cardId: actor.cardId,
    controllerId: actor.controllerId,
    zone: actor.zone,
    stance: actor.stance,
    facing: actor.facing,
    turnDeployed: actor.turnDeployed,
    hasAttackedThisTurn: actor.hasAttackedThisTurn,
    hasChangedStanceThisTurn: actor.hasChangedStanceThisTurn,
    atk: stats.atk,
    def: stats.def,
    equippedPolicyIds: equipsOf(state, actor.instanceId),
  };
}

/**
 * Builds the DuelState view a specific player is allowed to see: their own
 * hand in full, the opponent's hand redacted to a count, both decks
 * redacted to counts, face-down Resistance Actors redacted unless the
 * viewer controls them, and Set Scandals redacted to "something is set
 * there" unless the viewer controls them. This is the only shape that
 * ever goes out over the wire -- the raw DuelState never leaves the
 * server (see server.ts's broadcastState, which calls this once per
 * connected socket rather than sending one shared message).
 */
export function redactStateFor(
  state: DuelState,
  viewer: DuelistId,
  // Room-level info that isn't part of the engine state.
  room: { rematchVotes?: DuelistId[]; edition?: Edition } = {},
): PublicDuelState {
  const duelists = {} as Record<DuelistId, PublicDuelistView>;

  for (const id of ["duelist1", "duelist2"] as const) {
    const duelist = state.duelists[id];
    const isViewer = id === viewer;
    // What the viewer may see of this duelist's hidden cards.
    const sees = isViewer || viewerSeesHidden(state, viewer);

    duelists[id] = {
      id: duelist.id,
      mandate: duelist.mandate,
      deckCount: duelist.deck.length,
      hand: isViewer ? [...duelist.hand] : null,
      handCount: duelist.hand.length,
      field: duelist.field.map((actor) => redactActor(actor, state, viewer, sees)),
      archive: [...duelist.archive],
      setScandals: duelist.setScandals.map((scandal) => ({
        instanceId: scandal.instanceId,
        controllerId: scandal.controllerId,
        zone: scandal.zone,
        cardId: sees ? scandal.cardId : null,
      })),
      backroomPolicies: duelist.backroomPolicies.map((policy) => ({
        instanceId: policy.instanceId,
        controllerId: policy.controllerId,
        zone: policy.zone,
        faceDown: policy.faceDown,
        cardId: sees || !policy.faceDown ? policy.cardId : null,
        equippedToInstanceId: policy.equippedToInstanceId,
      })),
      hasNormalDeployedThisTurn: duelist.hasNormalDeployedThisTurn,
      hasSetScandalThisTurn: duelist.hasSetScandalThisTurn,
    };
  }

  return {
    turnNumber: state.turnNumber,
    activeDuelistId: state.activeDuelistId,
    phase: state.phase,
    winnerId: state.winnerId,
    duelists,
    // The engine's log is public by construction (it never names a card
    // that's still hidden), so both viewers get the same recent events.
    log: state.log.slice(-LOG_EVENTS_SENT),
    election: { ...state.election },
    polls: { duelist1: countVotes(state, "duelist1"), duelist2: countVotes(state, "duelist2") },
    rematchVotes: [...(room.rematchVotes ?? [])],
    edition: room.edition ?? "world",
  };
}

// Small helper some callers (server.ts) find convenient.
export { otherDuelist };

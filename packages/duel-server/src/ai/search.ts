import { ACTOR_CARDS, CARDS, POLICY_CARDS, embassyChoiceIn } from "@project-palacio/duel-content";
import type { ActorCardId, CardId, PolicyCardId, ScandalCardId } from "@project-palacio/duel-content";
import {
  ACTOR_ZONE_COUNT,
  BACKROOM_ZONE_COUNT,
  countVotes,
  eligibleEmbassyIndices,
  policyTarget,
} from "@project-palacio/duel-engine";
import type { DuelistId, DuelistState, DuelState, FieldActor, FieldPolicy, FieldScandal } from "@project-palacio/duel-engine";
import type { PlayerAction } from "../protocol/Messages";
import type { PublicDuelState, PublicDuelistView } from "../protocol/PublicDuelState";
import { buildDefaultDeck, DuelRoom } from "../rooms/DuelRoom";
import { AiPlayer } from "./AiPlayer";
import { actionKey } from "./chooseAiAction";

// The Hard AI's look-ahead ("flat Monte Carlo"): for each move it could
// make, it imagines several plausible versions of what it can't see (the
// opponent's hand, face-down cards and both decks, sampled from the
// cards still unaccounted for), plays the rest of its turn and the
// opponent's whole next turn with the Normal AI, and scores the result.
// It picks the move with the best average. It never looks at the real
// hidden cards: everything starts from its own redacted view.

const SAMPLES = 16;
const MAX_CANDIDATES = 40;

const other = (id: DuelistId): DuelistId => (id === "duelist1" ? "duelist2" : "duelist1");

function actorValue(id: ActorCardId): number {
  const card = ACTOR_CARDS[id];
  let value = card.atk + card.def * 0.6;
  if (card.tier === "leader") value += 4;
  if (card.onDeploy || card.onFlip || card.onTurnStart || card.onSentToEmbassy || card.passives) value += 1;
  return value;
}

// --- Imagining the hidden cards -------------------------------------------

function removeOne(pool: CardId[], id: CardId): void {
  const index = pool.indexOf(id);
  if (index !== -1) pool.splice(index, 1);
}

function takeRandom(pool: CardId[], random: () => number, accept: (id: CardId) => boolean, fallback: CardId[]): CardId {
  const matches = pool.map((id, index) => ({ id, index })).filter(({ id }) => accept(id));
  if (matches.length > 0) {
    const { index } = matches[Math.floor(random() * matches.length)];
    return pool.splice(index, 1)[0];
  }
  const any = fallback.filter(accept);
  return any[Math.floor(random() * any.length)] ?? fallback[0];
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function imagineDuelist(view: PublicDuelState, side: PublicDuelistView, random: () => number): DuelistState {
  const edition = view.edition;
  const pool = buildDefaultDeck(edition, random);
  const everything = [...new Set(buildDefaultDeck(edition, () => 0.5))];
  // Whatever is visible is not in the unknown pool.
  for (const id of side.archive) removeOne(pool, id);
  for (const id of side.hand ?? []) removeOne(pool, id);
  for (const actor of side.field) if (actor.cardId) removeOne(pool, actor.cardId);
  for (const policy of side.backroomPolicies) if (policy.cardId) removeOne(pool, policy.cardId);
  for (const scandal of side.setScandals) if (scandal.cardId) removeOne(pool, scandal.cardId);

  const isActor = (id: CardId) => CARDS[id].category === "actor";
  const field: FieldActor[] = side.field.map((actor) => ({
    instanceId: actor.instanceId,
    cardId: (actor.cardId ?? takeRandom(pool, random, isActor, everything)) as ActorCardId,
    controllerId: actor.controllerId,
    zone: actor.zone,
    stance: actor.stance,
    facing: actor.facing,
    turnDeployed: actor.turnDeployed,
    hasAttackedThisTurn: actor.hasAttackedThisTurn,
    hasChangedStanceThisTurn: actor.hasChangedStanceThisTurn,
  }));
  const setScandals: FieldScandal[] = side.setScandals.map((scandal) => ({
    instanceId: scandal.instanceId,
    controllerId: scandal.controllerId,
    zone: scandal.zone,
    cardId: (scandal.cardId ?? takeRandom(pool, random, (id) => CARDS[id].category === "scandal", everything)) as ScandalCardId,
  }));
  const backroomPolicies: FieldPolicy[] = side.backroomPolicies.map((policy) => ({
    instanceId: policy.instanceId,
    controllerId: policy.controllerId,
    zone: policy.zone,
    faceDown: policy.faceDown,
    equippedToInstanceId: policy.equippedToInstanceId,
    cardId: (policy.cardId ?? takeRandom(pool, random, (id) => CARDS[id].category === "policy", everything)) as PolicyCardId,
  }));

  const rest = shuffled(pool, random);
  const hand = side.hand ? [...side.hand] : rest.splice(0, side.handCount);
  while (hand.length < side.handCount) hand.push(everything[Math.floor(random() * everything.length)]);
  const deck = rest.splice(0, side.deckCount);
  while (deck.length < side.deckCount) deck.push(everything[Math.floor(random() * everything.length)]);

  // Banked votes = the poll's bonus minus the face-up vote passives.
  const passiveVotes = side.field.reduce((sum, actor) => {
    if (!actor.cardId || actor.facing !== "face-up") return sum;
    const passive = ACTOR_CARDS[actor.cardId as ActorCardId].passives?.find((p) => p.kind === "votes-bonus");
    return sum + (passive && passive.kind === "votes-bonus" ? passive.amount : 0);
  }, 0);

  return {
    id: side.id,
    mandate: side.mandate,
    deck,
    hand,
    field,
    archive: [...side.archive],
    setScandals,
    backroomPolicies,
    hasNormalDeployedThisTurn: side.hasNormalDeployedThisTurn,
    hasSetScandalThisTurn: side.hasSetScandalThisTurn,
    bonusVotes: Math.max(0, (view.polls[side.id].bonus ?? 0) - passiveVotes),
  };
}

export function imagineState(view: PublicDuelState, random: () => number): DuelState {
  const duelists = {
    duelist1: imagineDuelist(view, view.duelists.duelist1, random),
    duelist2: imagineDuelist(view, view.duelists.duelist2, random),
  };
  const ids = [duelists.duelist1, duelists.duelist2].flatMap((d) => [
    ...d.field.map((a) => a.instanceId),
    ...d.setScandals.map((s) => s.instanceId),
    ...d.backroomPolicies.map((p) => p.instanceId),
  ]);
  return {
    turnNumber: view.turnNumber,
    activeDuelistId: view.activeDuelistId,
    phase: view.phase,
    duelists,
    winnerId: view.winnerId,
    nextInstanceId: Math.max(0, ...ids) + 1000,
    log: [],
    election: { ...view.election },
  };
}

// --- The moves worth considering ------------------------------------------

function bestPick(view: PublicDuelState, me: DuelistId, cardId: CardId, trigger: "deploy" | "flip" | "activate"): number | undefined {
  const card = CARDS[cardId];
  const effects =
    card.category === "actor"
      ? trigger === "deploy"
        ? card.onDeploy
        : card.onFlip
      : card.category === "policy" && card.kind === "normal"
        ? card.onActivate
        : undefined;
  const choice = embassyChoiceIn(effects);
  if (!choice) return undefined;
  const archive = view.duelists[choice.from === "yours" ? me : other(me)].archive;
  const eligible = eligibleEmbassyIndices(archive, choice.filter);
  if (eligible.length === 0) return undefined;
  const value = (id: CardId) => (CARDS[id].category === "actor" ? actorValue(id as ActorCardId) : 4);
  return eligible.reduce((best, index) => (value(archive[index]) > value(archive[best]) ? index : best));
}

export function candidateActions(view: PublicDuelState, me: DuelistId): PlayerAction[] {
  const mine = view.duelists[me];
  const theirs = view.duelists[other(me)];
  const actions: PlayerAction[] = [{ type: "advance-phase" }];
  const turn = view.turnNumber;

  if (view.phase === "confrontation") {
    for (const attacker of mine.field) {
      if (attacker.cardId === null || attacker.stance !== "campaign" || attacker.turnDeployed === turn || attacker.hasAttackedThisTurn) continue;
      if (theirs.field.length === 0) actions.push({ type: "declare-attack", attackerInstanceId: attacker.instanceId });
      for (const target of theirs.field) {
        actions.push({ type: "declare-attack", attackerInstanceId: attacker.instanceId, targetInstanceId: target.instanceId });
      }
    }
    return actions;
  }
  if (view.phase !== "campaign-1" && view.phase !== "campaign-2") return actions;

  const backroomFree = BACKROOM_ZONE_COUNT - mine.setScandals.length - mine.backroomPolicies.length;
  const leader = mine.field.find((a) => a.cardId !== null && ACTOR_CARDS[a.cardId as ActorCardId].tier === "leader");
  const fodder = [...mine.field]
    .sort((a, b) => (a.cardId ? actorValue(a.cardId as ActorCardId) : 3) - (b.cardId ? actorValue(b.cardId as ActorCardId) : 3))
    .slice(0, 2);

  for (const id of new Set(mine.hand ?? [])) {
    const card = CARDS[id];
    if (card.category === "actor" && !mine.hasNormalDeployedThisTurn) {
      const actorCard = ACTOR_CARDS[card.id];
      const campaignOnly = actorCard.passives?.some((p) => p.kind === "campaign-only");
      const plays: Array<{ stance: "campaign" | "resistance"; facing: "face-up" | "face-down" }> = campaignOnly
        ? [{ stance: "campaign", facing: "face-up" }]
        : [
            { stance: "campaign", facing: "face-up" },
            { stance: "resistance", facing: "face-down" },
            ...(actorCard.onDeploy || actorCard.passives ? [{ stance: "resistance" as const, facing: "face-up" as const }] : []),
          ];
      const tributes =
        actorCard.tier === "grassroots"
          ? mine.field.length < ACTOR_ZONE_COUNT
            ? [undefined]
            : []
          : actorCard.tier === "leader" && leader
            ? [leader]
            : fodder;
      for (const tribute of tributes) {
        for (const play of plays) {
          actions.push({
            type: "deploy-actor",
            actorCardId: card.id,
            options: {
              ...play,
              tributeInstanceId: tribute?.instanceId,
              zone: tribute?.zone,
              embassyPick: play.facing === "face-up" ? bestPick(view, me, card.id, "deploy") : undefined,
            },
          });
        }
      }
    } else if (card.category === "policy") {
      const policy = POLICY_CARDS[card.id];
      const side = policyTarget(policy);
      if (policy.kind === "equip" && backroomFree === 0) continue;
      if (side === null) {
        actions.push({ type: "activate-policy", policyCardId: policy.id, options: { embassyPick: bestPick(view, me, policy.id, "activate") } });
      } else {
        const pool = side === "your-actor" ? mine.field : theirs.field;
        for (const target of pool) {
          actions.push({ type: "activate-policy", policyCardId: policy.id, options: { targetInstanceId: target.instanceId } });
        }
      }
    } else if (card.category === "scandal" && !mine.hasSetScandalThisTurn && backroomFree > 0) {
      actions.push({ type: "set-scandal", scandalCardId: card.id });
    }
  }
  for (const actor of mine.field) {
    if (actor.cardId === null || actor.turnDeployed === turn || actor.hasAttackedThisTurn || actor.hasChangedStanceThisTurn) continue;
    actions.push({
      type: "change-stance",
      instanceId: actor.instanceId,
      options: { embassyPick: actor.facing === "face-down" ? bestPick(view, me, actor.cardId, "flip") : undefined },
    });
  }
  return actions;
}

// --- Scoring a position -----------------------------------------------------

function evaluate(state: DuelState, me: DuelistId): number {
  if (state.winnerId) return state.winnerId === me ? 1000 : -1000;
  const opp = other(me);
  const votes = countVotes(state, me).total - countVotes(state, opp).total;
  const turnsLeft = Math.max(0, state.election.turn - state.turnNumber);
  const board = (id: DuelistId) =>
    state.duelists[id].field.reduce((sum, actor) => sum + actorValue(actor.cardId), 0) + state.duelists[id].hand.length * 1.5;
  // Votes matter more as the count approaches; board and cards matter more early.
  const voteWeight = 1 + 4 / (1 + turnsLeft);
  const boardWeight = Math.min(0.6, 0.1 * turnsLeft);
  return votes * voteWeight + (board(me) - board(opp)) * boardWeight;
}

// --- The search ---------------------------------------------------------------

export function searchBestAction(
  view: PublicDuelState,
  me: DuelistId,
  random: () => number,
  rejected: ReadonlySet<string>,
): PlayerAction {
  let candidates = candidateActions(view, me).filter((action) => !rejected.has(actionKey(action)));
  if (candidates.length === 0) return { type: "advance-phase" };
  if (candidates.length === 1) return candidates[0];
  candidates = candidates.slice(0, MAX_CANDIDATES);

  // Same imagined worlds for every candidate, so they're compared fairly.
  const worlds = Array.from({ length: SAMPLES }, () => imagineState(view, random));
  const room = new DuelRoom([], [], random, view.edition);
  const scores = candidates.map(() => 0);

  candidates.forEach((action, index) => {
    for (let s = 0; s < worlds.length; s += 1) {
      room.state = JSON.parse(JSON.stringify(worlds[s])) as DuelState; // plain data: a JSON copy is a deep copy
      const result = room.applyAction(me, action);
      if (!result.ok) {
        scores[index] -= 50; // impossible in this imagined world
        continue;
      }
      // Finish our turn and play the opponent's with the Normal AI.
      const us = new AiPlayer(room, me, "normal", random);
      const them = new AiPlayer(room, other(me), "normal", random);
      const startTurn = room.state.turnNumber;
      let guard = 0;
      while (!room.state.winnerId && guard < 400) {
        const t = room.state.turnNumber;
        if (t > startTurn + 1 || (t > startTurn && room.state.activeDuelistId === me)) break;
        (room.state.activeDuelistId === me ? us : them).step();
        guard += 1;
      }
      scores[index] += evaluate(room.state, me);
    }
  });

  let best = 0;
  for (let i = 1; i < candidates.length; i += 1) if (scores[i] > scores[best]) best = i;
  return candidates[best];
}

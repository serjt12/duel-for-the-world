import { ACTOR_CARDS, CARDS, POLICY_CARDS, embassyChoiceIn } from "@project-palacio/duel-content";
import type { ActorCardId, CardId, InstantEffect, PolicyCardId, ScandalCardId } from "@project-palacio/duel-content";
import {
  ACTOR_ZONE_COUNT,
  BACKROOM_ZONE_COUNT,
  eligibleEmbassyIndices,
  policyTarget,
} from "@project-palacio/duel-engine";
import type { DuelistId } from "@project-palacio/duel-engine";
import type { PlayerAction } from "../protocol/Messages";
import type { PublicDuelState, PublicFieldActor } from "../protocol/PublicDuelState";
import { searchBestAction } from "./search";

// The computer opponent. It decides ONE action at a time from the same
// redacted view a human player gets (redactStateFor), so it can't peek at
// hidden cards: fairness by construction, not by promise. Call it again
// after every state change while it's the AI's turn; it ends each phase
// with advance-phase, so a turn always finishes.
//
// Levels:
// - easy: plays reasonable cards but skips plays, picks stances loosely
//   and makes the odd bad attack.
// - normal: the heuristic player used for balance testing.
// - hard: looks ahead (search.ts): tries each move in several imagined
//   versions of the hidden cards, plays out the turn and the opponent's
//   reply, and keeps the move that scores best.

export type AiLevel = "easy" | "normal" | "hard";

export interface AiOptions {
  random?: () => number;
  // Actions the room already rejected this phase (their JSON), so the AI
  // never loops on an illegal move. The runner fills this in.
  rejected?: ReadonlySet<string>;
}

type FaceUp = Extract<PublicFieldActor, { cardId: CardId }>;

const other = (id: DuelistId): DuelistId => (id === "duelist1" ? "duelist2" : "duelist1");
const isFaceUpView = (actor: PublicFieldActor): actor is FaceUp => actor.cardId !== null;

// Unknown face-down Actors: assume a middling defender.
const HIDDEN_DEF_GUESS = 4;

function actorValue(id: ActorCardId): number {
  const card = ACTOR_CARDS[id];
  let value = card.atk + card.def * 0.6;
  if (card.tier === "leader") value += 4;
  if (card.onDeploy || card.onFlip || card.onTurnStart || card.onSentToEmbassy || card.passives) value += 1;
  return value;
}

function cardValue(id: CardId): number {
  return CARDS[id].category === "actor" ? actorValue(id as ActorCardId) : 4;
}

/** A key that identifies an action, for the "rejected" set. */
export function actionKey(action: PlayerAction): string {
  return JSON.stringify(action);
}

export function chooseAiAction(view: PublicDuelState, me: DuelistId, level: AiLevel, options: AiOptions = {}): PlayerAction {
  const inPlay = view.phase === "campaign-1" || view.phase === "confrontation" || view.phase === "campaign-2";
  if (level === "hard" && inPlay && !view.winnerId && view.activeDuelistId === me) {
    return searchBestAction(view, me, options.random ?? Math.random, options.rejected ?? new Set());
  }
  const ai = new Brain(view, me, level, options.random ?? Math.random, options.rejected ?? new Set());
  return ai.decide();
}

class Brain {
  private readonly view: PublicDuelState;
  private readonly me: DuelistId;
  private readonly level: AiLevel;
  private readonly random: () => number;
  private readonly rejected: ReadonlySet<string>;
  private readonly mine;
  private readonly theirs;
  private readonly opp: DuelistId;

  constructor(view: PublicDuelState, me: DuelistId, level: AiLevel, random: () => number, rejected: ReadonlySet<string>) {
    this.view = view;
    this.me = me;
    this.level = level;
    this.random = random;
    this.rejected = rejected;
    this.opp = other(me);
    this.mine = view.duelists[me];
    this.theirs = view.duelists[this.opp];
  }

  decide(): PlayerAction {
    const { view, me } = this;
    if (view.winnerId) {
      return { type: "rematch" };
    }
    if (view.activeDuelistId !== me) {
      // Not our turn: nothing sensible to do (the runner shouldn't ask).
      return { type: "advance-phase" };
    }
    const next = (() => {
      switch (view.phase) {
        case "campaign-1":
          return this.campaign(true);
        case "confrontation":
          return this.confrontation();
        case "campaign-2":
          return this.campaign(false);
        default:
          return null;
      }
    })();
    return next ?? { type: "advance-phase" };
  }

  // --- helpers -------------------------------------------------------------

  private ok(action: PlayerAction | null): PlayerAction | null {
    return action && !this.rejected.has(actionKey(action)) ? action : null;
  }

  private sloppy(chance: number): boolean {
    return this.level === "easy" && this.random() < chance;
  }

  private threat(): number {
    // The strongest ATK the opponent could swing with next turn (known cards only).
    return Math.max(0, ...this.theirs.field.filter(isFaceUpView).map((actor) => actor.atk));
  }

  private backroomFree(): number {
    return BACKROOM_ZONE_COUNT - this.mine.setScandals.length - this.mine.backroomPolicies.length;
  }

  private turnsUntilCount(): number {
    return this.view.election.turn - this.view.turnNumber;
  }

  // The count happens at the end of THIS turn: the opponent can't answer.
  private countsAfterThisTurn(): boolean {
    return this.turnsUntilCount() === 0;
  }

  private bestPick(effects: readonly InstantEffect[] | undefined): number | undefined {
    const choice = embassyChoiceIn(effects);
    if (!choice) return undefined;
    if (this.level === "easy") return undefined; // the server takes the most recent
    const owner = choice.from === "yours" ? this.me : this.opp;
    const archive = this.view.duelists[owner].archive;
    const eligible = eligibleEmbassyIndices(archive, choice.filter);
    if (eligible.length === 0) return undefined;
    return eligible.reduce((best, index) => (cardValue(archive[index]) > cardValue(archive[best]) ? index : best));
  }

  private canRetrieve(effects: readonly InstantEffect[]): boolean {
    const choice = embassyChoiceIn(effects);
    if (!choice) return true;
    const owner = choice.from === "yours" ? this.me : this.opp;
    if (eligibleEmbassyIndices(this.view.duelists[owner].archive, choice.filter).length === 0) return false;
    return choice.to !== "field" || this.mine.field.length < ACTOR_ZONE_COUNT;
  }

  // --- Campaign phases -----------------------------------------------------

  private campaign(first: boolean): PlayerAction | null {
    const steps: Array<() => PlayerAction | null> = first
      ? [() => this.flip(), () => this.policy(), () => this.deploy(), () => this.setScandal(), () => this.policy()]
      : [() => this.deploy(), () => this.policy(), () => this.electionStances(), () => this.defend(), () => this.setScandal()];
    for (const step of steps) {
      const action = this.ok(step());
      if (action) return action;
    }
    return null;
  }

  private flip(): PlayerAction | null {
    const threat = this.threat();
    for (const actor of this.mine.field) {
      if (actor.facing !== "face-down" || actor.cardId === null) continue;
      if (actor.turnDeployed === this.view.turnNumber || actor.hasChangedStanceThisTurn) continue;
      const card = ACTOR_CARDS[actor.cardId as ActorCardId];
      const retrieval = embassyChoiceIn(card.onFlip);
      const useful = (card.onFlip && (!retrieval || this.canRetrieve(card.onFlip))) || card.atk > threat;
      if (useful && !this.sloppy(0.4)) {
        return { type: "change-stance", instanceId: actor.instanceId, options: { embassyPick: this.bestPick(card.onFlip) } };
      }
    }
    return null;
  }

  private policy(): PlayerAction | null {
    const hand = this.mine.hand ?? [];
    for (const id of hand) {
      const card = CARDS[id];
      if (card.category !== "policy") continue;
      if (this.sloppy(0.35)) continue;
      const policy = POLICY_CARDS[id as PolicyCardId];
      const side = policyTarget(policy);

      if (policy.kind === "equip") {
        if (this.backroomFree() === 0) continue;
        const pool =
          side === "your-actor"
            ? this.mine.field.filter(isFaceUpView).filter((actor) => actor.stance === "campaign")
            : this.theirs.field.filter(isFaceUpView);
        if (pool.length === 0) continue;
        const target = pool.reduce((best, actor) => (actor.atk > best.atk ? actor : best));
        if (side === "opponent-actor" && target.atk < 3) continue;
        return { type: "activate-policy", policyCardId: policy.id, options: { targetInstanceId: target.instanceId } };
      }

      if (side === "opponent-actor") {
        const pool = this.theirs.field.filter(
          (actor) => policy.kind !== "normal" || policy.targetMaxAtk === undefined || (isFaceUpView(actor) && actor.atk <= policy.targetMaxAtk),
        );
        if (pool.length === 0) continue;
        const score = (actor: PublicFieldActor) => (isFaceUpView(actor) ? actorValue(actor.cardId as ActorCardId) : 5);
        const target = pool.reduce((best, actor) => (score(actor) > score(best) ? actor : best));
        return { type: "activate-policy", policyCardId: policy.id, options: { targetInstanceId: target.instanceId } };
      }

      if (policy.kind === "normal") {
        const drawsForMe = policy.onActivate.some((effect) => effect.kind === "draw-cards" && effect.recipient === "you");
        if (drawsForMe && hand.length > 6) continue;
        if (!this.canRetrieve(policy.onActivate)) continue;
        return { type: "activate-policy", policyCardId: policy.id, options: { embassyPick: this.bestPick(policy.onActivate) } };
      }
    }
    return null;
  }

  private deploy(): PlayerAction | null {
    const mine = this.mine;
    if (mine.hasNormalDeployedThisTurn) return null;
    const hand = mine.hand ?? [];
    const threat = this.threat();
    const leaderInOffice = mine.field.find((actor) => actor.cardId !== null && ACTOR_CARDS[actor.cardId as ActorCardId].tier === "leader");
    // Tribute fodder: the least valuable Actor, and (hard) never one carrying our equips.
    const fodderScore = (actor: PublicFieldActor) =>
      (actor.cardId ? actorValue(actor.cardId as ActorCardId) : 3) + (this.level === "hard" ? actor.equippedPolicyIds.length * 4 : 0);
    const weakest = mine.field.length ? mine.field.reduce((best, actor) => (fodderScore(actor) < fodderScore(best) ? actor : best)) : null;

    let best: { id: ActorCardId; tribute?: PublicFieldActor; score: number } | null = null;
    const candidates = [...new Set(hand)].filter((id) => CARDS[id].category === "actor") as ActorCardId[];
    if (this.level === "easy") candidates.sort(() => this.random() - 0.5);
    for (const id of candidates) {
      const card = ACTOR_CARDS[id];
      if (card.tier === "grassroots") {
        if (mine.field.length >= ACTOR_ZONE_COUNT) continue;
        const score = actorValue(id);
        if (!best || score > best.score) best = { id, score };
        if (this.level === "easy") break;
      } else {
        // A Leader replaces the one in office (it must be the tribute).
        const tribute = card.tier === "leader" && leaderInOffice ? leaderInOffice : weakest;
        if (!tribute) continue;
        const gain = actorValue(id) - fodderScore(tribute);
        if (gain < 2) continue;
        if (!best || gain + 3 > best.score) best = { id, tribute, score: gain + 3 };
      }
    }
    if (!best) return null;

    const card = ACTOR_CARDS[best.id];
    const campaignOnly = card.passives?.some((passive) => passive.kind === "campaign-only");
    let stance: "campaign" | "resistance" = "campaign";
    let facing: "face-up" | "face-down" = "face-up";
    if (!campaignOnly) {
      if (this.level === "easy") {
        if (this.random() < 0.4) {
          stance = "resistance";
          facing = this.random() < 0.5 ? "face-down" : "face-up";
        }
      } else if (card.onFlip) {
        stance = "resistance";
        facing = "face-down";
      } else if (this.level === "hard" && this.countsAfterThisTurn()) {
        // Votes now, and nobody gets to attack it before the count.
      } else if (card.atk < threat && card.def > card.atk) {
        stance = "resistance";
        facing = card.onDeploy || card.passives ? "face-up" : "face-down";
      } else if (card.atk < 3) {
        stance = "resistance";
        facing = card.onDeploy ? "face-up" : "face-down";
      }
    }
    return {
      type: "deploy-actor",
      actorCardId: best.id,
      options: {
        stance,
        facing,
        tributeInstanceId: best.tribute?.instanceId,
        zone: best.tribute?.zone,
        embassyPick: facing === "face-up" ? this.bestPick(card.onDeploy) : undefined,
      },
    };
  }

  private setScandal(): PlayerAction | null {
    if (this.mine.hasSetScandalThisTurn || this.backroomFree() === 0 || this.sloppy(0.4)) return null;
    const scandal = (this.mine.hand ?? []).find((id) => CARDS[id].category === "scandal");
    return scandal ? { type: "set-scandal", scandalCardId: scandal as ScandalCardId } : null;
  }

  // On the turn the votes are counted (and the opponent can't answer),
  // everyone campaigns: every point of ATK is a vote.
  private electionStances(): PlayerAction | null {
    if (this.level !== "hard" || !this.countsAfterThisTurn()) return null;
    for (const actor of this.mine.field) {
      if (actor.stance !== "resistance" || actor.hasChangedStanceThisTurn || actor.hasAttackedThisTurn) continue;
      if (actor.turnDeployed === this.view.turnNumber) continue;
      if (actor.cardId && ACTOR_CARDS[actor.cardId as ActorCardId].atk > 0) {
        return { type: "change-stance", instanceId: actor.instanceId, options: { embassyPick: undefined } };
      }
    }
    return null;
  }

  private defend(): PlayerAction | null {
    if (this.level === "easy") return null;
    const threat = this.threat();
    const nearElection = this.turnsUntilCount() <= 1;
    for (const actor of this.mine.field) {
      if (!isFaceUpView(actor)) continue;
      if (actor.hasAttackedThisTurn || actor.hasChangedStanceThisTurn || actor.turnDeployed === this.view.turnNumber) continue;
      const campaignOnly = ACTOR_CARDS[actor.cardId as ActorCardId].passives?.some((passive) => passive.kind === "campaign-only");
      if (actor.stance === "campaign" && !campaignOnly && actor.atk < threat && actor.def > actor.atk && !nearElection) {
        return { type: "change-stance", instanceId: actor.instanceId };
      }
      if (actor.stance === "resistance" && (actor.atk >= threat || nearElection)) {
        return { type: "change-stance", instanceId: actor.instanceId };
      }
    }
    return null;
  }

  // --- Confrontation ---------------------------------------------------------

  private confrontation(): PlayerAction | null {
    const view = this.view;
    const attackers = this.mine.field
      .filter(isFaceUpView)
      .filter((actor) => actor.stance === "campaign" && actor.turnDeployed !== view.turnNumber && !actor.hasAttackedThisTurn);
    if (attackers.length === 0) return null;

    // Direct attacks when the opponent has no Actors.
    if (this.theirs.field.length === 0) {
      // Hard: if the opponent may hold a Hot-Mic-style trap, lead with the weakest.
      const order = [...attackers].sort((a, b) => (this.level === "hard" ? a.atk - b.atk : b.atk - a.atk));
      for (const attacker of order) {
        const action = this.ok({ type: "declare-attack", attackerInstanceId: attacker.instanceId });
        if (action) return action;
      }
      return null;
    }

    type Plan = { attacker: FaceUp; target: PublicFieldActor; gain: number };
    const plans: Plan[] = [];
    for (const attacker of attackers) {
      for (const target of this.theirs.field) {
        let gain = 0;
        if (!isFaceUpView(target)) {
          gain = attacker.atk > HIDDEN_DEF_GUESS ? 3 : 0;
        } else if (target.stance === "campaign") {
          if (attacker.atk > target.atk) gain = actorValue(target.cardId as ActorCardId) + (attacker.atk - target.atk);
          else if (attacker.atk === target.atk) gain = actorValue(target.cardId as ActorCardId) - actorValue(attacker.cardId as ActorCardId);
        } else if (attacker.atk > target.def) {
          gain = actorValue(target.cardId as ActorCardId);
        }
        if (this.sloppy(0.12)) gain = 1 + this.random() * 3; // the odd reckless swing
        if (gain > 0) plans.push({ attacker, target, gain });
      }
    }
    if (plans.length === 0) return null;

    plans.sort((a, b) => b.gain - a.gain);
    // Hard: when the opponent has Set Scandals, spring them with the least
    // valuable attacker that still wins the best trade.
    if (this.level === "hard" && this.theirs.setScandals.length > 0) {
      const bestTarget = plans[0].target.instanceId;
      const same = plans.filter((plan) => plan.target.instanceId === bestTarget);
      same.sort((a, b) => a.attacker.atk - b.attacker.atk);
      plans.unshift(same[0]);
    }
    for (const plan of plans) {
      const action = this.ok({ type: "declare-attack", attackerInstanceId: plan.attacker.instanceId, targetInstanceId: plan.target.instanceId });
      if (action) return action;
    }
    return null;
  }
}

import { CARDS } from "@duel-for-the-world/duel-content";
import type { CardId } from "@duel-for-the-world/duel-content";
import type { DuelEvent, DuelistId } from "@duel-for-the-world/duel-engine";
import { localizedCardName } from "../i18n/cardText";
import { t, tf } from "../i18n";
import { flavor } from "./flavor";

// Turns the engine's duel log into short sentences for the Headlines
// ("Titulares" in Edición Colombia) report, from one player's point of view ("You" / "Your
// opponent"). Pure formatting: every fact comes from the event. All copy is
// resolved through i18n keys (see "Headlines / battle-report sentence
// templates" in i18n/locales/en.ts and es.ts) -- most lines come in separate
// "mine" / "theirs" variants rather than being pieced together from a
// generic subject/possessive, since English and Spanish conjugate and order
// those very differently.

export type Tone =
  | "neutral"
  | "good" // something went your way
  | "bad" // something went your opponent's way
  | "scandal" // a Scandal went off -- always worth a second look
  | "election" // Election Night
  | "turn"; // a turn divider

export interface Headline {
  seq: number;
  text: string;
  tone: Tone;
}

function name(cardId: CardId): string {
  return localizedCardName(cardId, CARDS[cardId].name);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled duel event: ${JSON.stringify(value)}`);
}

/** Whether `duelistId` is the viewer, plus the tone that follows from it. */
function who(duelistId: DuelistId, viewer: DuelistId) {
  const mine = duelistId === viewer;
  return {
    mine,
    // Good for the viewer when it's their event, bad otherwise.
    tone: (goodForActor: boolean): Tone => (goodForActor === mine ? "good" : "bad"),
  };
}

const TRIGGER_KEYS = {
  deploy: "headline.trigger.deploy",
  flip: "headline.trigger.flip",
  "turn-start": "headline.trigger.turnStart",
  fall: "headline.trigger.fall",
  "ally-fell": "headline.trigger.allyFell",
} as const;

export function describeEvent(event: DuelEvent, viewer: DuelistId): Headline {
  const actor = who(event.duelistId, viewer);
  const words = flavor();
  const line = (text: string, tone: Tone = "neutral"): Headline => ({ seq: event.seq, text, tone });

  switch (event.kind) {
    case "turn-started":
      return line(
        tf(actor.mine ? "headline.turnStarted.mine" : "headline.turnStarted.theirs", { turn: String(event.turn) }),
        "turn",
      );

    case "actor-deployed": {
      const tribute = event.tributedCardId ? tf("headline.deployed.tribute", { name: name(event.tributedCardId) }) : "";
      if (event.cardId === null) {
        return line(tf(actor.mine ? "headline.deployed.faceDown.mine" : "headline.deployed.faceDown.theirs", { tribute }));
      }
      const stance = event.stance === "campaign" ? t("board.status.campaign") : t("board.status.resistance");
      return line(
        tf(actor.mine ? "headline.deployed.faceUp.mine" : "headline.deployed.faceUp.theirs", {
          name: name(event.cardId),
          stance,
          tribute,
        }),
      );
    }

    case "stance-changed":
      return event.flipped
        ? line(tf(actor.mine ? "headline.stanceChanged.flipped.mine" : "headline.stanceChanged.flipped.theirs", { name: name(event.cardId) }))
        : line(
            tf(actor.mine ? "headline.stanceChanged.switched.mine" : "headline.stanceChanged.switched.theirs", {
              name: name(event.cardId),
              stance: event.stance === "campaign" ? t("board.status.campaign") : t("board.status.resistance"),
            }),
          );

    case "card-set":
      return line(t(actor.mine ? "headline.cardSet.mine" : "headline.cardSet.theirs"));

    case "policy-activated": {
      const target = event.targetCardId ? tf("headline.policyActivated.target", { name: name(event.targetCardId) }) : "";
      return line(
        tf(actor.mine ? "headline.policyActivated.mine" : "headline.policyActivated.theirs", {
          name: name(event.cardId),
          target,
        }),
      );
    }

    case "actor-effect":
      return line(
        tf(actor.mine ? "headline.actorEffect.mine" : "headline.actorEffect.theirs", {
          name: name(event.cardId),
          trigger: t(TRIGGER_KEYS[event.trigger]),
        }),
      );

    case "scandal-triggered":
      return line(
        tf(actor.mine ? "headline.scandalTriggered.mine" : "headline.scandalTriggered.theirs", {
          bang: words.scandalBang,
          name: name(event.cardId),
        }),
        "scandal",
      );

    case "attack-declared": {
      if (event.direct) {
        return line(
          tf(actor.mine ? "headline.attack.direct.mine" : "headline.attack.direct.theirs", {
            name: name(event.attackerCardId),
          }),
        );
      }
      const target = event.targetCardId ? name(event.targetCardId) : t("headline.attack.hiddenActor");
      return line(
        tf(actor.mine ? "headline.attack.target.mine" : "headline.attack.target.theirs", {
          name: name(event.attackerCardId),
          target,
        }),
      );
    }

    case "battle": {
      const attacker = tf("headline.battle.attackerLabel", { name: name(event.attackerCardId), atk: String(event.attackerAtk) });
      if (event.target === null) {
        return line(tf("headline.battle.direct", { attacker, damage: String(event.mandateDamage) }), actor.tone(true));
      }
      const stat = event.target.stance === "campaign" ? "ATK" : "DEF";
      const defender = tf("headline.battle.defenderLabel", { name: name(event.target.cardId), stat, value: String(event.target.value) });
      let result: string;
      let goodForAttacker: boolean | null;
      if (event.attackerDestroyed && event.defenderDestroyed) {
        result = t("headline.battle.result.bothFall");
        goodForAttacker = null;
      } else if (event.attackerDestroyed) {
        result = t("headline.battle.result.attackerFalls");
        goodForAttacker = false;
      } else if (event.defenderDestroyed) {
        result =
          event.mandateDamage > 0
            ? tf("headline.battle.result.defenderFallsWithDamage", { damage: String(event.mandateDamage) })
            : t("headline.battle.result.defenderFalls");
        goodForAttacker = true;
      } else {
        result = t("headline.battle.result.nobodyFalls");
        goodForAttacker = null;
      }
      return line(
        tf("headline.battle.vs", { attacker, defender, result }),
        goodForAttacker === null ? "neutral" : actor.tone(goodForAttacker),
      );
    }

    case "sent-to-embassy": {
      const why =
        event.reason === "tribute"
          ? t("headline.sentToEmbassy.why.tribute")
          : event.reason === "scandal"
            ? t("headline.sentToEmbassy.why.scandal")
            : event.reason === "effect"
              ? t("headline.sentToEmbassy.why.effect")
              : "";
      return line(
        tf(actor.mine ? "headline.sentToEmbassy.mine" : "headline.sentToEmbassy.theirs", {
          name: name(event.cardId),
          embassy: words.embassyThe,
          why,
        }),
        actor.tone(false),
      );
    }

    case "mandate-changed": {
      const gained = event.amount > 0;
      const key = actor.mine
        ? gained
          ? "headline.mandateChanged.mine.gain"
          : "headline.mandateChanged.mine.lose"
        : gained
          ? "headline.mandateChanged.theirs.gain"
          : "headline.mandateChanged.theirs.lose";
      return line(tf(key, { amount: String(Math.abs(event.amount)), total: String(event.mandate) }), actor.tone(gained));
    }

    case "cards-drawn": {
      const unit = event.count === 1 ? t("headline.unit.card.one") : t("headline.unit.card.many");
      const cards = `${event.count} ${unit}`;
      return line(tf(actor.mine ? "headline.cardsDrawn.mine" : "headline.cardsDrawn.theirs", { cards }));
    }

    case "returned-to-hand":
      return event.fromOpponent
        ? line(
            tf(actor.mine ? "headline.returnedToHand.steal.mine" : "headline.returnedToHand.steal.theirs", {
              name: name(event.cardId),
              embassyWord: words.embassyWord,
            }),
            actor.tone(true),
          )
        : line(
            tf(actor.mine ? "headline.returnedToHand.ownMine" : "headline.returnedToHand.ownTheirs", {
              name: name(event.cardId),
              embassyThe: words.embassyThe,
            }),
            actor.tone(true),
          );

    case "returned-to-field":
      return line(
        tf(actor.mine ? "headline.returnedToField.mine" : "headline.returnedToField.theirs", {
          name: name(event.cardId),
          embassyThe: words.embassyThe,
        }),
        actor.tone(true),
      );

    case "card-discarded":
      return line(
        tf(actor.mine ? "headline.cardDiscarded.mine" : "headline.cardDiscarded.theirs", {
          name: name(event.cardId),
          embassyThe: words.embassyThe,
        }),
      );

    case "votes-gained":
      return line(
        tf(actor.mine ? "headline.votesGained.mine" : "headline.votesGained.theirs", {
          amount: String(event.amount),
          total: String(event.total),
        }),
        actor.tone(true),
      );

    case "election-postponed":
      return line(tf("headline.electionPostponed", { turn: String(event.toTurn) }), "election");

    case "election-held": {
      const you = event.votes[viewer].total;
      const them = event.votes[viewer === "duelist1" ? "duelist2" : "duelist1"].total;
      const round = event.round === "first" ? t("headline.electionHeld.first") : tf("headline.electionHeld.runoffCount", { runoff: words.runoff });
      return line(tf("headline.electionHeld.line", { round, you: String(you), them: String(them) }), "election");
    }

    case "runoff-called":
      return line(tf("headline.runoffCalled", { bang: words.runoffBang }), "election");

    case "duel-won": {
      const how: Record<typeof event.reason, string> = {
        mandate: t("headline.duelWon.how.mandate"),
        "deck-out": t("headline.duelWon.how.deckOut"),
        election: t("headline.duelWon.how.election"),
        runoff: t("headline.duelWon.how.runoff"),
        tiebreak: t("headline.duelWon.how.tiebreak"),
      };
      return line(tf(actor.mine ? "headline.duelWon.mine" : "headline.duelWon.theirs", { how: how[event.reason] }), actor.tone(true));
    }

    default:
      return assertNever(event);
  }
}

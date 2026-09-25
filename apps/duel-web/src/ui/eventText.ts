import { CARDS } from "@project-palacio/duel-content";
import type { CardId } from "@project-palacio/duel-content";
import type { DuelEvent, DuelistId } from "@project-palacio/duel-engine";
import { flavor } from "./flavor";

// Turns the engine's duel log into short sentences for the Headlines
// ("Titulares" in Edición Colombia) report, from one player's point of view ("You" / "Your
// opponent"). Pure formatting: every fact comes from the event.

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
  return CARDS[cardId].name;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled duel event: ${JSON.stringify(value)}`);
}

/** "You" / "Your opponent", "your" / "their"... from `viewer`'s side. */
function who(duelistId: DuelistId, viewer: DuelistId) {
  const mine = duelistId === viewer;
  return {
    mine,
    subject: mine ? "You" : "Your opponent",
    possessive: mine ? "Your" : "Their",
    lower: mine ? "your" : "their",
    // Good for the viewer when it's their event, bad otherwise.
    tone: (goodForActor: boolean): Tone => (goodForActor === mine ? "good" : "bad"),
  };
}

const TRIGGER_TEXT = {
  deploy: "on-deploy effect",
  flip: "on-flip effect",
  "turn-start": "start-of-turn effect",
  fall: "parting shot",
  "ally-fell": "sympathy bump",
} as const;

export function describeEvent(event: DuelEvent, viewer: DuelistId): Headline {
  const actor = who(event.duelistId, viewer);
  const words = flavor();
  const line = (text: string, tone: Tone = "neutral"): Headline => ({ seq: event.seq, text, tone });

  switch (event.kind) {
    case "turn-started":
      return line(`Turn ${event.turn} · ${actor.mine ? "your turn" : "your opponent's turn"}`, "turn");

    case "actor-deployed": {
      const tribute = event.tributedCardId ? `, tributing ${name(event.tributedCardId)}` : "";
      if (event.cardId === null) {
        return line(`${actor.subject} Set an Actor face-down${tribute}.`);
      }
      const stance = event.stance === "campaign" ? "Campaign" : "Resistance";
      return line(`${actor.subject} deployed ${name(event.cardId)} in ${stance}${tribute}.`);
    }

    case "stance-changed":
      return event.flipped
        ? line(`${actor.subject} flipped ${name(event.cardId)} face-up into Campaign.`)
        : line(
            `${actor.possessive} ${name(event.cardId)} switched to ${event.stance === "campaign" ? "Campaign" : "Resistance"}.`,
          );

    case "card-set":
      return line(`${actor.subject} Set a card face-down in the Backroom.`);

    case "policy-activated": {
      const target = event.targetCardId ? ` on ${name(event.targetCardId)}` : "";
      return line(`${actor.subject} activated ${name(event.cardId)}${target}.`);
    }

    case "actor-effect":
      return line(`${actor.possessive} ${name(event.cardId)}'s ${TRIGGER_TEXT[event.trigger]}:`);

    case "scandal-triggered":
      return line(`${words.scandalBang} ${actor.possessive} Set ${name(event.cardId)} went off!`, "scandal");

    case "attack-declared": {
      const attacker = `${actor.possessive} ${name(event.attackerCardId)}`;
      if (event.direct) return line(`${attacker} attacks directly!`);
      const target = event.targetCardId ? name(event.targetCardId) : "a face-down Actor";
      return line(`${attacker} attacks ${target}.`);
    }

    case "battle": {
      const attacker = `${name(event.attackerCardId)} (ATK ${event.attackerAtk})`;
      if (event.target === null) {
        return line(`${attacker} hits directly: ${event.mandateDamage} Mandate damage.`, actor.tone(true));
      }
      const stat = event.target.stance === "campaign" ? "ATK" : "DEF";
      const defender = `${name(event.target.cardId)} (${stat} ${event.target.value})`;
      let result: string;
      let goodForAttacker: boolean | null;
      if (event.attackerDestroyed && event.defenderDestroyed) {
        result = "both fall";
        goodForAttacker = null;
      } else if (event.attackerDestroyed) {
        result = "the attacker falls";
        goodForAttacker = false;
      } else if (event.defenderDestroyed) {
        result = event.mandateDamage > 0 ? `the defender falls, ${event.mandateDamage} Mandate damage` : "the defender falls";
        goodForAttacker = true;
      } else {
        result = "nobody falls";
        goodForAttacker = null;
      }
      return line(`${attacker} vs ${defender}: ${result}.`, goodForAttacker === null ? "neutral" : actor.tone(goodForAttacker));
    }

    case "sent-to-embassy": {
      const why =
        event.reason === "tribute"
          ? " (tribute)"
          : event.reason === "scandal"
            ? " (scandal)"
            : event.reason === "effect"
              ? " (card effect)"
              : "";
      return line(`${actor.possessive} ${name(event.cardId)} was sent to ${words.embassyThe}${why}.`, actor.tone(false));
    }

    case "mandate-changed": {
      const gained = event.amount > 0;
      const verb = actor.mine ? (gained ? "gain" : "lose") : gained ? "gains" : "loses";
      return line(
        `${actor.subject} ${verb} ${Math.abs(event.amount)} Mandate (now ${event.mandate}).`,
        actor.tone(gained),
      );
    }

    case "cards-drawn": {
      const cards = `${event.count} card${event.count === 1 ? "" : "s"}`;
      return line(`${actor.subject} ${actor.mine ? "draw" : "draws"} ${cards}.`);
    }

    case "returned-to-hand":
      return event.fromOpponent
        ? line(
            `${actor.subject} ${actor.mine ? "take" : "takes"} ${name(event.cardId)} from ${actor.mine ? "your opponent's" : "your"} ${words.embassyWord}!`,
            actor.tone(true),
          )
        : line(`${name(event.cardId)} returns from ${words.embassyThe} to ${actor.lower} hand.`, actor.tone(true));

    case "returned-to-field":
      return line(`${name(event.cardId)} is back! Revived from ${words.embassyThe} onto ${actor.lower} field.`, actor.tone(true));

    case "card-discarded":
      return line(`${actor.subject} ${actor.mine ? "discard" : "discards"} ${name(event.cardId)} to ${words.embassyThe}.`);

    case "votes-gained": {
      const verb = actor.mine ? "bank" : "banks";
      return line(`${actor.subject} ${verb} ${event.amount} extra votes (${event.total} banked for Election Night).`, actor.tone(true));
    }

    case "election-postponed":
      return line(`Election postponed! Election Night is now turn ${event.toTurn}.`, "election");

    case "election-held": {
      const you = event.votes[viewer].total;
      const them = event.votes[viewer === "duelist1" ? "duelist2" : "duelist1"].total;
      const round = event.round === "first" ? "Election Night" : `${words.runoff} count`;
      return line(`🗳 ${round}: you ${you} votes · your opponent ${them}.`, "election");
    }

    case "runoff-called":
      return line(`${words.runoffBang} Too close to call -- one more turn each, battle damage ×2.`, "election");

    case "duel-won": {
      const how: Record<typeof event.reason, string> = {
        mandate: "",
        "deck-out": " (deck-out)",
        election: " -- elected!",
        runoff: " -- the runoff!",
        tiebreak: " -- on the tiebreak (cleaner record)",
      };
      return line(`${actor.mine ? "You win" : "Your opponent wins"} the duel${how[event.reason]}!`, actor.tone(true));
    }

    default:
      return assertNever(event);
  }
}

import { CARDS } from "./Cards";
import type { CardId } from "./CardId";
import { EMBASSY_TEXT } from "./Edition";
import type { Edition } from "./Edition";
import type {
  CardFilter,
  InstantEffect,
  Passive,
  ScandalEvent,
  ScandalResponse,
  ScandalTrigger,
  StatModifier,
} from "./Effects";

// Player-facing rules text, generated from the same effect data the
// engine resolves -- so a card's printed text can never drift from what
// it actually does. Kept short: it's printed on a ~110px-wide card.
// Wording follows each card's edition (e.g. "La Embajada" vs "the
// Embassy").
//
// Every switch below is exhaustive: adding a new effect kind to Effects.ts
// makes this file fail to compile until its wording is written.

function assertNever(value: never): never {
  throw new Error(`Unhandled effect: ${JSON.stringify(value)}`);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// "an Actor", "a Policy", "a card"; with an ATK cap for Actors.
function describeFilter(filter: CardFilter): string {
  const noun =
    filter.category === "actor" ? "an Actor" : filter.category === "policy" ? "a Policy" : filter.category === "scandal" ? "a Scandal" : "a card";
  return filter.maxAtk !== undefined ? `${noun} with ${filter.maxAtk} ATK or less` : noun;
}

export function describeInstantEffect(effect: InstantEffect, edition: Edition = "colombia"): string {
  const embassy = EMBASSY_TEXT[edition];
  switch (effect.kind) {
    case "change-mandate": {
      const amount = Math.abs(effect.amount);
      const gains = effect.amount >= 0;
      if (effect.recipient === "you") {
        return `${gains ? "Gain" : "Lose"} ${amount} Mandate.`;
      }
      // Card-game shorthand: "Opponent", to fit the small card face.
      return `Opponent ${gains ? "gains" : "loses"} ${amount} Mandate.`;
    }
    case "draw-cards":
      return effect.recipient === "you"
        ? `Draw ${plural(effect.count, "card")}.`
        : `Opponent draws ${plural(effect.count, "card")}.`;
    case "send-target-to-embassy":
      return `Send it to ${embassy.the}.`;
    case "retrieve-from-embassy": {
      const what = describeFilter(effect.filter);
      if (effect.to === "field") {
        // "Revive": back onto the field, face-up in Resistance.
        return `Revive ${what} from ${embassy.your}.`;
      }
      return effect.from === "yours"
        ? `Return ${what} from ${embassy.your} to your hand.`
        : `Add ${what} from ${embassy.theirs} to your hand.`;
    }
    case "gain-votes":
      return `Gain ${plural(effect.amount, "vote")}.`;
    case "discard-oldest":
      return effect.count === 1 ? "Discard your oldest card." : `Discard your ${effect.count} oldest cards.`;
    case "postpone-election":
      return `Delay Election Night ${plural(effect.turns, "turn")}.`;
    default:
      return assertNever(effect);
  }
}

function describeEffects(effects: readonly InstantEffect[], edition: Edition): string {
  return effects.map((effect) => describeInstantEffect(effect, edition)).join(" ");
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/** e.g. "+2 ATK / +2 DEF"; zero parts are left out. */
export function describeStatModifier(modifier: StatModifier): string {
  const parts: string[] = [];
  if (modifier.atk !== 0) parts.push(`${signed(modifier.atk)} ATK`);
  if (modifier.def !== 0) parts.push(`${signed(modifier.def)} DEF`);
  return parts.join(" / ");
}

export function describePassive(passive: Passive, edition: Edition = "world"): string {
  switch (passive.kind) {
    case "buff-others":
      return `Your other Actors get ${describeStatModifier(passive)}.`;
    case "votes-bonus":
      return `+${plural(passive.amount, "vote")} on Election Night.`;
    case "atk-per-embassy-actor":
      return `+${passive.amount} ATK per Actor in ${EMBASSY_TEXT[edition].your}.`;
    case "immune-to-effects":
      return "Immune to opposing effects.";
    case "campaign-only":
      return "Always in Campaign.";
    case "reveal-opponent-hidden":
      return "You see your opponent's face-down cards.";
    case "mandate-when-ally-lost":
      return `Whenever another of your Actors falls, gain ${passive.amount} Mandate.`;
    default:
      return assertNever(passive);
  }
}

function describeScandalEvent(event: ScandalEvent, edition: Edition): string {
  switch (event) {
    case "attack-on-your-actor":
      return "When your Actor is attacked";
    case "direct-attack-on-you":
      return "When you're attacked directly";
    case "opponent-deploys-establishment":
      return edition === "world"
        ? "When your opponent deploys an Establishment or Leader face-up"
        : "When your opponent deploys an Establishment face-up";
    case "your-actor-destroyed-in-battle":
      return "When your Actor is destroyed in battle";
    case "opponent-activates-policy":
      return "When your opponent activates a Policy";
    case "election-night":
      return "On Election Night";
    default:
      return assertNever(event);
  }
}

// "Your opponent loses 3 Mandate." -> "your opponent loses 3 Mandate", to
// follow the event clause mid-sentence.
function asClause(sentence: string): string {
  return lowerFirst(sentence).replace(/\.$/, "");
}

function describeScandalResponse(response: ScandalResponse, edition: Edition): string {
  switch (response.kind) {
    case "destroy-attacker":
      return "destroy the attacker";
    case "send-deployed-to-embassy":
      return `send it to ${EMBASSY_TEXT[edition].the}`;
    case "return-destroyed-to-hand":
      return "return it to your hand";
    case "gain-votes":
      return `gain ${plural(response.amount, "vote")}`;
    case "change-mandate":
      return asClause(describeInstantEffect(response, edition));
    default:
      return assertNever(response);
  }
}

export function describeScandalTrigger(trigger: ScandalTrigger, edition: Edition = "colombia"): string {
  const responses = trigger.responses.map((response) => describeScandalResponse(response, edition)).join(", then ");
  return `${describeScandalEvent(trigger.event, edition)}, ${responses}.`;
}

/** The rules text for a card, or null for a card with no effect (a vanilla Actor). */
export function rulesText(cardId: CardId): string | null {
  const card = CARDS[cardId];
  const edition = card.edition;

  switch (card.category) {
    case "actor": {
      // "On deploy" = deployed face-up; "On flip" = turned face-up from
      // face-down; "Each turn" = the start of each of your turns (the
      // How to Play guide spells them out).
      const parts: string[] = [];
      for (const passive of card.passives ?? []) parts.push(describePassive(passive, edition));
      if (card.onDeploy?.length) parts.push(`On deploy: ${lowerFirst(describeEffects(card.onDeploy, edition))}`);
      if (card.onFlip?.length) parts.push(`On flip: ${lowerFirst(describeEffects(card.onFlip, edition))}`);
      if (card.onTurnStart?.length) parts.push(`Each turn: ${lowerFirst(describeEffects(card.onTurnStart, edition))}`);
      if (card.onSentToEmbassy?.length) {
        parts.push(`When it falls: ${lowerFirst(describeEffects(card.onSentToEmbassy, edition))}`);
      }
      return parts.length > 0 ? parts.join(" ") : null;
    }
    case "policy":
      if (card.kind === "normal") {
        const effects = describeEffects(card.onActivate, edition);
        if (card.target !== "opponent-actor") return effects;
        const cap = card.targetMaxAtk !== undefined ? ` with ${card.targetMaxAtk} ATK or less` : "";
        return `Target an opposing Actor${cap}. ${effects}`;
      }
      {
        const modifier = describeStatModifier(card.whileEquipped);
        if (card.attachTo === "opponent-actor") {
          return modifier ? `Equip to an opposing Actor: it gets ${modifier}.` : "Equip to an opposing Actor.";
        }
        return modifier ? `Equipped Actor gets ${modifier}.` : "Equip to one of your Actors.";
      }
    case "scandal":
      return describeScandalTrigger(card.trigger, edition);
    default:
      return assertNever(card);
  }
}

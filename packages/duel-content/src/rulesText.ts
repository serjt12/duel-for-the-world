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
// Embassy") for English, and the UI's own language for everything else
// (see `locale` below).
//
// `locale` is a plain "en" | "es" flag rather than an import from the web
// app's i18n module: this package sits below apps/duel-web in the
// dependency graph (content -> engine -> web), so it keeps its own tiny
// phrase tables instead of reaching upward. The web app passes its
// current `locale()` in at the two call sites that print this text
// (ui/cardView.ts, ui/inspect.ts).
//
// Every switch below is exhaustive: adding a new effect kind to Effects.ts
// makes this file fail to compile until its wording is written in both
// languages.

export type RulesLocale = "en" | "es";

function assertNever(value: never): never {
  throw new Error(`Unhandled effect: ${JSON.stringify(value)}`);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// The Embassy/Embajada phrases a card's text weaves into its own
// sentences ("send it to the Embassy", "revive it from your Embassy").
// English keeps the edition's own flavor noun (so a Colombia-edition card
// read in English still says "La Embajada", as before); Spanish always
// uses the Spanish noun regardless of edition, since at that point the
// whole sentence around it is Spanish too.
function embassyWords(edition: Edition, locale: RulesLocale): { the: string; your: string; theirs: string } {
  if (locale === "es") {
    return { the: "la Embajada", your: "tu Embajada", theirs: "la Embajada de tu rival" };
  }
  return EMBASSY_TEXT[edition];
}

// "an Actor", "a Policy", "a card"; with an ATK cap for Actors.
function describeFilter(filter: CardFilter, locale: RulesLocale): string {
  if (locale === "es") {
    const noun =
      filter.category === "actor"
        ? "un Actor"
        : filter.category === "policy"
          ? "una Política"
          : filter.category === "scandal"
            ? "un Escándalo"
            : "una carta";
    return filter.maxAtk !== undefined ? `${noun} con ATK ${filter.maxAtk} o menos` : noun;
  }
  const noun =
    filter.category === "actor" ? "an Actor" : filter.category === "policy" ? "a Policy" : filter.category === "scandal" ? "a Scandal" : "a card";
  return filter.maxAtk !== undefined ? `${noun} with ${filter.maxAtk} ATK or less` : noun;
}

export function describeInstantEffect(effect: InstantEffect, edition: Edition = "colombia", locale: RulesLocale = "en"): string {
  const embassy = embassyWords(edition, locale);
  if (locale === "es") {
    switch (effect.kind) {
      case "change-mandate": {
        const amount = Math.abs(effect.amount);
        const gains = effect.amount >= 0;
        if (effect.recipient === "you") {
          return gains ? `Gana ${amount} Mandato.` : `Pierde ${amount} Mandato.`;
        }
        return gains ? `El oponente gana ${amount} Mandato.` : `El oponente pierde ${amount} Mandato.`;
      }
      case "draw-cards":
        return effect.recipient === "you"
          ? `Roba ${plural(effect.count, "carta")}.`
          : `El oponente roba ${plural(effect.count, "carta")}.`;
      case "send-target-to-embassy":
        return `Envíalo a ${embassy.the}.`;
      case "retrieve-from-embassy": {
        const what = describeFilter(effect.filter, locale);
        if (effect.to === "field") {
          return `Revive ${what} desde ${embassy.your}.`;
        }
        return effect.from === "yours"
          ? `Devuelve ${what} desde ${embassy.your} a tu mano.`
          : `Añade ${what} desde ${embassy.theirs} a tu mano.`;
      }
      case "gain-votes":
        return `Gana ${plural(effect.amount, "voto")}.`;
      case "discard-oldest":
        return effect.count === 1 ? "Descarta tu carta más antigua." : `Descarta tus ${effect.count} cartas más antiguas.`;
      case "postpone-election":
        return `Retrasa la Noche Electoral ${plural(effect.turns, "turno")}.`;
      default:
        return assertNever(effect);
    }
  }
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
      const what = describeFilter(effect.filter, locale);
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

function describeEffects(effects: readonly InstantEffect[], edition: Edition, locale: RulesLocale): string {
  return effects.map((effect) => describeInstantEffect(effect, edition, locale)).join(" ");
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/** e.g. "+2 ATK / +2 DEF"; zero parts are left out. ATK/DEF stay as-is in both languages (same convention as the stats line elsewhere in the UI). */
export function describeStatModifier(modifier: StatModifier): string {
  const parts: string[] = [];
  if (modifier.atk !== 0) parts.push(`${signed(modifier.atk)} ATK`);
  if (modifier.def !== 0) parts.push(`${signed(modifier.def)} DEF`);
  return parts.join(" / ");
}

export function describePassive(passive: Passive, edition: Edition = "world", locale: RulesLocale = "en"): string {
  if (locale === "es") {
    switch (passive.kind) {
      case "buff-others":
        return `Tus otros Actores obtienen ${describeStatModifier(passive)}.`;
      case "votes-bonus":
        return `+${plural(passive.amount, "voto")} en la Noche Electoral.`;
      case "atk-per-embassy-actor": {
        const capText = passive.max === undefined ? "" : ` (hasta +${passive.max})`;
        return `+${passive.amount} ATK por Actor en ${embassyWords(edition, locale).your}${capText}.`;
      }
      case "immune-to-effects":
        return "Inmune a los efectos del oponente.";
      case "campaign-only":
        return "Siempre en Campaña.";
      case "reveal-opponent-hidden":
        return "Ves las cartas boca abajo de tu oponente.";
      case "mandate-when-ally-lost":
        return `Cada vez que caiga otro de tus Actores, ganas ${passive.amount} Mandato.`;
      default:
        return assertNever(passive);
    }
  }
  switch (passive.kind) {
    case "buff-others":
      return `Your other Actors get ${describeStatModifier(passive)}.`;
    case "votes-bonus":
      return `+${plural(passive.amount, "vote")} on Election Night.`;
    case "atk-per-embassy-actor": {
      const capText = passive.max === undefined ? "" : ` (up to +${passive.max})`;
      return `+${passive.amount} ATK per Actor in ${EMBASSY_TEXT[edition].your}${capText}.`;
    }
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

function describeScandalEvent(event: ScandalEvent, edition: Edition, locale: RulesLocale): string {
  if (locale === "es") {
    switch (event) {
      case "attack-on-your-actor":
        return "Cuando atacan a tu Actor";
      case "direct-attack-on-you":
        return "Cuando te atacan directamente";
      case "opponent-deploys-establishment":
        return edition === "world"
          ? "Cuando tu oponente despliega un Actor de Clase Dirigente o un Líder boca arriba"
          : "Cuando tu oponente despliega un Actor de Clase Dirigente boca arriba";
      case "your-actor-destroyed-in-battle":
        return "Cuando tu Actor es destruido en combate";
      case "opponent-activates-policy":
        return "Cuando tu oponente activa una Política";
      case "election-night":
        return "En la Noche Electoral";
      default:
        return assertNever(event);
    }
  }
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

function describeScandalResponse(response: ScandalResponse, edition: Edition, locale: RulesLocale): string {
  if (locale === "es") {
    switch (response.kind) {
      case "destroy-attacker":
        return "destruye al atacante";
      case "send-deployed-to-embassy":
        return `envíalo a ${embassyWords(edition, locale).the}`;
      case "return-destroyed-to-hand":
        return "devuélvelo a tu mano";
      case "gain-votes":
        return `gana ${plural(response.amount, "voto")}`;
      case "change-mandate":
        return asClause(describeInstantEffect(response, edition, locale));
      default:
        return assertNever(response);
    }
  }
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
      return asClause(describeInstantEffect(response, edition, locale));
    default:
      return assertNever(response);
  }
}

export function describeScandalTrigger(trigger: ScandalTrigger, edition: Edition = "colombia", locale: RulesLocale = "en"): string {
  const joiner = locale === "es" ? ", luego " : ", then ";
  const responses = trigger.responses.map((response) => describeScandalResponse(response, edition, locale)).join(joiner);
  return `${describeScandalEvent(trigger.event, edition, locale)}, ${responses}.`;
}

/** The rules text for a card, or null for a card with no effect (a vanilla Actor). */
export function rulesText(cardId: CardId, locale: RulesLocale = "en"): string | null {
  const card = CARDS[cardId];
  const edition = card.edition;

  if (locale === "es") {
    switch (card.category) {
      case "actor": {
        const parts: string[] = [];
        for (const passive of card.passives ?? []) parts.push(describePassive(passive, edition, locale));
        if (card.onDeploy?.length) parts.push(`Al desplegar: ${lowerFirst(describeEffects(card.onDeploy, edition, locale))}`);
        if (card.onFlip?.length) parts.push(`Al voltear: ${lowerFirst(describeEffects(card.onFlip, edition, locale))}`);
        if (card.onTurnStart?.length) parts.push(`Cada turno: ${lowerFirst(describeEffects(card.onTurnStart, edition, locale))}`);
        if (card.onSentToEmbassy?.length) {
          parts.push(`Cuando cae: ${lowerFirst(describeEffects(card.onSentToEmbassy, edition, locale))}`);
        }
        return parts.length > 0 ? parts.join(" ") : null;
      }
      case "policy":
        if (card.kind === "normal") {
          const effects = describeEffects(card.onActivate, edition, locale);
          if (card.target !== "opponent-actor") return effects;
          const cap = card.targetMaxAtk !== undefined ? ` con ${card.targetMaxAtk} ATK o menos` : "";
          return `Elige un Actor rival${cap}. ${effects}`;
        }
        {
          const modifier = describeStatModifier(card.whileEquipped);
          if (card.attachTo === "opponent-actor") {
            return modifier ? `Equipa a un Actor rival: obtiene ${modifier}.` : "Equipa a un Actor rival.";
          }
          return modifier ? `El Actor equipado obtiene ${modifier}.` : "Equipa a uno de tus Actores.";
        }
      case "scandal":
        return describeScandalTrigger(card.trigger, edition, locale);
      default:
        return assertNever(card);
    }
  }

  switch (card.category) {
    case "actor": {
      // "On deploy" = deployed face-up; "On flip" = turned face-up from
      // face-down; "Each turn" = the start of each of your turns (the
      // How to Play guide spells them out).
      const parts: string[] = [];
      for (const passive of card.passives ?? []) parts.push(describePassive(passive, edition, locale));
      if (card.onDeploy?.length) parts.push(`On deploy: ${lowerFirst(describeEffects(card.onDeploy, edition, locale))}`);
      if (card.onFlip?.length) parts.push(`On flip: ${lowerFirst(describeEffects(card.onFlip, edition, locale))}`);
      if (card.onTurnStart?.length) parts.push(`Each turn: ${lowerFirst(describeEffects(card.onTurnStart, edition, locale))}`);
      if (card.onSentToEmbassy?.length) {
        parts.push(`When it falls: ${lowerFirst(describeEffects(card.onSentToEmbassy, edition, locale))}`);
      }
      return parts.length > 0 ? parts.join(" ") : null;
    }
    case "policy":
      if (card.kind === "normal") {
        const effects = describeEffects(card.onActivate, edition, locale);
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
      return describeScandalTrigger(card.trigger, edition, locale);
    default:
      return assertNever(card);
  }
}

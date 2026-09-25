import type { DuelPhase } from "@project-palacio/duel-engine";
import { flavor } from "./flavor";

// Single source of truth for phase display text, shared between the phase
// banner (renderBoard.ts) and the tutorial panel (renderTutorial.ts) so
// the two never drift apart.
export const PHASE_LABELS: Record<DuelPhase, string> = {
  agenda: "Agenda Phase",
  "campaign-1": "Campaign Phase 1",
  confrontation: "Confrontation Phase",
  "campaign-2": "Campaign Phase 2",
  recess: "Recess Phase",
};

export interface PhaseGuideEntry {
  label: string;
  summary: string;
  bullets: string[];
}

// Kept in the same order the engine actually advances through them
// (TurnSystem.ts's PHASE_ORDER), so the tutorial panel can just map over
// this and always match the real turn structure.
export const PHASE_ORDER: DuelPhase[] = [
  "agenda",
  "campaign-1",
  "confrontation",
  "campaign-2",
  "recess",
];

// A function, not a constant: the examples and names depend on the
// edition being played (flavor.ts).
export function phaseGuide(): Record<DuelPhase, PhaseGuideEntry> {
  const f = flavor();
  const world = f.edition === "world";
  return {
  agenda: {
    label: PHASE_LABELS.agenda,
    summary: "The turn begins. You've already drawn -- nothing to play yet.",
    bullets: ["Review your hand and field, then Advance Phase when ready."],
  },
  "campaign-1": {
    label: PHASE_LABELS["campaign-1"],
    summary: "The first of two windows to deploy, equip, and set up.",
    bullets: [
      world
        ? "Deploy one Actor from your hand into one of your 5 Actor zones -- Grassroots is free; Establishment and Leaders require tributing one of your own Actors (the new one takes its zone). Only one Leader can be in office at a time."
        : "Deploy one Actor from your hand into one of your 5 Actor zones -- Grassroots is free; Establishment-tier requires tributing one of your own Actors (it takes that Actor's zone).",
      "Play Policies: Activate them (a Normal Policy resolves instantly; an Equip attaches to an Actor) or Set them face-down to use later. Set Policies can be activated in any of your Campaign Phases. Some Policies point at an Actor -- yours or your opponent's -- and ask you to pick it.",
      world
        ? "Some Actors do something when deployed face-up (the Intern draws a card), when flipped face-up (the Whistleblower), at the start of each of your turns (the Oil Baron), or when they fall (the Party Loyalist)."
        : "Some Actors do something when deployed face-up (e.g. La Influencer draws a card) or when flipped face-up (La Periodista Investigativa).",
      "Set one Scandal card face-down in a Backroom zone -- it waits there until its trigger fires.",
      "Change stance: click one of your Actors to switch it between Campaign and Resistance (a face-down Actor flips face-up into Campaign). Once per Actor per turn, not the turn it was deployed, and not after it attacked.",
      "Your one Normal Deploy and one Scandal Set are shared across both Campaign Phases each turn, not one each.",
    ],
  },
  confrontation: {
    label: PHASE_LABELS.confrontation,
    summary: "Attack with any eligible Actor in Campaign Stance.",
    bullets: [
      "An Actor can attack only if it wasn't deployed this turn and hasn't attacked yet this turn.",
      "vs. a Campaign Stance target: higher ATK wins and destroys the loser; Mandate damage equal to the difference lands only if the defender's Actor was the one destroyed.",
      "vs. a Resistance Stance target: ATK vs. DEF decides who's destroyed, but no Mandate damage gets through either way. A face-down target flips face-up when attacked.",
      "If the opponent controls no Actors, you must attack their Mandate directly for full ATK.",
      world
        ? `Watch for Set Scandals: Hot Mic destroys an Actor that attacks directly, Leaked Emails costs the attacker 4 Mandate, and Martyrdom sends your fallen Actor back to your hand. They fire before any damage -- check ${f.headlines} to see what happened.`
        : "Watch for Set Scandals: Escándalo de Corrupción destroys an attacker that targets an Actor, Chuzadas destroys one that attacks directly, and Filtración a la Prensa costs the attacker 3 Mandate. They fire before any damage -- check Titulares to see what happened.",
    ],
  },
  "campaign-2": {
    label: PHASE_LABELS["campaign-2"],
    summary: "A second window for the same options as Campaign Phase 1.",
    bullets: [
      "Same rules as Campaign Phase 1 -- useful if you saved your Deploy or Scandal Set for after combat.",
      "Brace for the counter-attack: switch Actors that didn't attack to Resistance. (An Actor that attacked this turn keeps its stance until your next turn.)",
      "Still only one Normal Deploy and one Scandal Set total for the whole turn.",
    ],
  },
  recess: {
    label: PHASE_LABELS.recess,
    summary: "The turn winds down.",
    bullets: [
      "Nothing left to do -- Advance Phase passes control to your opponent, who draws and begins their Agenda Phase.",
    ],
  },
  };
}

export function generalGuide(): string[] {
  const f = flavor();
  const world = f.edition === "world";
  return [
  "Each side of the field has 5 Actor zones (front row) and 5 Backroom zones (back row, for Policies and Scandals).",
  "Tap a card in your hand to see how you can play it -- or drag it onto a zone, where it waits and asks. Actors: Deploy in Campaign, Deploy in Resistance, or Set face-down. Drop an Establishment Actor onto one of your Actors to tribute it.",
  "Long-press any card (or right-click it) to read it in full.",
  "Policies go in the Backroom: Activate them now, or Set them face-down and click them on a later turn to activate. An activated Equip picks one of your Actors and stays face-up in its zone for as long as that Actor is on the field. Scandals are always Set face-down.",
  "You can also click a card in your hand to see all its options. Resistance Actors lie sideways, like defense position.",
  "To attack, drag one of your Actors onto an opposing Actor, or onto the opponent's empty side for a direct attack. Esc cancels a drag, a menu, or a target choice.",
  "Win by reducing your opponent's Mandate to 0 (they resign), or by outlasting their deck -- running out of cards to draw loses the duel.",
  "Election Night: if nobody has resigned by the end of turn 12, the votes are counted. Votes = your Mandate + the ATK of your Actors in Campaign Stance, so near the end you must choose between campaigning in the open (more votes, but exposed) and protecting yourself in Resistance. The live poll in the middle bar shows the race right now.",
  world
    ? "Bonus votes count too: the Pollster, Bot Farm and Recount bank extra votes for Election Night, and the Referendum Czar adds 5 while in office. The Eternal Incumbent can even postpone the election."
    : null,
  `A lead of more than 3 votes wins the election. Anything closer goes to a ${f.runoff}: one more turn each with battle damage doubled, then a final count (a dead heat goes to whoever has fewer cards in ${f.embassyThe}).`,
  `${world ? "The Embassy" : "La Embajada"} is each player's discard pile (Yu-Gi-Oh's graveyard): destroyed, tributed and used cards are 'sent off as ambassador'. It's next to the Actor zones -- click either player's to look inside.`,
  world
    ? "The Embassy isn't the end: Presidential Pardon, the Ghostwriter and the Consultant bring Actors back to your hand, Political Comeback and the Comeback Kid revive one straight onto the field, and the Defector and Declassified Files raid your opponent's Embassy. You pick which card; a card with nothing to bring back can't be played. The Government-in-Exile even grows stronger with every Actor in your Embassy."
    : "Llamado a Consultas brings an Actor back from La Embajada to your hand -- you pick which one.",
  `${f.headlines} is the battle report: after every play it pops up over the middle of the board with what happened (battles, Scandals, effects), and the ${f.headlines} tab on the right keeps the whole history.`,
  "Campaign Stance means openly campaigning and is always face-up. Resistance Stance is a defensive posture and may be face-up or face-down (hidden from your opponent). Click one of your Actors in a Campaign Phase to change its stance -- once per turn, from the turn after it was deployed.",
  world
    ? "Grassroots Actors deploy freely; Establishment and Leaders cost a tribute of one of your own Actors. Leaders are the heads of state: each has a unique power while face-up, and only one can be in office -- a new one must replace the old."
    : "Grassroots Actors deploy freely; Establishment-tier Actors cost a tribute of one of your own Actors.",
  world
    ? "Normal Policies resolve once and go to the Embassy. Equip Policies stay in a Backroom zone attached to an Actor for as long as it's on the field -- usually yours (Lobbying Deal), but a hostile one like Attack Ad goes on an opposing Actor. When that Actor leaves, its equips go to the Embassy too."
    : "Normal Policies resolve once and go to La Embajada. Equip Policies stay in a Backroom zone attached to an Actor for as long as it's on the field -- usually yours (Maletín de Sobornos), but a hostile one like Campaña de Desprestigio goes on an opposing Actor. When that Actor leaves, its equips go to La Embajada too.",
  world
    ? "Scandals are Set face-down and fire automatically when their trigger happens (an attack, a direct attack, an Establishment or Leader being deployed, a Policy, Election Night...), then go to the Embassy. A Scandal whose own cost would knock you out doesn't fire."
    : "Scandals are Set face-down and fire automatically when their trigger happens (an attack, a direct attack, or an Establishment Actor being deployed), then go to La Embajada.",
  ].filter((line): line is string => line !== null);
}

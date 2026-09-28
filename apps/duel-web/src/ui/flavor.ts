import { EMBASSY_TEXT } from "@duel-for-the-world/duel-content";
import type { Edition } from "@duel-for-the-world/duel-content";
import type { WinReason } from "@duel-for-the-world/duel-engine";

// Everything the UI says that depends on the edition being played. The
// World Edition is English-only; Edición Colombia keeps its Spanish
// flavor (La Embajada, Titulares, ¡Revancha!...). Game terms (Mandate,
// Campaign, Resistance...) are English in both.
//
// The current edition is set once per state update (applyServerState),
// so renderers just call flavor() instead of threading it everywhere.

type Copy = { headline: string; deck: string };

export interface Flavor {
  edition: Edition;
  editionName: string;
  // The discard pile: "the Embassy" / "La Embajada".
  embassy: string; // capitalised, standalone (pile label, viewer title)
  embassyThe: string; // mid-sentence: "sent to the Embassy"
  embassyWord: string; // after a possessive: "your Embassy" / "your Embajada"
  headlines: string; // the battle report
  runoff: string; // the second round
  runoffBang: string;
  scandalBang: string;
  rematch: string;
  masthead: string;
  countTitle: string;
  countRunoffTitle: string;
  bulletin: (n: number, percent: number | null) => string;
  finalBulletin: string;
  bursts: { battle: string; scandal: string; effect: string; "spent-scandal": string };
  finale: Record<WinReason, { won: Copy; lost: Copy }>;
  palace: string;
}

const WORLD: Flavor = {
  edition: "world",
  editionName: "World Edition",
  embassy: "Embassy",
  embassyThe: EMBASSY_TEXT.world.the,
  embassyWord: "Embassy",
  headlines: "Headlines",
  runoff: "Runoff",
  runoffBang: "RUNOFF!",
  scandalBang: "SCANDAL!",
  rematch: "Rematch!",
  masthead: "THE DAILY SPIN",
  countTitle: "The Count",
  countRunoffTitle: "The Count · Runoff",
  bulletin: (n, percent) => (percent === null ? `Early count · Bulletin ${n}` : `Early count · Bulletin ${n} · ${percent}%`),
  finalBulletin: "Final bulletin · 100% of precincts reporting",
  bursts: { battle: "BAM!", scandal: "EXPOSED!", effect: "TO THE EMBASSY!", "spent-scandal": "SCANDAL!" },
  palace: "the Palace",
  finale: {
    election: {
      won: {
        headline: "LANDSLIDE!",
        deck: "You won Election Night. The keys to the Palace are yours -- your rival has been appointed ambassador somewhere very, very far away.",
      },
      lost: { headline: "DEFEATED AT THE POLLS", deck: "The voters have spoken. A diplomatic post at the Embassy awaits you." },
    },
    runoff: {
      won: { headline: "RUNOFF VICTORY!", deck: "A photo finish -- and the photo is of you, waving from the balcony of the Palace." },
      lost: { headline: "LOST IN THE RUNOFF", deck: "So close. A recount has been requested; nobody expects it to change anything." },
    },
    tiebreak: {
      won: { headline: "DEAD HEAT... CLEANEST RECORD WINS!", deck: "A dead heat, decided by your cleaner record: fewer cards in the Embassy." },
      lost: { headline: "DEAD HEAT: SUNK BY HIS RECORD", deck: "A dead heat -- and your longer record at the Embassy cost you." },
    },
    mandate: {
      won: { headline: "RIVAL RESIGNS!", deck: "With no Mandate left, your rival has announced they will spend more time with their family." },
      lost: { headline: "FORCED TO RESIGN", deck: "Your Mandate hit zero. There's always a podcast that will have you." },
    },
    "deck-out": {
      won: { headline: "RIVAL RUNS OUT OF CAMPAIGN!", deck: "Out of cards, out of ideas, out of the race." },
      lost: { headline: "NO CAMPAIGN, NO VOTES", deck: "You ran out of cards before you ran out of promises." },
    },
  },
};

const COLOMBIA: Flavor = {
  edition: "colombia",
  editionName: "Edición Colombia",
  embassy: "La Embajada",
  embassyThe: EMBASSY_TEXT.colombia.the,
  embassyWord: "Embajada",
  headlines: "Titulares",
  runoff: "Segunda vuelta",
  runoffBang: "¡SEGUNDA VUELTA!",
  scandalBang: "¡ESCÁNDALO!",
  rematch: "¡Revancha!",
  masthead: "EL CHISME DIARIO",
  countTitle: "Escrutinio",
  countRunoffTitle: "Escrutinio · Segunda vuelta",
  bulletin: (n, percent) => (percent === null ? `Preconteo · Boletín ${n}` : `Preconteo · Boletín ${n} · ${percent}%`),
  finalBulletin: "Boletín final · 100% de mesas informadas",
  bursts: { battle: "¡ZAS!", scandal: "¡EXPUESTO!", effect: "¡A LA EMBAJADA!", "spent-scandal": "¡ESCÁNDALO!" },
  palace: "El Palacio",
  finale: {
    election: {
      won: {
        headline: "¡ARRASÓ EN LAS URNAS!",
        deck: "You won Election Night. The keys to El Palacio are yours -- your rival has been appointed ambassador somewhere very, very far away.",
      },
      lost: { headline: "DERROTA EN LAS URNAS", deck: "The voters have spoken. A diplomatic post at La Embajada awaits you." },
    },
    runoff: {
      won: { headline: "¡GANÓ LA SEGUNDA VUELTA!", deck: "A photo finish -- and the photo is of you, waving from the balcony of El Palacio." },
      lost: { headline: "PERDIÓ LA SEGUNDA VUELTA", deck: "So close. A recount has been requested; nobody expects it to change anything." },
    },
    tiebreak: {
      won: { headline: "¡EMPATE TÉCNICO... Y GANA EL MÁS LIMPIO!", deck: "A dead heat, decided by your cleaner record: fewer cards in La Embajada." },
      lost: { headline: "EMPATE TÉCNICO: LO HUNDE SU PRONTUARIO", deck: "A dead heat -- and your longer record in La Embajada cost you." },
    },
    mandate: {
      won: { headline: "¡EL RIVAL RENUNCIA!", deck: "With no Mandate left, your rival has presented an 'irrevocable' resignation." },
      lost: { headline: "RENUNCIA IRREVOCABLE", deck: "Your Mandate hit zero. There's always a talk show that will have you." },
    },
    "deck-out": {
      won: { headline: "¡EL RIVAL SE QUEDÓ SIN CAMPAÑA!", deck: "Out of cards, out of ideas, out of the race." },
      lost: { headline: "SIN CAMPAÑA, SIN VOTOS", deck: "You ran out of cards before you ran out of promises." },
    },
  },
};

const FLAVORS: Record<Edition, Flavor> = { world: WORLD, colombia: COLOMBIA };

let current: Edition = "world";

/** Called with each state update (and by the lobby before a room exists). */
export function setEdition(edition: Edition | undefined): void {
  current = edition === "colombia" ? "colombia" : "world";
}

export function flavor(): Flavor {
  return FLAVORS[current];
}

export function flavorOf(edition: Edition): Flavor {
  return FLAVORS[edition];
}

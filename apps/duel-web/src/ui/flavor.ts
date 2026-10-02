import { EMBASSY_TEXT } from "@duel-for-the-world/duel-content";
import type { Edition } from "@duel-for-the-world/duel-content";
import type { WinReason } from "@duel-for-the-world/duel-engine";
import { locale } from "../i18n";

// Everything the UI says that depends on the edition being played *and*
// the UI language. Two independent axes:
//   - Edition (World / Edición Colombia) picks which newspaper, terms and
//     win-screen copy are in play (La Embajada vs. the Embassy, etc.).
//   - Locale (en / es) picks which language that newspaper is written in.
// World Edition was originally English-only and Edición Colombia was
// originally Spanish-only, so each edition still has its own "native"
// language below (WORLD / COLOMBIA) plus a translation into the other
// (WORLD_ES / COLOMBIA_EN) for when the UI locale doesn't match.
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
        deck: "Ganaste la Noche Electoral. Las llaves de El Palacio son tuyas -- tu rival fue nombrado embajador en algún lugar muy, muy lejano.",
      },
      lost: { headline: "DERROTA EN LAS URNAS", deck: "Los votantes han hablado. Un puesto diplomático en La Embajada te espera." },
    },
    runoff: {
      won: { headline: "¡GANÓ LA SEGUNDA VUELTA!", deck: "Un final fotográfico -- y la foto eres tú, saludando desde el balcón de El Palacio." },
      lost: { headline: "PERDIÓ LA SEGUNDA VUELTA", deck: "Tan cerca. Se pidió un reconteo; nadie espera que cambie nada." },
    },
    tiebreak: {
      won: { headline: "¡EMPATE TÉCNICO... Y GANA EL MÁS LIMPIO!", deck: "Un empate técnico, decidido por tu récord más limpio: menos cartas en La Embajada." },
      lost: { headline: "EMPATE TÉCNICO: LO HUNDE SU PRONTUARIO", deck: "Un empate técnico -- y tu historial más largo en La Embajada te costó caro." },
    },
    mandate: {
      won: { headline: "¡EL RIVAL RENUNCIA!", deck: "Sin Mandato que perder, tu rival presentó una renuncia 'irrevocable'." },
      lost: { headline: "RENUNCIA IRREVOCABLE", deck: "Tu Mandato llegó a cero. Siempre habrá un programa de entrevistas que te quiera." },
    },
    "deck-out": {
      won: { headline: "¡EL RIVAL SE QUEDÓ SIN CAMPAÑA!", deck: "Sin cartas, sin ideas, fuera de la contienda." },
      lost: { headline: "SIN CAMPAÑA, SIN VOTOS", deck: "Te quedaste sin cartas antes de quedarte sin promesas." },
    },
  },
};

// World Edition in Spanish, for when the UI locale is "es". Edición
// Colombia already writes in Spanish regardless of UI locale (its own
// long-standing flavor), so it needs no English counterpart.
const WORLD_ES: Flavor = {
  edition: "world",
  editionName: "Edición Mundial",
  embassy: "La Embajada",
  embassyThe: "la Embajada",
  embassyWord: "Embajada",
  headlines: "Titulares",
  runoff: "Segunda Vuelta",
  runoffBang: "¡SEGUNDA VUELTA!",
  scandalBang: "¡ESCÁNDALO!",
  rematch: "¡Revancha!",
  masthead: "EL GIRO DIARIO",
  countTitle: "El Escrutinio",
  countRunoffTitle: "El Escrutinio · Segunda Vuelta",
  bulletin: (n, percent) => (percent === null ? `Preconteo · Boletín ${n}` : `Preconteo · Boletín ${n} · ${percent}%`),
  finalBulletin: "Boletín final · 100% de los recintos reportando",
  bursts: { battle: "¡ZAS!", scandal: "¡EXPUESTO!", effect: "¡A LA EMBAJADA!", "spent-scandal": "¡ESCÁNDALO!" },
  palace: "el Palacio",
  finale: {
    election: {
      won: {
        headline: "¡ARRASÓ!",
        deck: "Ganaste la Noche Electoral. Las llaves del Palacio son tuyas -- tu rival fue nombrado embajador en algún lugar muy, muy lejano.",
      },
      lost: { headline: "DERROTADO EN LAS URNAS", deck: "Los votantes han hablado. Un puesto diplomático en la Embajada te espera." },
    },
    runoff: {
      won: { headline: "¡VICTORIA EN LA SEGUNDA VUELTA!", deck: "Un final fotográfico -- y la foto eres tú, saludando desde el balcón del Palacio." },
      lost: { headline: "PERDIÓ EN LA SEGUNDA VUELTA", deck: "Tan cerca. Se pidió un reconteo; nadie espera que cambie nada." },
    },
    tiebreak: {
      won: { headline: "EMPATE TÉCNICO... ¡GANA EL RÉCORD MÁS LIMPIO!", deck: "Un empate técnico, decidido por tu récord más limpio: menos cartas en la Embajada." },
      lost: { headline: "EMPATE TÉCNICO: HUNDIDO POR SU RÉCORD", deck: "Un empate técnico -- y tu historial más largo en la Embajada te costó caro." },
    },
    mandate: {
      won: { headline: "¡EL RIVAL RENUNCIA!", deck: "Sin Mandato que perder, tu rival anunció que pasará más tiempo con su familia." },
      lost: { headline: "OBLIGADO A RENUNCIAR", deck: "Tu Mandato llegó a cero. Siempre habrá un pódcast que te quiera." },
    },
    "deck-out": {
      won: { headline: "¡AL RIVAL SE LE ACABÓ LA CAMPAÑA!", deck: "Sin cartas, sin ideas, fuera de la contienda." },
      lost: { headline: "SIN CAMPAÑA, SIN VOTOS", deck: "Te quedaste sin cartas antes de quedarte sin promesas." },
    },
  },
};

const FLAVORS: Record<Edition, Flavor> = { world: WORLD, colombia: COLOMBIA };
const FLAVORS_ES: Record<Edition, Flavor> = { world: WORLD_ES, colombia: COLOMBIA };

let current: Edition = "world";

/** Called with each state update (and by the lobby before a room exists). */
export function setEdition(edition: Edition | undefined): void {
  current = edition === "colombia" ? "colombia" : "world";
}

export function flavor(): Flavor {
  return flavorOf(current);
}

export function flavorOf(edition: Edition): Flavor {
  return (locale() === "es" ? FLAVORS_ES : FLAVORS)[edition];
}

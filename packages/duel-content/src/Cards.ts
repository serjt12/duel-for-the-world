import type { ActorCardDefinition } from "./ActorCard";
import type { PolicyCardDefinition } from "./PolicyCard";
import type { ScandalCardDefinition } from "./ScandalCard";
import type {
  ActorCardId,
  CardId,
  ColombiaActorCardId,
  ColombiaPolicyCardId,
  ColombiaScandalCardId,
  PolicyCardId,
  ScandalCardId,
} from "./CardId";
import { WORLD_ACTOR_CARDS, WORLD_POLICY_CARDS, WORLD_SCANDAL_CARDS } from "./WorldCards";
import type { CardDefinition } from "./CardDefinition";

// Edición Colombia: the original 24 cards, played only in that edition.
// (The World Edition's cards are in WorldCards.ts.) Wave 1 was the
// starter pool the core engine was built against; wave 2
// adds on-deploy / on-flip Actors, draw, removal, recall, an opponent-side
// equip and three new Scandal triggers. All figures and events are fictional/satirical, not
// depictions of real people or parties. Numbers are tuned with the
// balance simulator (packages/duel-server/scripts/balance-sim.ts).
const COLOMBIA_ACTOR_CARDS: Record<ColombiaActorCardId, ActorCardDefinition> = {
  agitador: {
    id: "agitador",
    category: "actor",
    edition: "colombia",
    name: "El Agitador",
    role: "militant",
    tier: "grassroots",
    atk: 3,
    def: 1,
    flavorText:
      "Reparte volantes al amanecer y organiza la primera fila de cualquier protesta.",
  },

  "fiscal-de-barrio": {
    id: "fiscal-de-barrio",
    category: "actor",
    edition: "colombia",
    name: "El Fiscal de Barrio",
    role: "enforcer",
    tier: "grassroots",
    atk: 2,
    def: 5,
    flavorText: "Conoce cada expediente y cada excusa — ninguna le sirve.",
  },

  "la-tribuna": {
    id: "la-tribuna",
    category: "actor",
    edition: "colombia",
    name: "La Tribuna",
    role: "orator",
    tier: "grassroots",
    atk: 4,
    def: 2,
    flavorText: "Un discurso bien puesto vale más que cien votos comprados.",
  },

  "operador-politico": {
    id: "operador-politico",
    category: "actor",
    edition: "colombia",
    name: "El Operador Político",
    role: "operator",
    tier: "grassroots",
    atk: 3,
    def: 3,
    flavorText: "Nadie lo recuerda en las fotos, pero todo pasa por sus manos.",
  },

  "el-caudillo": {
    id: "el-caudillo",
    category: "actor",
    edition: "colombia",
    name: "El Caudillo",
    role: "enforcer",
    tier: "establishment",
    atk: 7,
    def: 6,
    flavorText:
      "Antes de llegar aquí tuvo que sacrificar a alguien de confianza — y lo volvería a hacer.",
  },

  // --- Wave 2 ---

  "la-influencer": {
    id: "la-influencer",
    category: "actor",
    edition: "colombia",
    name: "La Influencer",
    role: "orator",
    tier: "grassroots",
    atk: 2,
    def: 2,
    onDeploy: [{ kind: "draw-cards", recipient: "you", count: 1 }],
    flavorText: "Veinte mil seguidores, cero propuestas.",
  },

  "concejal-veterano": {
    id: "concejal-veterano",
    category: "actor",
    edition: "colombia",
    name: "El Concejal Veterano",
    role: "operator",
    tier: "grassroots",
    atk: 3,
    def: 4,
    flavorText: "Cinco periodos en el cargo y nadie recuerda un solo proyecto suyo.",
  },

  "periodista-investigativa": {
    id: "periodista-investigativa",
    category: "actor",
    edition: "colombia",
    name: "La Periodista Investigativa",
    role: "orator",
    tier: "grassroots",
    atk: 1,
    def: 3,
    onFlip: [{ kind: "change-mandate", recipient: "opponent", amount: -3 }],
    flavorText: "Tiene una grabadora escondida y mucha paciencia.",
  },

  "lider-comunal": {
    id: "lider-comunal",
    category: "actor",
    edition: "colombia",
    name: "El Líder Comunal",
    role: "militant",
    tier: "grassroots",
    atk: 2,
    def: 4,
    onDeploy: [{ kind: "change-mandate", recipient: "you", amount: 2 }],
    flavorText: "Conoce a cada vecino por su nombre y a cada hueco por su fecha.",
  },

  "el-contratista": {
    id: "el-contratista",
    category: "actor",
    edition: "colombia",
    name: "El Contratista",
    role: "operator",
    tier: "grassroots",
    atk: 5,
    def: 2,
    onDeploy: [{ kind: "change-mandate", recipient: "you", amount: -2 }],
    flavorText: "Siempre gana la licitación. Siempre.",
  },

  "el-registrador": {
    id: "el-registrador",
    category: "actor",
    edition: "colombia",
    name: "El Registrador",
    role: "enforcer",
    tier: "grassroots",
    atk: 1,
    def: 6,
    flavorText: "Cuenta los votos. A veces, dos veces.",
  },

  "la-senadora-eterna": {
    id: "la-senadora-eterna",
    category: "actor",
    edition: "colombia",
    name: "La Senadora Eterna",
    role: "orator",
    tier: "establishment",
    atk: 6,
    def: 7,
    onDeploy: [{ kind: "draw-cards", recipient: "you", count: 1 }],
    flavorText: "Heredó la curul, el apellido y los enemigos.",
  },

  "el-expresidente": {
    id: "el-expresidente",
    category: "actor",
    edition: "colombia",
    name: "El Expresidente",
    role: "enforcer",
    tier: "establishment",
    atk: 8,
    def: 5,
    onDeploy: [{ kind: "change-mandate", recipient: "opponent", amount: -2 }],
    flavorText: "Se retiró tres veces. Volvió cuatro.",
  },
};

const COLOMBIA_POLICY_CARDS: Record<ColombiaPolicyCardId, PolicyCardDefinition> = {
  "decreto-de-emergencia": {
    id: "decreto-de-emergencia",
    category: "policy",
    edition: "colombia",
    name: "Decreto de Emergencia",
    kind: "normal",
    onActivate: [{ kind: "change-mandate", recipient: "you", amount: 5 }],
    flavorText: "Firmado a medianoche, cuestionado al amanecer.",
  },

  "maletin-de-sobornos": {
    id: "maletin-de-sobornos",
    category: "policy",
    edition: "colombia",
    name: "Maletín de Sobornos",
    kind: "equip",
    attachTo: "your-actor",
    whileEquipped: { atk: 2, def: 2 },
    flavorText: "Abre puertas que ningún argumento podría.",
  },

  // --- Wave 2 ---

  "encuesta-amanada": {
    id: "encuesta-amanada",
    category: "policy",
    edition: "colombia",
    name: "Encuesta Amañada",
    kind: "normal",
    onActivate: [{ kind: "draw-cards", recipient: "you", count: 2 }],
    flavorText: "El 87% de los encuestados estaba en la nómina.",
  },

  "nombramiento-diplomatico": {
    id: "nombramiento-diplomatico",
    category: "policy",
    edition: "colombia",
    name: "Nombramiento Diplomático",
    kind: "normal",
    target: "opponent-actor",
    onActivate: [{ kind: "send-target-to-embassy" }],
    flavorText: "Felicitaciones, señor embajador. Por favor, no vuelva.",
  },

  "llamado-a-consultas": {
    id: "llamado-a-consultas",
    category: "policy",
    edition: "colombia",
    name: "Llamado a Consultas",
    kind: "normal",
    onActivate: [{ kind: "retrieve-from-embassy", from: "yours", filter: { category: "actor" }, to: "hand" }],
    flavorText: "El embajador regresa \"por motivos personales\".",
  },

  "campana-de-desprestigio": {
    id: "campana-de-desprestigio",
    category: "policy",
    edition: "colombia",
    name: "Campaña de Desprestigio",
    kind: "equip",
    attachTo: "opponent-actor",
    whileEquipped: { atk: -3, def: 0 },
    flavorText: "Nadie sabe quién pagó las vallas.",
  },

  "subsidio-electoral": {
    id: "subsidio-electoral",
    category: "policy",
    edition: "colombia",
    name: "Subsidio Electoral",
    kind: "equip",
    attachTo: "your-actor",
    whileEquipped: { atk: 1, def: 3 },
    flavorText: "Llega justo antes de elecciones. Se va justo después.",
  },
};

const COLOMBIA_SCANDAL_CARDS: Record<ColombiaScandalCardId, ScandalCardDefinition> = {
  "escandalo-de-corrupcion": {
    id: "escandalo-de-corrupcion",
    category: "scandal",
    edition: "colombia",
    name: "Escándalo de Corrupción",
    kind: "normal",
    trigger: {
      event: "attack-on-your-actor",
      responses: [{ kind: "destroy-attacker" }],
    },
    flavorText: "Sale en primera plana justo cuando más duele.",
  },

  // --- Wave 2 ---

  chuzadas: {
    id: "chuzadas",
    category: "scandal",
    edition: "colombia",
    name: "Chuzadas",
    kind: "normal",
    trigger: {
      event: "direct-attack-on-you",
      responses: [{ kind: "destroy-attacker" }],
    },
    flavorText: "Alguien estaba escuchando. Siempre hay alguien escuchando.",
  },

  "mocion-de-censura": {
    id: "mocion-de-censura",
    category: "scandal",
    edition: "colombia",
    name: "Moción de Censura",
    kind: "normal",
    trigger: {
      event: "opponent-deploys-establishment",
      responses: [{ kind: "send-deployed-to-embassy" }],
    },
    flavorText: "Ciento dos votos a favor, uno en contra y el acusado de vacaciones.",
  },

  "filtracion-a-la-prensa": {
    id: "filtracion-a-la-prensa",
    category: "scandal",
    edition: "colombia",
    name: "Filtración a la Prensa",
    kind: "normal",
    trigger: {
      event: "attack-on-your-actor",
      responses: [{ kind: "change-mandate", recipient: "opponent", amount: -3 }],
    },
    flavorText: "Fuentes cercanas confirmaron lo que todos sospechaban.",
  },
};

export const ACTOR_CARDS: Record<ActorCardId, ActorCardDefinition> = {
  ...COLOMBIA_ACTOR_CARDS,
  ...WORLD_ACTOR_CARDS,
};

export const POLICY_CARDS: Record<PolicyCardId, PolicyCardDefinition> = {
  ...COLOMBIA_POLICY_CARDS,
  ...WORLD_POLICY_CARDS,
};

export const SCANDAL_CARDS: Record<ScandalCardId, ScandalCardDefinition> = {
  ...COLOMBIA_SCANDAL_CARDS,
  ...WORLD_SCANDAL_CARDS,
};

export const CARDS: Record<CardId, CardDefinition> = {
  ...ACTOR_CARDS,
  ...POLICY_CARDS,
  ...SCANDAL_CARDS,
};

// Spanish translations for World Edition card content (Phase C of
// claude/palacio_i18n_plan.md). Keyed by card id -- the id itself never
// changes (game logic and save data depend on it); only the display text
// moves here.
//
// Edición Colombia's 24 cards are authored directly in Spanish in
// packages/duel-content/src/Cards.ts and are never looked up here -- see
// i18n/cardText.ts's localizedCardName()/localizedCardFlavor(), which
// only consult this table and otherwise fall through to the card's own
// (already-correct) text.
//
// Translation notes: same register as the rest of the Spanish strings
// (plain, a little wry, not a stiff literal translation) -- see
// i18n/locales/es.ts's header note.

import type { CardId } from "@duel-for-the-world/duel-content";

export interface CardTextEntry {
  name: string;
  flavorText: string;
}

export const WORLD_CARD_TEXT_ES: Partial<Record<CardId, CardTextEntry>> = {
  // --- Actors: Grassroots -------------------------------------------------
  protester: {
    name: "El Manifestante",
    flavorText: "Tiene un cartel para cada ocasión. A veces, el mismo cartel.",
  },
  "riot-cop": {
    name: "El Policía Antidisturbios",
    flavorText: "Escudo arriba, visera abajo, opinión reservada.",
  },
  intern: {
    name: "El Pasante",
    flavorText: "Sin sueldo, con exceso de trabajo, y manejando el ministerio en secreto.",
  },
  pollster: {
    name: "El Encuestador",
    flavorText: "Margen de error: sí.",
  },
  "party-loyalist": {
    name: "El Fiel del Partido",
    flavorText: "Votó la línea del partido incluso después de que el partido se fuera.",
  },
  "talk-show-host": {
    name: "El Presentador de Entrevistas",
    flavorText: "Haciendo las preguntas que nadie hizo.",
  },
  bureaucrat: {
    name: "El Burócrata",
    flavorText: "Su solicitud ha sido recibida y será ignorada en el orden en que llegó.",
  },
  lobbyist: {
    name: "El Cabildero",
    flavorText: "Toda ley tiene un autor. Pocos fueron elegidos.",
  },
  ghostwriter: {
    name: "El Escritor Fantasma",
    flavorText: "Escribió tres autobiografías este año. Ninguna suya.",
  },
  whistleblower: {
    name: "El Denunciante",
    flavorText: "Guardó los recibos. Después guardó copias de los recibos.",
  },
  "revolving-door-consultant": {
    name: "El Consultor",
    flavorText: "Regula la industria el lunes. Se une a su junta directiva el viernes.",
  },
  defector: {
    name: "El Tránsfuga",
    flavorText: "Cambió de partido a mitad de frase.",
  },

  // --- Actors: Establishment -----------------------------------------------
  "career-senator": {
    name: "El Senador de Carrera",
    flavorText: "Elegido por primera vez antes de internet. Todavía no está seguro de que sea real.",
  },
  "media-mogul": {
    name: "El Magnate de los Medios",
    flavorText: "Es dueño de las noticias, del canal, y de la opinión del canal.",
  },
  "party-chairman": {
    name: "El Presidente del Partido",
    flavorText: "Disciplina, unidad, y una lista de nombres muy larga.",
  },
  "comeback-kid": {
    name: "El Rey del Regreso",
    flavorText: "Renunció en desgracia. Volvió en triunfo. Programado para repetir.",
  },

  // --- Actors: Leaders -------------------------------------------------------
  "eternal-incumbent": {
    name: "El Incumbente Eterno",
    flavorText: "Los límites de mandato son más una sugerencia.",
  },
  "tweeting-tycoon": {
    name: "El Magnate Tuitero",
    flavorText: "Anuncia la política a las 3 a.m. La revierte a las 3:05.",
  },
  "referendum-czar": {
    name: "El Zar del Referendo",
    flavorText: "Ganó con el 99.8%. El otro 0.2% está siendo investigado.",
  },
  "algorithm-chairman": {
    name: "El Presidente del Algoritmo",
    flavorText: "Sabe cómo vas a votar antes que tú.",
  },
  "oil-baron": {
    name: "El Magnate Petrolero",
    flavorText: "La diplomacia es solo geología con apretones de manos.",
  },
  "lifelong-generalissimo": {
    name: "El Generalísimo",
    flavorText: "El uniforme no se quita por nadie.",
  },
  "victim-in-chief": {
    name: "La Víctima en Jefe",
    flavorText: "Cada derrota es prueba de cuánto le temen.",
  },
  "government-in-exile": {
    name: "El Gobierno en el Exilio",
    flavorText: "Gobierna desde el lobby de un hotel. Muy popular en el hotel.",
  },

  // --- Policies --------------------------------------------------------------
  "presidential-pardon": {
    name: "Indulto Presidencial",
    flavorText: "Firmado con la misma pluma que la acusación.",
  },
  "political-comeback": {
    name: "Regreso Político",
    flavorText: "Nadie se queda enterrado en la política.",
  },
  "declassified-files": {
    name: "Archivos Desclasificados",
    flavorText: "Censurados, descensurados, vueltos a censurar, filtrados.",
  },
  "bot-farm": {
    name: "Granja de Bots",
    flavorText: "Diez mil simpatizantes de base. Un solo cuarto de servidores.",
  },
  "stimulus-package": {
    name: "Paquete de Estímulo",
    flavorText: "Llega justo a tiempo para la elección.",
  },
  "lobbying-deal": {
    name: "Acuerdo de Cabildeo",
    flavorText: "Nada ilegal. Tampoco nada por escrito.",
  },
  "attack-ad": {
    name: "Anuncio Negativo",
    flavorText: "Pagado por Ciudadanos para Decir Cosas.",
  },
  "persona-non-grata": {
    name: "Persona Non Grata",
    flavorText: "Sus servicios ya no son requeridos. Tampoco su visa.",
  },
  "international-summit": {
    name: "Cumbre Internacional",
    flavorText: "Dos días de fotos. Un párrafo de acuerdo.",
  },

  // --- Scandals ----------------------------------------------------------
  "leaked-emails": {
    name: "Correos Filtrados",
    flavorText: "Por favor borra este correo. -- Enviado a 400 personas.",
  },
  impeachment: {
    name: "Juicio Político",
    flavorText: "Los votos están listos. El abogado también.",
  },
  martyrdom: {
    name: "Martirio",
    flavorText: "Lo derribaron, y sus encuestas subieron.",
  },
  "hot-mic": {
    name: "Micrófono Abierto",
    flavorText: "Olvidó que el micrófono estaba encendido. El micrófono no lo olvidó.",
  },
  "paper-trail": {
    name: "Rastro de Papel",
    flavorText: "Toda firma lleva a algún lado.",
  },
  recount: {
    name: "Reconteo",
    flavorText: "Seguiremos contando hasta que nos guste el número.",
  },
};

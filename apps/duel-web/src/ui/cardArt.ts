import type { CardId } from "@project-palacio/duel-content";

// Card illustrations: original cartoon archetypes, not depictions of any
// real person (same house rule as the card content itself).
//
// Each URL is a static `new URL("...", import.meta.url)` literal on
// purpose: Vite recognizes exactly this pattern and bundles/fingerprints
// the file at build time, and it also works natively in any ES-module
// browser context -- no bundler-specific `import x from "*.svg"` typing
// needed. Keep them as literal strings (not built from a template) or
// Vite can no longer see them statically.
export const CARD_ART: Record<CardId, string> = {
  agitador: new URL("../assets/cards/agitador.svg", import.meta.url).href,
  "fiscal-de-barrio": new URL("../assets/cards/fiscal-de-barrio.svg", import.meta.url).href,
  "la-tribuna": new URL("../assets/cards/la-tribuna.svg", import.meta.url).href,
  "operador-politico": new URL("../assets/cards/operador-politico.svg", import.meta.url).href,
  "el-caudillo": new URL("../assets/cards/el-caudillo.svg", import.meta.url).href,
  "decreto-de-emergencia": new URL("../assets/cards/decreto-de-emergencia.svg", import.meta.url)
    .href,
  "maletin-de-sobornos": new URL("../assets/cards/maletin-de-sobornos.svg", import.meta.url).href,
  "escandalo-de-corrupcion": new URL("../assets/cards/escandalo-de-corrupcion.svg", import.meta.url)
    .href,
  // Wave 2
  "la-influencer": new URL("../assets/cards/la-influencer.svg", import.meta.url).href,
  "concejal-veterano": new URL("../assets/cards/concejal-veterano.svg", import.meta.url).href,
  "periodista-investigativa": new URL("../assets/cards/periodista-investigativa.svg", import.meta.url).href,
  "lider-comunal": new URL("../assets/cards/lider-comunal.svg", import.meta.url).href,
  "el-contratista": new URL("../assets/cards/el-contratista.svg", import.meta.url).href,
  "el-registrador": new URL("../assets/cards/el-registrador.svg", import.meta.url).href,
  "la-senadora-eterna": new URL("../assets/cards/la-senadora-eterna.svg", import.meta.url).href,
  "el-expresidente": new URL("../assets/cards/el-expresidente.svg", import.meta.url).href,
  "encuesta-amanada": new URL("../assets/cards/encuesta-amanada.svg", import.meta.url).href,
  "nombramiento-diplomatico": new URL("../assets/cards/nombramiento-diplomatico.svg", import.meta.url).href,
  "llamado-a-consultas": new URL("../assets/cards/llamado-a-consultas.svg", import.meta.url).href,
  "campana-de-desprestigio": new URL("../assets/cards/campana-de-desprestigio.svg", import.meta.url).href,
  "subsidio-electoral": new URL("../assets/cards/subsidio-electoral.svg", import.meta.url).href,
  "chuzadas": new URL("../assets/cards/chuzadas.svg", import.meta.url).href,
  "mocion-de-censura": new URL("../assets/cards/mocion-de-censura.svg", import.meta.url).href,
  "filtracion-a-la-prensa": new URL("../assets/cards/filtracion-a-la-prensa.svg", import.meta.url).href,
  // World Edition
  "protester": new URL("../assets/cards/protester.svg", import.meta.url).href,
  "riot-cop": new URL("../assets/cards/riot-cop.svg", import.meta.url).href,
  "intern": new URL("../assets/cards/intern.svg", import.meta.url).href,
  "pollster": new URL("../assets/cards/pollster.svg", import.meta.url).href,
  "party-loyalist": new URL("../assets/cards/party-loyalist.svg", import.meta.url).href,
  "talk-show-host": new URL("../assets/cards/talk-show-host.svg", import.meta.url).href,
  "bureaucrat": new URL("../assets/cards/bureaucrat.svg", import.meta.url).href,
  "lobbyist": new URL("../assets/cards/lobbyist.svg", import.meta.url).href,
  "ghostwriter": new URL("../assets/cards/ghostwriter.svg", import.meta.url).href,
  "whistleblower": new URL("../assets/cards/whistleblower.svg", import.meta.url).href,
  "revolving-door-consultant": new URL("../assets/cards/revolving-door-consultant.svg", import.meta.url).href,
  "defector": new URL("../assets/cards/defector.svg", import.meta.url).href,
  "career-senator": new URL("../assets/cards/career-senator.svg", import.meta.url).href,
  "media-mogul": new URL("../assets/cards/media-mogul.svg", import.meta.url).href,
  "party-chairman": new URL("../assets/cards/party-chairman.svg", import.meta.url).href,
  "comeback-kid": new URL("../assets/cards/comeback-kid.svg", import.meta.url).href,
  "eternal-incumbent": new URL("../assets/cards/eternal-incumbent.svg", import.meta.url).href,
  "tweeting-tycoon": new URL("../assets/cards/tweeting-tycoon.svg", import.meta.url).href,
  "referendum-czar": new URL("../assets/cards/referendum-czar.svg", import.meta.url).href,
  "algorithm-chairman": new URL("../assets/cards/algorithm-chairman.svg", import.meta.url).href,
  "oil-baron": new URL("../assets/cards/oil-baron.svg", import.meta.url).href,
  "lifelong-generalissimo": new URL("../assets/cards/lifelong-generalissimo.svg", import.meta.url).href,
  "victim-in-chief": new URL("../assets/cards/victim-in-chief.svg", import.meta.url).href,
  "government-in-exile": new URL("../assets/cards/government-in-exile.svg", import.meta.url).href,
  "presidential-pardon": new URL("../assets/cards/presidential-pardon.svg", import.meta.url).href,
  "political-comeback": new URL("../assets/cards/political-comeback.svg", import.meta.url).href,
  "declassified-files": new URL("../assets/cards/declassified-files.svg", import.meta.url).href,
  "bot-farm": new URL("../assets/cards/bot-farm.svg", import.meta.url).href,
  "stimulus-package": new URL("../assets/cards/stimulus-package.svg", import.meta.url).href,
  "lobbying-deal": new URL("../assets/cards/lobbying-deal.svg", import.meta.url).href,
  "attack-ad": new URL("../assets/cards/attack-ad.svg", import.meta.url).href,
  "persona-non-grata": new URL("../assets/cards/persona-non-grata.svg", import.meta.url).href,
  "international-summit": new URL("../assets/cards/international-summit.svg", import.meta.url).href,
  "leaked-emails": new URL("../assets/cards/leaked-emails.svg", import.meta.url).href,
  "impeachment": new URL("../assets/cards/impeachment.svg", import.meta.url).href,
  "martyrdom": new URL("../assets/cards/martyrdom.svg", import.meta.url).href,
  "hot-mic": new URL("../assets/cards/hot-mic.svg", import.meta.url).href,
  "paper-trail": new URL("../assets/cards/paper-trail.svg", import.meta.url).href,
  "recount": new URL("../assets/cards/recount.svg", import.meta.url).href,
};

export const CARD_BACK_ART: string = new URL("../assets/cards/card-back.svg", import.meta.url).href;

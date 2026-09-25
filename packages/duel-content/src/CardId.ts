// Edición Colombia (the original 24 cards).
export type ColombiaActorCardId =
  | "agitador"
  | "fiscal-de-barrio"
  | "la-tribuna"
  | "operador-politico"
  | "el-caudillo"
  | "la-influencer"
  | "concejal-veterano"
  | "periodista-investigativa"
  | "lider-comunal"
  | "el-contratista"
  | "el-registrador"
  | "la-senadora-eterna"
  | "el-expresidente";

export type ColombiaPolicyCardId =
  | "decreto-de-emergencia"
  | "maletin-de-sobornos"
  | "encuesta-amanada"
  | "nombramiento-diplomatico"
  | "llamado-a-consultas"
  | "campana-de-desprestigio"
  | "subsidio-electoral";

export type ColombiaScandalCardId =
  | "escandalo-de-corrupcion"
  | "chuzadas"
  | "mocion-de-censura"
  | "filtracion-a-la-prensa";

// PALACIO -- World Edition.
export type WorldActorCardId =
  // Grassroots
  | "protester"
  | "riot-cop"
  | "intern"
  | "pollster"
  | "party-loyalist"
  | "talk-show-host"
  | "bureaucrat"
  | "lobbyist"
  | "ghostwriter"
  | "whistleblower"
  | "revolving-door-consultant"
  | "defector"
  // Establishment
  | "career-senator"
  | "media-mogul"
  | "party-chairman"
  | "comeback-kid"
  // Leaders
  | "eternal-incumbent"
  | "tweeting-tycoon"
  | "referendum-czar"
  | "algorithm-chairman"
  | "oil-baron"
  | "lifelong-generalissimo"
  | "victim-in-chief"
  | "government-in-exile";

export type WorldPolicyCardId =
  | "presidential-pardon"
  | "political-comeback"
  | "declassified-files"
  | "bot-farm"
  | "stimulus-package"
  | "lobbying-deal"
  | "attack-ad"
  | "persona-non-grata"
  | "international-summit";

export type WorldScandalCardId =
  | "leaked-emails"
  | "impeachment"
  | "martyrdom"
  | "hot-mic"
  | "paper-trail"
  | "recount";

export type ActorCardId = ColombiaActorCardId | WorldActorCardId;
export type PolicyCardId = ColombiaPolicyCardId | WorldPolicyCardId;
export type ScandalCardId = ColombiaScandalCardId | WorldScandalCardId;

export type CardId = ActorCardId | PolicyCardId | ScandalCardId;

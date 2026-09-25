import type { ActorCardDefinition } from "./ActorCard";
import type { PolicyCardDefinition } from "./PolicyCard";
import type { ScandalCardDefinition } from "./ScandalCard";
import type { WorldActorCardId, WorldPolicyCardId, WorldScandalCardId } from "./CardId";

// PALACIO -- World Edition: the global base game (English only).
//
// Every card is an ARCHETYPE: its power copies a political behavior many
// real leaders share, which is what makes it recognizable -- never a
// portrait of any one real person. The factions are fictional powers.
//
// Balance budget (tuned by the bot simulation in the sandbox, see the
// project notes): a vanilla Grassroots Actor is worth 7 stat points;
// effects are paid for with stats. Establishment and Leaders cost a
// tribute and sit around 12-13 points plus their ability.

const actor = (card: Omit<ActorCardDefinition, "category" | "edition">): ActorCardDefinition => ({
  category: "actor",
  edition: "world",
  ...card,
});

export const WORLD_ACTOR_CARDS: Record<WorldActorCardId, ActorCardDefinition> = {
  // --- Grassroots -------------------------------------------------------
  protester: actor({
    id: "protester",
    name: "The Protester",
    role: "militant",
    tier: "grassroots",
    rarity: "common",
    atk: 4,
    def: 4,
    flavorText: "Has a sign for every occasion. Sometimes the same sign.",
  }),
  "riot-cop": actor({
    id: "riot-cop",
    name: "The Riot Cop",
    role: "enforcer",
    tier: "grassroots",
    rarity: "common",
    atk: 3,
    def: 6,
    flavorText: "Shield up, visor down, opinions withheld.",
  }),
  intern: actor({
    id: "intern",
    name: "The Intern",
    role: "operator",
    tier: "grassroots",
    rarity: "common",
    atk: 1,
    def: 4,
    onDeploy: [{ kind: "draw-cards", recipient: "you", count: 1 }],
    flavorText: "Unpaid, overworked, and secretly running the ministry.",
  }),
  pollster: actor({
    id: "pollster",
    name: "The Pollster",
    role: "orator",
    tier: "grassroots",
    rarity: "common",
    atk: 2,
    def: 3,
    onDeploy: [{ kind: "gain-votes", amount: 2 }],
    flavorText: "Margin of error: yes.",
  }),
  "party-loyalist": actor({
    id: "party-loyalist",
    name: "The Party Loyalist",
    role: "militant",
    tier: "grassroots",
    rarity: "common",
    atk: 3,
    def: 2,
    onSentToEmbassy: [{ kind: "change-mandate", recipient: "you", amount: 2 }],
    flavorText: "Voted the party line even after the party left.",
  }),
  "talk-show-host": actor({
    id: "talk-show-host",
    name: "The Talk-Show Host",
    role: "orator",
    tier: "grassroots",
    rarity: "common",
    atk: 3,
    def: 3,
    onDeploy: [{ kind: "change-mandate", recipient: "opponent", amount: -2 }],
    flavorText: "Asking the questions nobody asked.",
  }),
  bureaucrat: actor({
    id: "bureaucrat",
    name: "The Bureaucrat",
    role: "enforcer",
    tier: "grassroots",
    rarity: "common",
    atk: 0,
    def: 7,
    flavorText: "Your request has been received and will be ignored in the order it arrived.",
  }),
  lobbyist: actor({
    id: "lobbyist",
    name: "The Lobbyist",
    role: "operator",
    tier: "grassroots",
    rarity: "uncommon",
    atk: 2,
    def: 2,
    onDeploy: [{ kind: "retrieve-from-embassy", from: "yours", filter: { category: "policy" }, to: "hand" }],
    flavorText: "Every law has an author. Few of them were elected.",
  }),
  ghostwriter: actor({
    id: "ghostwriter",
    name: "The Ghostwriter",
    role: "orator",
    tier: "grassroots",
    rarity: "uncommon",
    atk: 1,
    def: 3,
    onFlip: [{ kind: "retrieve-from-embassy", from: "yours", filter: { category: "actor" }, to: "hand" }],
    flavorText: "Wrote three autobiographies this year. None of them his.",
  }),
  whistleblower: actor({
    id: "whistleblower",
    name: "The Whistleblower",
    role: "orator",
    tier: "grassroots",
    rarity: "uncommon",
    atk: 1,
    def: 3,
    onFlip: [{ kind: "change-mandate", recipient: "opponent", amount: -3 }],
    flavorText: "Kept the receipts. Then kept copies of the receipts.",
  }),
  "revolving-door-consultant": actor({
    id: "revolving-door-consultant",
    name: "The Consultant",
    role: "operator",
    tier: "grassroots",
    rarity: "uncommon",
    atk: 2,
    def: 2,
    onSentToEmbassy: [{ kind: "retrieve-from-embassy", from: "yours", filter: { category: "actor" }, to: "hand" }],
    flavorText: "Regulates the industry on Monday. Joins its board on Friday.",
  }),
  defector: actor({
    id: "defector",
    name: "The Defector",
    role: "militant",
    tier: "grassroots",
    rarity: "uncommon",
    atk: 2,
    def: 2,
    onDeploy: [{ kind: "retrieve-from-embassy", from: "opponents", filter: { category: "actor" }, to: "hand" }],
    flavorText: "Changed parties mid-sentence.",
  }),

  // --- Establishment (tribute 1) -----------------------------------------
  "career-senator": actor({
    id: "career-senator",
    name: "The Career Senator",
    role: "orator",
    tier: "establishment",
    atk: 5,
    def: 6,
    flavorText: "First elected before the internet. Still not sure it's real.",
  }),
  "media-mogul": actor({
    id: "media-mogul",
    name: "The Media Mogul",
    role: "operator",
    tier: "establishment",
    atk: 4,
    def: 4,
    onDeploy: [{ kind: "draw-cards", recipient: "you", count: 2 }],
    flavorText: "Owns the news, the channel, and the channel's opinion.",
  }),
  "party-chairman": actor({
    id: "party-chairman",
    name: "The Party Chairman",
    role: "enforcer",
    tier: "establishment",
    atk: 5,
    def: 5,
    passives: [{ kind: "buff-others", atk: 0, def: 1 }],
    flavorText: "Discipline, unity, and a very long list of names.",
  }),
  "comeback-kid": actor({
    id: "comeback-kid",
    name: "The Comeback Kid",
    role: "militant",
    tier: "establishment",
    atk: 5,
    def: 3,
    onDeploy: [{ kind: "retrieve-from-embassy", from: "yours", filter: { category: "actor", maxAtk: 4 }, to: "field" }],
    flavorText: "Resigned in disgrace. Returned in triumph. Scheduled to repeat.",
  }),

  // --- Leaders (tribute 1, only one in office) ---------------------------
  "eternal-incumbent": actor({
    id: "eternal-incumbent",
    name: "The Eternal Incumbent",
    role: "enforcer",
    tier: "leader",
    atk: 5,
    def: 6,
    passives: [{ kind: "immune-to-effects" }],
    onDeploy: [{ kind: "postpone-election", turns: 2 }],
    flavorText: "Term limits are more of a suggestion.",
  }),
  "tweeting-tycoon": actor({
    id: "tweeting-tycoon",
    name: "The Tweeting Tycoon",
    role: "orator",
    tier: "leader",
    atk: 5,
    def: 4,
    onTurnStart: [
      { kind: "draw-cards", recipient: "you", count: 1 },
      { kind: "discard-oldest", count: 1 },
    ],
    flavorText: "Policy announced at 3 a.m. Policy reversed at 3:05.",
  }),
  "referendum-czar": actor({
    id: "referendum-czar",
    name: "The Referendum Czar",
    role: "enforcer",
    tier: "leader",
    atk: 5,
    def: 5,
    passives: [{ kind: "votes-bonus", amount: 5 }],
    flavorText: "Won with 99.8%. The other 0.2% are being looked into.",
  }),
  "algorithm-chairman": actor({
    id: "algorithm-chairman",
    name: "The Algorithm Chairman",
    role: "operator",
    tier: "leader",
    atk: 5,
    def: 6,
    passives: [{ kind: "reveal-opponent-hidden" }],
    flavorText: "Knows how you'll vote before you do.",
  }),
  "oil-baron": actor({
    id: "oil-baron",
    name: "The Oil Baron",
    role: "operator",
    tier: "leader",
    atk: 5,
    def: 5,
    onTurnStart: [{ kind: "change-mandate", recipient: "you", amount: 2 }],
    flavorText: "Diplomacy is just geology with handshakes.",
  }),
  "lifelong-generalissimo": actor({
    id: "lifelong-generalissimo",
    name: "The Generalissimo",
    role: "militant",
    tier: "leader",
    atk: 5,
    def: 4,
    passives: [{ kind: "buff-others", atk: 1, def: 0 }, { kind: "campaign-only" }],
    flavorText: "The uniform comes off for no one.",
  }),
  "victim-in-chief": actor({
    id: "victim-in-chief",
    name: "The Victim-in-Chief",
    role: "orator",
    tier: "leader",
    atk: 5,
    def: 5,
    passives: [{ kind: "mandate-when-ally-lost", amount: 3 }],
    flavorText: "Every defeat is proof of how much they fear him.",
  }),
  "government-in-exile": actor({
    id: "government-in-exile",
    name: "The Government-in-Exile",
    role: "orator",
    tier: "leader",
    atk: 3,
    def: 5,
    passives: [{ kind: "atk-per-embassy-actor", amount: 1 }],
    flavorText: "Governs from a hotel lobby. Very popular in the hotel.",
  }),
};

// Omit that keeps each member of a union separate (plain Omit would
// collapse the normal/equip variants into their common fields).
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

const policy = (card: DistributiveOmit<PolicyCardDefinition, "category" | "edition">): PolicyCardDefinition =>
  ({ category: "policy", edition: "world", ...card }) as PolicyCardDefinition;

export const WORLD_POLICY_CARDS: Record<WorldPolicyCardId, PolicyCardDefinition> = {
  "presidential-pardon": policy({
    id: "presidential-pardon",
    name: "Presidential Pardon",
    kind: "normal",
    onActivate: [{ kind: "retrieve-from-embassy", from: "yours", filter: { category: "actor" }, to: "hand" }],
    flavorText: "Signed with the same pen as the indictment.",
  }),
  "political-comeback": policy({
    id: "political-comeback",
    name: "Political Comeback",
    kind: "normal",
    onActivate: [{ kind: "retrieve-from-embassy", from: "yours", filter: { category: "actor", maxAtk: 4 }, to: "field" }],
    flavorText: "Nobody stays buried in politics.",
  }),
  "declassified-files": policy({
    id: "declassified-files",
    name: "Declassified Files",
    kind: "normal",
    onActivate: [{ kind: "retrieve-from-embassy", from: "opponents", filter: { category: "policy" }, to: "hand" }],
    flavorText: "Redacted, un-redacted, re-redacted, leaked.",
  }),
  "bot-farm": policy({
    id: "bot-farm",
    name: "Bot Farm",
    kind: "normal",
    onActivate: [{ kind: "gain-votes", amount: 3 }],
    flavorText: "Ten thousand grassroots supporters. One server room.",
  }),
  "stimulus-package": policy({
    id: "stimulus-package",
    name: "Stimulus Package",
    kind: "normal",
    onActivate: [
      { kind: "change-mandate", recipient: "you", amount: 3 },
      { kind: "draw-cards", recipient: "you", count: 1 },
    ],
    flavorText: "Arrives just in time for the election.",
  }),
  "lobbying-deal": policy({
    id: "lobbying-deal",
    name: "Lobbying Deal",
    kind: "equip",
    attachTo: "your-actor",
    whileEquipped: { atk: 1, def: 1 },
    flavorText: "Nothing illegal. Nothing written down, either.",
  }),
  "attack-ad": policy({
    id: "attack-ad",
    name: "Attack Ad",
    kind: "equip",
    attachTo: "opponent-actor",
    whileEquipped: { atk: -1, def: -1 },
    flavorText: "Paid for by Citizens for Saying Things.",
  }),
  "persona-non-grata": policy({
    id: "persona-non-grata",
    name: "Persona Non Grata",
    kind: "normal",
    target: "opponent-actor",
    targetMaxAtk: 4,
    onActivate: [{ kind: "send-target-to-embassy" }],
    flavorText: "Your services are no longer required. Neither is your visa.",
  }),
  "international-summit": policy({
    id: "international-summit",
    name: "International Summit",
    kind: "normal",
    onActivate: [
      { kind: "draw-cards", recipient: "you", count: 2 },
      { kind: "draw-cards", recipient: "opponent", count: 1 },
    ],
    flavorText: "Two days of photos. One paragraph of agreement.",
  }),
};

const scandal = (card: Omit<ScandalCardDefinition, "category" | "edition" | "kind">): ScandalCardDefinition => ({
  category: "scandal",
  edition: "world",
  kind: "normal",
  ...card,
});

export const WORLD_SCANDAL_CARDS: Record<WorldScandalCardId, ScandalCardDefinition> = {
  "leaked-emails": scandal({
    id: "leaked-emails",
    name: "Leaked Emails",
    trigger: { event: "attack-on-your-actor", responses: [{ kind: "change-mandate", recipient: "opponent", amount: -4 }] },
    flavorText: "Please delete this email. -- Sent to 400 people.",
  }),
  impeachment: scandal({
    id: "impeachment",
    name: "Impeachment",
    // Removing a head of government is expensive for everyone involved.
    trigger: {
      event: "opponent-deploys-establishment",
      responses: [{ kind: "send-deployed-to-embassy" }, { kind: "change-mandate", recipient: "you", amount: -5 }],
    },
    flavorText: "The votes are in. So is the lawyer.",
  }),
  martyrdom: scandal({
    id: "martyrdom",
    name: "Martyrdom",
    trigger: {
      event: "your-actor-destroyed-in-battle",
      responses: [{ kind: "return-destroyed-to-hand" }, { kind: "change-mandate", recipient: "you", amount: 2 }],
    },
    flavorText: "They struck him down, and his polling went up.",
  }),
  "hot-mic": scandal({
    id: "hot-mic",
    name: "Hot Mic",
    trigger: { event: "direct-attack-on-you", responses: [{ kind: "destroy-attacker" }] },
    flavorText: "He forgot the microphone was on. The microphone did not forget.",
  }),
  "paper-trail": scandal({
    id: "paper-trail",
    name: "Paper Trail",
    trigger: { event: "opponent-activates-policy", responses: [{ kind: "change-mandate", recipient: "opponent", amount: -2 }] },
    flavorText: "Every signature leads somewhere.",
  }),
  recount: scandal({
    id: "recount",
    name: "Recount",
    trigger: { event: "election-night", responses: [{ kind: "gain-votes", amount: 4 }] },
    flavorText: "We'll keep counting until we like the number.",
  }),
};

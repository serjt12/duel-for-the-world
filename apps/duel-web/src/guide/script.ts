import type { CardId } from "@project-palacio/duel-content";
import type { DuelistId } from "@project-palacio/duel-engine";
import type { PlayerAction, PublicDuelState, PublicFieldActor } from "@project-palacio/duel-server";

// The guided first duel: a short, fully scripted World Edition match that
// teaches the basics one step at a time. Both decks are stacked, the
// computer follows a fixed script (ScriptedSeat.ts) and the election comes
// early (after turn 6), so the whole lesson takes a few minutes.
//
// Every step either waits for "Next", waits for one specific move (other
// moves are blocked with a nudge), or waits while the computer plays.
// Steps are pure data over the public state, so the script can be played
// through headlessly and checked (see guide/__tests__).

export const GUIDE_YOU: DuelistId = "duelist1";
export const GUIDE_THEM: DuelistId = "duelist2";
export const GUIDE_ELECTION_TURN = 6;

const FILLER: CardId[] = ["bureaucrat", "party-loyalist", "intern", "bureaucrat", "party-loyalist", "intern"];

// Draw order: the first 5 are the opening hand; you go first (no draw on
// turn 1), then draw on turns 3 and 5. The computer draws on 2, 4 and 6.
export const GUIDE_DECKS: { you: CardId[]; them: CardId[] } = {
  you: ["protester", "riot-cop", "hot-mic", "lobbying-deal", "bot-farm", "intern", "pollster", ...FILLER],
  them: ["talk-show-host", "protester", "presidential-pardon", "leaked-emails", "riot-cop", "bureaucrat", "bureaucrat", "bureaucrat", ...FILLER],
};

/** The computer's moves, by "turn:phase". Anything else: it advances. */
export const GUIDE_OPPONENT_SCRIPT: Record<string, PlayerAction[]> = {
  "2:campaign-1": [{ type: "deploy-actor", actorCardId: "talk-show-host", options: { stance: "campaign", facing: "face-up" } }],
  "4:campaign-1": [
    { type: "deploy-actor", actorCardId: "protester", options: { stance: "campaign", facing: "face-up" } },
    // Brings the Talk-Show Host back from its Embassy (the only Actor there).
    { type: "activate-policy", policyCardId: "presidential-pardon" },
    { type: "set-scandal", scandalCardId: "leaked-emails" },
  ],
  "6:campaign-1": [{ type: "deploy-actor", actorCardId: "riot-cop", options: { stance: "resistance", facing: "face-up" } }],
};

// --- What a step can point at ------------------------------------------------

export type GuideTarget =
  | { kind: "hand"; cardId: CardId }
  // A card on the field (found by card, on your side or theirs).
  | { kind: "field"; side: "you" | "them"; cardId: CardId }
  // The opponent's face-down Set cards.
  | { kind: "their-set" }
  // A button in the open card menu, by (the start of) its label.
  | { kind: "menu"; label: string }
  | { kind: "advance" }
  | { kind: "mandate"; side: "you" | "them" }
  | { kind: "embassy"; side: "you" | "them" }
  | { kind: "poll" }
  | { kind: "election" };

export type GuideStep = {
  title: string;
  text: string;
  targets?: GuideTarget[];
  // Where the tip sits on the phone stage: over your Backroom row ("low",
  // the default) or over your opponent's ("high", when your Backroom is
  // what the step is about).
  where?: "low" | "high";
} & (
  | { kind: "next"; button?: string }
  // One specific move: `allow` gates what you send, `done` ends the step.
  | { kind: "do"; allow: (action: PlayerAction, view: PublicDuelState) => boolean; done: (view: PublicDuelState) => boolean }
  // The computer's turn: nothing to do but watch.
  | { kind: "watch"; done: (view: PublicDuelState) => boolean }
  | { kind: "end" }
);

// --- Helpers over the public state -------------------------------------------

function actorOf(view: PublicDuelState, side: DuelistId, cardId: CardId): PublicFieldActor | undefined {
  return view.duelists[side].field.find((actor) => actor.cardId === cardId);
}

/** The instance on the field a target refers to (for highlighting and checks). */
export function fieldInstance(view: PublicDuelState, side: "you" | "them", cardId: CardId): number | null {
  return actorOf(view, side === "you" ? GUIDE_YOU : GUIDE_THEM, cardId)?.instanceId ?? null;
}

const yourTurn = (view: PublicDuelState): boolean => view.activeDuelistId === GUIDE_YOU;
const at = (view: PublicDuelState, turn: number, phase: PublicDuelState["phase"]): boolean =>
  view.turnNumber === turn && view.phase === phase;
const isAdvance = (action: PlayerAction): boolean => action.type === "advance-phase";

function advanceTo(turn: number, phase: PublicDuelState["phase"], title: string, text: string): GuideStep {
  return {
    kind: "do",
    title,
    text,
    targets: [{ kind: "advance" }],
    allow: isAdvance,
    done: (view) => at(view, turn, phase) || view.turnNumber > turn,
  };
}

function endTurn(turn: number, text: string): GuideStep {
  return {
    kind: "do",
    title: "End your turn",
    text,
    targets: [{ kind: "advance" }],
    allow: isAdvance,
    done: (view) => view.turnNumber > turn,
  };
}

function watch(turn: number, text: string): GuideStep {
  return {
    kind: "watch",
    title: "The computer's turn",
    text,
    done: (view) => view.turnNumber > turn && yourTurn(view),
  };
}

function deploys(action: PlayerAction, cardId: CardId, stance: "campaign" | "resistance"): boolean {
  return (
    action.type === "deploy-actor" &&
    action.actorCardId === cardId &&
    action.options.stance === stance &&
    action.options.facing === "face-up"
  );
}

function attacks(action: PlayerAction, view: PublicDuelState, attacker: CardId, target: CardId): boolean {
  return (
    action.type === "declare-attack" &&
    action.attackerInstanceId === fieldInstance(view, "you", attacker) &&
    action.targetInstanceId !== undefined &&
    action.targetInstanceId === fieldInstance(view, "them", target)
  );
}

// --- The lesson ---------------------------------------------------------------

export const GUIDE_STEPS: GuideStep[] = [
  {
    kind: "next",
    button: "Let's go",
    title: "Welcome to Duel for the World",
    text:
      "Two politicians, one Palace. Win by knocking your rival's Mandate down to 0, " +
      "or by leading the count on Election Night. This short duel shows you how.",
    targets: [{ kind: "mandate", side: "you" }, { kind: "mandate", side: "them" }],
  },
  advanceTo(1, "campaign-1", "Phases", "A turn has phases. You're in the Agenda. Tap Advance Phase to reach Campaign 1, where you play cards."),
  {
    kind: "do",
    title: "Deploy an Actor",
    text: "Tap The Protester in your hand, then choose Deploy -- Campaign. (You can also drag it onto an Actor zone.)",
    targets: [{ kind: "hand", cardId: "protester" }, { kind: "menu", label: "Deploy -- Campaign" }],
    allow: (action) => deploys(action, "protester", "campaign"),
    done: (view) => actorOf(view, GUIDE_YOU, "protester") !== undefined,
  },
  {
    kind: "next",
    title: "Campaign stance",
    text:
      "Upright means Campaign: it can attack, and its ATK counts as votes. " +
      "The live poll in the middle shows the count right now. You get one deploy per turn.",
    targets: [{ kind: "field", side: "you", cardId: "protester" }, { kind: "poll" }],
  },
  endTurn(1, "A new Actor can't attack on its first turn. Tap Advance Phase until your turn ends."),
  watch(1, "Watch what the computer plays."),
  {
    kind: "next",
    title: "Ouch: 2 Mandate",
    text:
      "Their Talk-Show Host cost you 2 Mandate the moment it arrived. " +
      "Long-press any card (right-click on a computer) to read it in full.",
    targets: [{ kind: "field", side: "them", cardId: "talk-show-host" }, { kind: "mandate", side: "you" }],
  },
  advanceTo(3, "campaign-1", "Your turn", "You drew a card. Advance to Campaign 1."),
  {
    kind: "do",
    title: "Resistance stance",
    text:
      "Deploy The Riot Cop with Deploy -- Resistance. Sideways, it defends with its DEF (6), " +
      "and no Mandate damage gets through it.",
    targets: [{ kind: "hand", cardId: "riot-cop" }, { kind: "menu", label: "Deploy -- Resistance" }],
    allow: (action) => deploys(action, "riot-cop", "resistance"),
    done: (view) => actorOf(view, GUIDE_YOU, "riot-cop") !== undefined,
  },
  advanceTo(3, "confrontation", "Time to fight", "Advance to the Confrontation phase."),
  {
    kind: "do",
    title: "Attack!",
    text:
      "Tap your Protester (ATK 4), then their Talk-Show Host (ATK 3). " +
      "Higher ATK wins, and the loser's owner loses the difference.",
    targets: [
      { kind: "field", side: "you", cardId: "protester" },
      { kind: "field", side: "them", cardId: "talk-show-host" },
    ],
    allow: (action, view) => attacks(action, view, "protester", "talk-show-host"),
    done: (view) => view.duelists[GUIDE_THEM].archive.includes("talk-show-host"),
  },
  {
    kind: "next",
    title: "Off to the Embassy",
    text:
      "The Host was sent to the Embassy: the discard pile. Both Embassies are public; tap one to look inside. " +
      "Careful: some cards bring Actors back from there.",
    targets: [{ kind: "embassy", side: "them" }, { kind: "mandate", side: "them" }],
  },
  advanceTo(3, "campaign-2", "Campaign 2", "Advance to Campaign 2. You can still play cards after the fighting."),
  {
    kind: "do",
    title: "Set a Scandal",
    text:
      "Hot Mic is a Scandal: a trap. Set it face-down and it fires by itself when its trigger happens " +
      "(here: if they attack you directly).",
    targets: [{ kind: "hand", cardId: "hot-mic" }, { kind: "menu", label: "Set face-down" }],
    where: "high",
    allow: (action) => action.type === "set-scandal" && action.scandalCardId === "hot-mic",
    done: (view) => view.duelists[GUIDE_YOU].setScandals.length > 0,
  },
  endTurn(3, "Advance until your turn ends."),
  watch(3, "The computer is up to something..."),
  {
    kind: "next",
    title: "What just happened",
    text:
      "A Presidential Pardon brought their Host back from the Embassy to their hand. " +
      "They also deployed a Protester and Set a face-down card. Keep an eye on it.",
    targets: [{ kind: "field", side: "them", cardId: "protester" }, { kind: "their-set" }],
  },
  {
    kind: "next",
    title: "Election Night",
    text:
      "In this short duel the votes are counted when the computer's next turn ends. " +
      "Votes = Mandate + ATK of your Campaign Actors + bonus votes. A lead of more than 3 wins.",
    targets: [{ kind: "election" }, { kind: "poll" }],
  },
  advanceTo(5, "campaign-1", "Your turn", "Advance to Campaign 1."),
  {
    kind: "do",
    title: "Play a Policy",
    text: "Bot Farm is a Policy. Tap it and choose Activate: +3 bonus votes on Election Night.",
    targets: [{ kind: "hand", cardId: "bot-farm" }, { kind: "menu", label: "Activate" }],
    allow: (action) => action.type === "activate-policy" && action.policyCardId === "bot-farm",
    done: (view) => view.duelists[GUIDE_YOU].archive.includes("bot-farm"),
  },
  {
    kind: "do",
    title: "Equip an Actor",
    text:
      "Lobbying Deal is an Equip: it stays on one of your Actors. " +
      "Activate it, then tap your Protester: +1 ATK and +1 DEF.",
    targets: [
      { kind: "hand", cardId: "lobbying-deal" },
      { kind: "menu", label: "Activate" },
      { kind: "field", side: "you", cardId: "protester" },
    ],
    where: "high",
    allow: (action, view) =>
      action.type === "activate-policy" &&
      action.policyCardId === "lobbying-deal" &&
      action.options?.targetInstanceId === fieldInstance(view, "you", "protester"),
    done: (view) => view.duelists[GUIDE_YOU].backroomPolicies.some((policy) => policy.cardId === "lobbying-deal"),
  },
  advanceTo(5, "confrontation", "Attack again", "Advance to the Confrontation phase."),
  {
    kind: "do",
    title: "Attack their Protester",
    text: "Your Protester has ATK 5 now. Attack their Protester (ATK 4).",
    targets: [
      { kind: "field", side: "you", cardId: "protester" },
      { kind: "field", side: "them", cardId: "protester" },
    ],
    allow: (action, view) => attacks(action, view, "protester", "protester"),
    done: (view) => actorOf(view, GUIDE_THEM, "protester") === undefined,
  },
  {
    kind: "next",
    title: "Gotcha!",
    text:
      "Their face-down card was Leaked Emails, a Scandal that fires when you attack their Actors. " +
      "It cost you 4 Mandate. You still won the fight, but Scandals can turn a duel around.",
    targets: [{ kind: "mandate", side: "you" }],
  },
  advanceTo(5, "campaign-2", "Campaign 2", "Advance to Campaign 2."),
  {
    kind: "do",
    title: "Stand up for the count",
    text:
      "Tap your Riot Cop and choose Switch to Campaign. In Campaign its ATK 3 counts as votes " +
      "(but it can be attacked for damage).",
    targets: [{ kind: "field", side: "you", cardId: "riot-cop" }, { kind: "menu", label: "Switch to Campaign" }],
    allow: (action, view) =>
      action.type === "change-stance" && action.instanceId === fieldInstance(view, "you", "riot-cop"),
    done: (view) => actorOf(view, GUIDE_YOU, "riot-cop")?.stance === "campaign",
  },
  endTurn(5, "End your turn. The votes are counted when the computer's turn ends."),
  {
    kind: "watch",
    title: "Election Night",
    text: "The computer plays its last turn, then the votes are counted.",
    targets: [{ kind: "poll" }],
    done: (view) => view.winnerId !== null,
  },
  {
    kind: "end",
    title: "Tutorial complete!",
    text:
      "You know the basics: deploying, stances, attacks, Policies, Scandals and the election. " +
      "Ready for a real duel?",
  },
];

import type { ActorCardId, ActorRole, CardId, Edition, PolicyCardId } from "@duel-for-the-world/duel-content";
import type { ActorFacing, ActorStance } from "@duel-for-the-world/duel-engine";
import type { PlayerSlot, PublicDuelState } from "@duel-for-the-world/duel-server";
import type { Headline } from "../ui/eventText";
import type { EmbassyChoice } from "../ui/embassyPicker";

// "menu": the main menu (the app starts here); "lobby": online room
// create/join; "board": a duel in progress (online or vs the computer).
export type Screen = "menu" | "lobby" | "board";

export type AiLevel = "easy" | "normal" | "hard";

// The in-progress steps of playing a card or declaring an attack -- all
// purely local UI state. Nothing is sent to the server until the player
// picks an option; the server is still the only place an action can
// actually succeed or fail.
export type Interaction =
  | { mode: "idle" }
  // The action menu popped up above one card in the hand (by position,
  // since a hand can hold several copies of the same card).
  | { mode: "hand-menu"; handIndex: number }
  // A card was dropped onto a zone: it's drawn sitting in that zone (and
  // hidden from the hand) while a menu right there asks how to play it.
  // `committed` once an option was chosen and sent: the menu closes but
  // the card stays in the zone until the server's reply replaces it (or a
  // rejection sends it back to the hand).
  | {
      mode: "placing";
      handIndex: number;
      cardId: CardId;
      zoneKind: "actor" | "backroom";
      zone: number;
      // Establishment Actor dropped onto one of your Actors: that Actor.
      tributeInstanceId?: number;
      committed: boolean;
    }
  // One of your face-down Set Policies was clicked: its menu is open.
  | { mode: "set-menu"; instanceId: number }
  // One of your Actors on the field was clicked during a Campaign Phase:
  // its menu (change stance) is open.
  | { mode: "actor-menu"; instanceId: number }
  // An Establishment Actor was played from the hand menu: pick one of
  // your Actors on the field to tribute.
  | { mode: "choosing-tribute"; cardId: ActorCardId; stance: ActorStance; facing: ActorFacing }
  // A Policy that needs a target (an Equip, or a targeted Normal Policy
  // like Nombramiento Diplomatico) is being activated: pick the Actor --
  // yours or your opponent's, depending on the card (see duel-engine's
  // policyTarget). It comes either from the hand (optionally already
  // placed in a Backroom zone) or from one of your Set Policies.
  | {
      mode: "choosing-policy-target";
      cardId: PolicyCardId;
      source: { kind: "hand"; handIndex: number; zone?: number } | { kind: "set"; instanceId: number };
    }
  // One of your Actors was clicked to attack: pick its target.
  | { mode: "choosing-attack-target"; attackerInstanceId: number };

export interface ClientState {
  screen: Screen;
  // Offline vs the computer, or online vs a person.
  mode: "offline" | "online";
  // The "Play vs Computer" setup on the main menu (remembered between visits).
  menuStep: "main" | "vs-computer";
  aiLevel: AiLevel;
  aiEdition: Edition;
  // Offline: the computer is taking its turn.
  aiThinking: boolean;
  // How the other side is named on the board ("Opponent", "Computer · Hard").
  opponentName: string;
  connectionOpen: boolean;
  roomCodeInput: string;
  roomCode: string | null;
  you: PlayerSlot | null;
  duel: PublicDuelState | null;
  statusLine: string | null;
  interaction: Interaction;
  // Whether the "How to Play" side panel is expanded. Defaults to open
  // (a first-time player benefits most from it); main.ts overrides this
  // with the viewer's remembered preference, if any, right after creating
  // the initial state.
  tutorialOpen: boolean;
  // Titulares (the battle report): what the last state update brought
  // that's worth a toast, and the newest log seq already shown (null
  // until the first state arrives -- older history is never toasted).
  headlines: Headline[];
  lastSeenSeq: number | null;
  // Whether the full Titulares log side panel is open.
  logOpen: boolean;
  // Whose Embajada (discard pile) is open in the viewer, if any.
  viewingEmbassy: PlayerSlot | null;
  // The results screen (finale.ts) was closed to look at the final board.
  finaleDismissed: boolean;
  // A card that retrieves from an Embassy is waiting for the player to
  // pick which card (embassyPicker.ts); `send` sends the play with it.
  embassyPick: { cardId: CardId; choice: EmbassyChoice; send: (embassyPick: number | undefined) => void } | null;
  // The guided first duel (guide/): which tip is showing, and how many
  // times a move was blocked on it (each block shakes the tip).
  guide: { step: number; blocked: number } | null;
  // The Settings panel (sound, music, vibration) is open.
  settingsOpen: boolean;
  // The Card Shop panel (offline card unlocks -- see state/progress.ts) is open.
  shopOpen: boolean;
  // The Card Shop's Field Guide: which "type" tab is picked (all, an
  // ActorRole, or "policy"/"scandal"), and which entry is spotlighted.
  // Falls back to the next unlock (or the first card) when unset or
  // stale -- see renderShop.ts.
  shopFilter: "all" | ActorRole | "policy" | "scandal";
  shopSelected: CardId | null;
  // This build has an online server to play on.
  onlineAvailable: boolean;
  // Waiting in the server's matchmaking queue for a quick-match opponent
  // (see net/DuelClient.ts's quickMatch/onMatchFound). `quickMatchEdition`
  // is which edition was requested, so a timeout or a dropped connection
  // can fall back to an offline AI duel in the same edition.
  quickMatchWaiting: boolean;
  quickMatchEdition: Edition | null;
}

export function createInitialState(): ClientState {
  return {
    screen: "menu",
    mode: "offline",
    menuStep: "main",
    aiLevel: "normal",
    aiEdition: "world",
    aiThinking: false,
    opponentName: "Opponent",
    connectionOpen: false,
    roomCodeInput: "",
    roomCode: null,
    you: null,
    duel: null,
    statusLine: null,
    interaction: { mode: "idle" },
    tutorialOpen: true,
    headlines: [],
    lastSeenSeq: null,
    logOpen: false,
    viewingEmbassy: null,
    finaleDismissed: false,
    embassyPick: null,
    guide: null,
    settingsOpen: false,
    shopOpen: false,
    shopFilter: "all",
    shopSelected: null,
    onlineAvailable: true,
    quickMatchWaiting: false,
    quickMatchEdition: null,
  };
}

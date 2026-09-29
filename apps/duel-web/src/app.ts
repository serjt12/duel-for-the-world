import { unlockedCardsOfEdition } from "@duel-for-the-world/duel-content";
import type { Edition } from "@duel-for-the-world/duel-content";
import type { PlayerAction } from "@duel-for-the-world/duel-server";
import { PROTOCOL_VERSION } from "@duel-for-the-world/duel-server/protocol-version";
import { initAds, maybeShowInterstitialAfterMatch } from "./ads/ads";
import { installSound, playBlocked, playDuelEvents, setMusicTheme } from "./audio/sound";
import { advanceGuide, applyCoachHighlights, guideAllows, mountCoach, renderCoach } from "./guide/coach";
import { ScriptedSeat } from "./guide/ScriptedSeat";
import { GUIDE_DECKS, GUIDE_ELECTION_TURN, GUIDE_OPPONENT_SCRIPT, GUIDE_YOU } from "./guide/script";
import { DuelClient } from "./net/DuelClient";
import type { GameClient } from "./net/GameClient";
import { LocalDuel } from "./net/LocalDuel";
import type { LocalDuelHandlers, LocalDuelSetup } from "./net/LocalDuel";
import { createInitialState } from "./state/ClientState";
import type { AiLevel, ClientState } from "./state/ClientState";
import { effectiveOfflineWins } from "./state/progress";
import { initPurchases } from "./store/purchases";
import { applyServerState, resetDuelView } from "./ui/applyState";
import { refreshDragHighlights } from "./ui/dragDrop";
import { renderEmbassyViewer } from "./ui/embassy";
import { renderEmbassyPicker } from "./ui/embassyPicker";
import { syncFinale } from "./ui/finale";
import { renderLogPanel } from "./ui/headlines";
import { installEscapeToCancel } from "./ui/keyboard";
import { loadMenuPreferences } from "./ui/renderMenu";
import { renderApp } from "./ui/renderApp";
import type { AppActions } from "./ui/renderApp";
import { loadTutorialOpenPreference, renderTutorialPanel } from "./ui/renderTutorial";
import { installCardInspector } from "./ui/inspect";
import { renderSettings } from "./ui/settingsPanel";
import { renderShop } from "./ui/renderShop";
import { renderStore } from "./ui/renderStore";
import { electionLine, showTurnBanner } from "./ui/turnBanner";
import { installStageResize, isPhoneLayout } from "./ui/stage";

// The whole app, minus the stylesheet import (main.ts adds that, so the
// test harness can load this module directly).

const DEFAULT_SERVER_URL = "ws://localhost:8080";

const LEVEL_NAMES = { easy: "Easy", normal: "Normal", hard: "Hard" } as const;
const QUICK_MATCH_TIMEOUT_MS = 7000;

// `serverUrl` null: no online server for this build (Play Online shows "coming soon").
export function startApp(appRoot: HTMLElement, serverUrl: string | null = DEFAULT_SERVER_URL): { state: ClientState } {
  const state = createInitialState();
  state.onlineAvailable = serverUrl !== null;
  state.tutorialOpen = loadTutorialOpenPreference(false);
  loadMenuPreferences(state);

  let online: DuelClient | null = null;
  let local: LocalDuel | null = null;
  let quickMatchTimer: number | null = null;
  // Guards against a rapid double-tap (e.g. two Advance Phase clicks
  // before the first one's answer comes back) sending a second action
  // while the first is still in flight. LocalDuel/DuelClient both apply
  // an action and report back asynchronously (LocalDuel deliberately, "like
  // the network would") -- without this, two taps close enough together
  // could both reach the engine before either render, letting the second
  // one silently skip past a phase the UI (and, during the tutorial, the
  // guide script) never got a chance to react to.
  let actionInFlight = false;

  function clearQuickMatchTimer(): void {
    if (quickMatchTimer) window.clearTimeout(quickMatchTimer);
    quickMatchTimer = null;
  }

  // Renderers talk to whichever side is active right now.
  const client: GameClient = {
    createRoom: (edition) => online?.createRoom(edition),
    joinRoom: (code) => online?.joinRoom(code),
    sendAction: (action: PlayerAction) => {
      if (state.guide) {
        // The tutorial's "rematch" is a real duel.
        if (action.type === "rematch") {
          actions.startVsComputer("easy");
          return;
        }
        // Keep to the script: anything else is sent back with a nudge.
        if (!guideAllows(state, action)) {
          playBlocked();
          // Unlike a real rejection from the engine (below), nothing was ever
          // sent -- this is the guide saying "not that one yet." Whatever menu
          // the player had open (e.g. the Riot Cop's hand-menu) is still valid
          // UI state, so leave it open: closing it would hide the very button
          // the coach is telling them to click next, which read as the game
          // being "blocked" (see the tutorial bug report).
          rerender();
          return;
        }
      }
      if (action.type !== "rematch" && actionInFlight) return;
      if (action.type !== "rematch") actionInFlight = true;
      if (state.mode === "offline") local?.sendAction(action);
      else online?.sendAction(action);
    },
  };

  const coachActions = {
    next(): void {
      if (!state.guide) return;
      state.guide.step += 1;
      state.guide.blocked = 0;
      advanceGuide(state);
      rerender();
    },
    playForReal: () => actions.startVsComputer("easy"),
    toMenu: () => actions.backToMenu(),
    // The escape hatch when a step won't budge (see coach.ts): rather
    // than try to patch up a script + duel that have drifted apart,
    // just deal a fresh scripted duel from the top.
    restart: () => actions.startTutorial(),
  };

  function rerender(): void {
    const currentPhase = state.duel?.phase ?? null;
    document.body.classList.toggle("phone-layout", isPhoneLayout() && state.screen === "board");
    // The tenser "showdown" bed once a duel is actually on screen, the
    // bright "campaign rally" bed everywhere else (menu, lobby) -- a
    // no-op unless the screen actually changed since the last render.
    setMusicTheme(state.screen === "board" ? "duel" : "menu");
    appRoot.replaceChildren(
      ...[
        renderApp(state, client, rerender, actions),
        ...renderTutorialPanel(state, rerender, currentPhase),
        ...renderLogPanel(state, rerender),
        renderEmbassyViewer(state, rerender),
        renderEmbassyPicker(state, rerender),
        renderSettings(state, rerender),
        renderStore(state, rerender),
        renderShop(state, rerender),
      ].filter((node): node is HTMLElement => node !== null),
    );
    mountCoach(appRoot, renderCoach(state, coachActions));
    applyCoachHighlights(state, appRoot);
    syncFinale(state, client, rerender);
    // A re-render can land mid-drag (e.g. the opponent acts); re-light the
    // freshly rebuilt drop targets so the drag in progress stays coherent.
    refreshDragHighlights();
  }

  function onState(duel: Parameters<typeof applyServerState>[1]): void {
    actionInFlight = false;
    // Captures cards about to leave the field while the old board is
    // still on screen; the returned function plays their effects.
    // What's new since the last update (nothing on the first one).
    const seenBefore = state.lastSeenSeq;
    const fresh = seenBefore === null ? [] : duel.log.filter((event) => event.seq > seenBefore);
    const playFieldFx = applyServerState(state, duel, rerender);
    if (state.you) playDuelEvents(fresh, state.you);
    advanceGuide(state);
    rerender();
    playFieldFx();
    announceTurn(duel, seenBefore === null, fresh);
  }

  // The turn banner: whose turn it is now, and how close the election is.
  function announceTurn(duel: Parameters<typeof applyServerState>[1], first: boolean, fresh: typeof duel.log): void {
    const you = state.you;
    if (!you || duel.winnerId !== null) return;
    const started = first
      ? state.mode === "offline" // online, the first state can arrive before your opponent does
      : fresh.some((event) => event.kind === "turn-started");
    if (!started) return;
    if (duel.activeDuelistId === you) {
      showTurnBanner("Your turn", first ? "You go first" : electionLine(duel.turnNumber, duel.election));
    } else {
      showTurnBanner(`${first ? "They go first" : "Their turn"}`, state.opponentName, "them");
    }
  }

  // A server running different code than this client (most often: it was
  // started before an update and never restarted) would send state this
  // client misreads. Refuse to play and say exactly how to fix it.
  function serverMatches(serverProtocolVersion: unknown): boolean {
    if (serverProtocolVersion === PROTOCOL_VERSION) {
      return true;
    }
    state.screen = "lobby";
    state.statusLine =
      `The game server is running a different version (server: ${String(serverProtocolVersion ?? "old")}, ` +
      `this app: ${PROTOCOL_VERSION}). Restart the server -- stop it with Ctrl+C and run ` +
      "\"pnpm duel\" (or \"pnpm --filter @duel-for-the-world/duel-server dev\") -- then reload.";
    rerender();
    return false;
  }

  function leaveCurrent(): void {
    actionInFlight = false;
    local?.stop();
    local = null;
    online?.disconnect();
    online = null;
    clearQuickMatchTimer();
    state.connectionOpen = false;
    state.roomCode = null;
    state.you = null;
    state.statusLine = null;
    state.aiThinking = false;
    state.guide = null;
    state.quickMatchWaiting = false;
    state.quickMatchEdition = null;
    resetDuelView(state);
  }

  // Quick match gave up (the timeout fired, or the connection dropped
  // while waiting): drop into an offline AI duel in the same edition the
  // player asked for, rather than leaving them stuck on the lobby screen.
  function fallbackToAi(edition: Edition): void {
    leaveCurrent();
    startLocal(
      { edition, level: state.aiLevel, cardPool: unlockedCardsOfEdition(edition, effectiveOfflineWins()) },
      `Computer · ${LEVEL_NAMES[state.aiLevel]}`,
    );
    state.statusLine = "No one was online -- you're playing the computer instead.";
    rerender();
  }

  // A duel against the computer, on this device.
  function startLocal(setup: LocalDuelSetup, opponentName: string): void {
    state.mode = "offline";
    state.screen = "board";
    state.opponentName = opponentName;
    const handlers: LocalDuelHandlers = {
      onSeat: (you) => {
        state.you = you;
        resetDuelView(state);
      },
      onState,
      onActionRejected: (reason) => {
        actionInFlight = false;
        playBlocked();
        state.interaction = { mode: "idle" };
        state.statusLine = `Not allowed: ${reason}`;
        rerender();
      },
      onThinking: (thinking) => {
        if (state.aiThinking === thinking) return;
        state.aiThinking = thinking;
        rerender();
      },
    };
    local = new LocalDuel(setup, handlers);
    local.start();
  }

  const actions: AppActions = {
    // `level`: this once, instead of the level picked on the menu.
    startVsComputer(level?: AiLevel): void {
      leaveCurrent();
      const chosen = level ?? state.aiLevel;
      const edition = level ? "world" : state.aiEdition;
      startLocal(
        { edition, level: chosen, cardPool: unlockedCardsOfEdition(edition, effectiveOfflineWins()) },
        `Computer · ${LEVEL_NAMES[chosen]}`,
      );
    },

    // The guided first duel: stacked decks, a scripted opponent, an early election.
    startTutorial(): void {
      leaveCurrent();
      state.guide = { step: 0, blocked: 0 };
      state.tutorialOpen = false;
      state.logOpen = false;
      startLocal(
        {
          edition: "world",
          level: "easy",
          decks: { duelist1: GUIDE_DECKS.you, duelist2: GUIDE_DECKS.them },
          humanSeat: GUIDE_YOU,
          electionTurn: GUIDE_ELECTION_TURN,
          opponent: (room, seat) => new ScriptedSeat(room, seat, GUIDE_OPPONENT_SCRIPT),
          stepMs: 1150,
        },
        "Computer · Tutorial",
      );
    },

    goOnline(): void {
      if (serverUrl === null) return; // no online server in this build
      leaveCurrent();
      state.mode = "online";
      state.screen = "lobby";
      state.opponentName = "Opponent";
      state.statusLine = null;
      online = new DuelClient(serverUrl, {
        onOpen: () => {
          state.connectionOpen = true;
          state.statusLine = null;
          rerender();
        },
        onRoomCreated: (roomCode, you, serverProtocolVersion) => {
          if (!serverMatches(serverProtocolVersion)) return;
          state.roomCode = roomCode;
          state.you = you;
          state.screen = "board";
          state.statusLine = "Share this room code with your opponent.";
          rerender();
        },
        onJoinedRoom: (roomCode, you, serverProtocolVersion) => {
          if (!serverMatches(serverProtocolVersion)) return;
          state.roomCode = roomCode;
          state.you = you;
          state.screen = "board";
          state.statusLine = null;
          rerender();
        },
        onRejoinedRoom: (roomCode, you, serverProtocolVersion) => {
          if (!serverMatches(serverProtocolVersion)) return;
          state.roomCode = roomCode;
          state.you = you;
          state.connectionOpen = true;
          state.statusLine = "Back in the duel.";
          rerender();
        },
        onQuickMatchWaiting: () => {
          state.statusLine = "Looking for an opponent -- this may take a few seconds.";
          rerender();
        },
        onMatchFound: (roomCode, you, serverProtocolVersion) => {
          // A match can in principle still arrive just after the client
          // gave up and fell back to an offline duel (a race between the
          // timeout firing and cancel-quick-match reaching the server) --
          // ignore it rather than stomping on a duel already in progress.
          if (!state.quickMatchWaiting) return;
          clearQuickMatchTimer();
          // Cleared unconditionally from here on: whether this match is
          // accepted or rejected below (a version mismatch), the search
          // is over either way -- otherwise the lobby would be stuck
          // showing "Looking for an opponent..." with nothing left that
          // could ever clear it.
          state.quickMatchWaiting = false;
          state.quickMatchEdition = null;
          if (!serverMatches(serverProtocolVersion)) return;
          state.roomCode = roomCode;
          state.you = you;
          state.screen = "board";
          state.statusLine = "Opponent found -- the duel begins.";
          rerender();
        },
        onOpponentJoined: () => {
          state.statusLine = "Opponent joined -- the duel begins.";
          rerender();
        },
        onOpponentDisconnected: () => {
          state.statusLine = "Opponent's connection dropped -- waiting for them to come back...";
          rerender();
        },
        onOpponentReconnected: () => {
          state.statusLine = "Opponent is back.";
          rerender();
        },
        onOpponentLeft: () => {
          state.statusLine = "Your opponent didn't come back in time -- you win by forfeit.";
          rerender();
        },
        onState,
        onActionRejected: (reason) => {
          actionInFlight = false;
          playBlocked();
          // Drop any half-finished play (e.g. a card waiting in a zone for the
          // server's answer) so the card goes back to the hand.
          state.interaction = { mode: "idle" };
          state.statusLine = `Action rejected: ${reason}`;
          rerender();
        },
        onServerError: (reason) => {
          state.statusLine = `Server error: ${reason}`;
          rerender();
        },
        onDisconnected: () => {
          actionInFlight = false;
          state.connectionOpen = false;
          // Waiting for a quick match when the connection drops: there's
          // nothing to reconnect to yet (no roomCode), so fall back to
          // the computer immediately rather than sit on a dead lobby.
          if (state.quickMatchWaiting) {
            clearQuickMatchTimer();
            fallbackToAi(state.quickMatchEdition ?? "world");
            return;
          }
          // A dropped connection mid-match tries a few reconnects on its
          // own (see DuelClient) before this counts as "gone for good" --
          // onReconnectFailed is what says the latter.
          state.statusLine = state.roomCode
            ? "Connection lost -- trying to reconnect..."
            : "Couldn't reach the game server.";
          rerender();
        },
        onReconnectFailed: () => {
          state.statusLine = "Couldn't reconnect to the match.";
          rerender();
        },
      });
      online.connect();
      rerender();
    },

    startQuickMatch(edition: Edition): void {
      if (!online || !state.connectionOpen || state.quickMatchWaiting) return;
      state.quickMatchWaiting = true;
      state.quickMatchEdition = edition;
      state.statusLine = null;
      rerender();
      online.quickMatch(edition);
      clearQuickMatchTimer();
      quickMatchTimer = window.setTimeout(() => {
        quickMatchTimer = null;
        if (!state.quickMatchWaiting) return; // matched (or left) in the meantime
        online?.cancelQuickMatch();
        fallbackToAi(edition);
      }, QUICK_MATCH_TIMEOUT_MS);
    },

    cancelQuickMatch(): void {
      if (!state.quickMatchWaiting) return;
      clearQuickMatchTimer();
      online?.cancelQuickMatch();
      state.quickMatchWaiting = false;
      state.quickMatchEdition = null;
      state.statusLine = null;
      rerender();
    },

    openHowToPlay(): void {
      state.tutorialOpen = true;
      state.logOpen = false;
      rerender();
    },

    openShop(): void {
      state.shopOpen = true;
      rerender();
    },

    openStore(): void {
      state.storeOpen = true;
      rerender();
    },

    backToMenu(): void {
      // Only count/advertise after a real duel actually finished -- not the
      // tutorial, and not backing out of a lobby or an in-progress match.
      const matchFinished = state.guide === null && state.duel !== null && state.duel.winnerId !== null;
      leaveCurrent();
      state.screen = "menu";
      state.menuStep = "main";
      rerender();
      if (matchFinished) void maybeShowInterstitialAfterMatch();
    },
  };

  installSound();
  void initPurchases().then(rerender);
  void initAds();
  installEscapeToCancel(state, rerender);
  installStageResize(() => rerender());
  installCardInspector();
  rerender();
  return { state };
}

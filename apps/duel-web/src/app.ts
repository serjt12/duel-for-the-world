import type { PlayerAction } from "@project-palacio/duel-server";
import { PROTOCOL_VERSION } from "@project-palacio/duel-server/protocol-version";
import { installSound, playBlocked, playDuelEvents } from "./audio/sound";
import { advanceGuide, applyCoachHighlights, guideAllows, mountCoach, renderCoach } from "./guide/coach";
import { ScriptedSeat } from "./guide/ScriptedSeat";
import { GUIDE_DECKS, GUIDE_ELECTION_TURN, GUIDE_OPPONENT_SCRIPT, GUIDE_YOU } from "./guide/script";
import { DuelClient } from "./net/DuelClient";
import type { GameClient } from "./net/GameClient";
import { LocalDuel } from "./net/LocalDuel";
import type { LocalDuelHandlers, LocalDuelSetup } from "./net/LocalDuel";
import { createInitialState } from "./state/ClientState";
import type { AiLevel, ClientState } from "./state/ClientState";
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
import { electionLine, showTurnBanner } from "./ui/turnBanner";
import { installStageResize, isPhoneLayout } from "./ui/stage";

// The whole app, minus the stylesheet import (main.ts adds that, so the
// test harness can load this module directly).

const DEFAULT_SERVER_URL = "ws://localhost:8080";

const LEVEL_NAMES = { easy: "Easy", normal: "Normal", hard: "Hard" } as const;

// `serverUrl` null: no online server for this build (Play Online shows "coming soon").
export function startApp(appRoot: HTMLElement, serverUrl: string | null = DEFAULT_SERVER_URL): { state: ClientState } {
  const state = createInitialState();
  state.onlineAvailable = serverUrl !== null;
  state.tutorialOpen = loadTutorialOpenPreference(false);
  loadMenuPreferences(state);

  let online: DuelClient | null = null;
  let local: LocalDuel | null = null;

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
          state.interaction = { mode: "idle" };
          rerender();
          return;
        }
      }
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
  };

  function rerender(): void {
    const currentPhase = state.duel?.phase ?? null;
    document.body.classList.toggle("phone-layout", isPhoneLayout() && state.screen === "board");
    appRoot.replaceChildren(
      ...[
        renderApp(state, client, rerender, actions),
        ...renderTutorialPanel(state, rerender, currentPhase),
        ...renderLogPanel(state, rerender),
        renderEmbassyViewer(state, rerender),
        renderEmbassyPicker(state, rerender),
        renderSettings(state, rerender),
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
      "\"pnpm duel\" (or \"pnpm --filter @project-palacio/duel-server dev\") -- then reload.";
    rerender();
    return false;
  }

  function leaveCurrent(): void {
    local?.stop();
    local = null;
    online?.disconnect();
    online = null;
    state.connectionOpen = false;
    state.roomCode = null;
    state.you = null;
    state.statusLine = null;
    state.aiThinking = false;
    state.guide = null;
    resetDuelView(state);
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
      startLocal({ edition: level ? "world" : state.aiEdition, level: chosen }, `Computer · ${LEVEL_NAMES[chosen]}`);
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
          state.connectionOpen = false;
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

    openHowToPlay(): void {
      state.tutorialOpen = true;
      state.logOpen = false;
      rerender();
    },

    backToMenu(): void {
      leaveCurrent();
      state.screen = "menu";
      state.menuStep = "main";
      rerender();
    },
  };

  installSound();
  installEscapeToCancel(state, rerender);
  installStageResize(() => rerender());
  installCardInspector();
  rerender();
  return { state };
}

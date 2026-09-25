import type { PlayerAction } from "@project-palacio/duel-server";
import { PROTOCOL_VERSION } from "@project-palacio/duel-server/protocol-version";
import { DuelClient } from "./net/DuelClient";
import type { GameClient } from "./net/GameClient";
import { LocalDuel } from "./net/LocalDuel";
import { createInitialState } from "./state/ClientState";
import type { ClientState } from "./state/ClientState";
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
import { installStageResize, isPhoneLayout } from "./ui/stage";

// The whole app, minus the stylesheet import (main.ts adds that, so the
// test harness can load this module directly).

const DEFAULT_SERVER_URL = "ws://localhost:8080";

const LEVEL_NAMES = { easy: "Easy", normal: "Normal", hard: "Hard" } as const;

export function startApp(appRoot: HTMLElement, serverUrl: string = DEFAULT_SERVER_URL): { state: ClientState } {
  const state = createInitialState();
  state.tutorialOpen = loadTutorialOpenPreference(false);
  loadMenuPreferences(state);

  let online: DuelClient | null = null;
  let local: LocalDuel | null = null;

  // Renderers talk to whichever side is active right now.
  const client: GameClient = {
    createRoom: (edition) => online?.createRoom(edition),
    joinRoom: (code) => online?.joinRoom(code),
    sendAction: (action: PlayerAction) => (state.mode === "offline" ? local?.sendAction(action) : online?.sendAction(action)),
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
      ].filter((node): node is HTMLElement => node !== null),
    );
    syncFinale(state, client, rerender);
    // A re-render can land mid-drag (e.g. the opponent acts); re-light the
    // freshly rebuilt drop targets so the drag in progress stays coherent.
    refreshDragHighlights();
  }

  function onState(duel: Parameters<typeof applyServerState>[1]): void {
    // Captures cards about to leave the field while the old board is
    // still on screen; the returned function plays their effects.
    const playFieldFx = applyServerState(state, duel, rerender);
    rerender();
    playFieldFx();
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
    resetDuelView(state);
  }

  const actions: AppActions = {
    startVsComputer(): void {
      leaveCurrent();
      state.mode = "offline";
      state.screen = "board";
      state.opponentName = `Computer · ${LEVEL_NAMES[state.aiLevel]}`;
      local = new LocalDuel(state.aiEdition, state.aiLevel, {
        onSeat: (you) => {
          state.you = you;
          resetDuelView(state);
        },
        onState,
        onActionRejected: (reason) => {
          state.interaction = { mode: "idle" };
          state.statusLine = `Not allowed: ${reason}`;
          rerender();
        },
        onThinking: (thinking) => {
          if (state.aiThinking === thinking) return;
          state.aiThinking = thinking;
          rerender();
        },
      });
      local.start();
    },

    goOnline(): void {
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
        onOpponentJoined: () => {
          state.statusLine = "Opponent joined -- the duel begins.";
          rerender();
        },
        onState,
        onActionRejected: (reason) => {
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
          state.statusLine = "Couldn't reach the game server.";
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

  installEscapeToCancel(state, rerender);
  installStageResize(() => rerender());
  installCardInspector();
  rerender();
  return { state };
}

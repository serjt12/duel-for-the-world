import type { ClientState } from "../state/ClientState";
import type { GameClient } from "../net/GameClient";
import type { AppActions } from "./renderApp";
import { el } from "./dom";
import { flavorOf, setEdition } from "./flavor";
import { GAME_NAME, gameTagline } from "./brand";
import { t, tf } from "../i18n";

export function renderLobby(state: ClientState, client: GameClient, actions: AppActions): HTMLElement {
  const roomInput = el("input", {
    type: "text",
    placeholder: t("lobby.roomCodePlaceholder"),
    value: state.roomCodeInput,
    maxLength: 5,
  });
  roomInput.addEventListener("input", () => {
    // Deliberately not triggering a re-render here: this app re-renders
    // by rebuilding the DOM from scratch, which would blow away the
    // input's focus/cursor position on every keystroke. The typed value
    // lives in the input itself; we only read it back out when the Join
    // button is actually clicked.
    state.roomCodeInput = roomInput.value.toUpperCase();
  });

  // Quick match takes over the panel while waiting: creating or joining a
  // specific room at the same time would leave a stale queue entry (or a
  // socket seated in two places at once), so the simplest safe UI is to
  // just hide those while a search is in flight.
  const quickMatchSection = state.quickMatchWaiting
    ? el("div", { className: "quickmatch-panel quickmatch-panel--waiting" }, [
        el("p", { className: "quickmatch-status" }, [t("lobby.quickMatch.waitingStatus")]),
        el("p", { className: "subtitle" }, [t("lobby.quickMatch.waitingSubtitle")]),
        el("button", { onclick: () => actions.cancelQuickMatch() }, [t("common.cancel")]),
      ])
    : el("div", { className: "quickmatch-panel" }, [
        el("h2", { className: "menu-heading" }, [t("lobby.quickMatch.heading")]),
        el("p", { className: "subtitle" }, [t("lobby.quickMatch.subtitle")]),
        el("div", { className: "edition-row" }, [
          el(
            "button",
            {
              className: "primary",
              disabled: !state.connectionOpen,
              title: t("lobby.quickMatch.worldTitle"),
              onclick: () => actions.startQuickMatch("world"),
            },
            [tf("lobby.quickMatch.button", { edition: flavorOf("world").editionName })],
          ),
          el(
            "button",
            {
              className: "edition-special",
              disabled: !state.connectionOpen,
              title: t("lobby.quickMatch.colombiaTitle"),
              onclick: () => actions.startQuickMatch("colombia"),
            },
            [tf("lobby.quickMatch.button", { edition: flavorOf("colombia").editionName })],
          ),
        ]),
      ]);

  const friendSection = state.quickMatchWaiting
    ? null
    : el("div", { className: "lobby-friend-panel" }, [
        el("h2", { className: "menu-heading" }, [t("lobby.friend.heading")]),
        el("div", { className: "edition-row" }, [
          el(
            "button",
            {
              disabled: !state.connectionOpen,
              title: t("lobby.quickMatch.worldTitle"),
              onclick: () => {
                setEdition("world");
                client.createRoom("world");
              },
            },
            [tf("lobby.friend.createRoom", { edition: flavorOf("world").editionName })],
          ),
          el(
            "button",
            {
              className: "edition-special",
              disabled: !state.connectionOpen,
              title: t("lobby.quickMatch.colombiaTitle"),
              onclick: () => {
                setEdition("colombia");
                client.createRoom("colombia");
              },
            },
            [tf("lobby.friend.special", { edition: flavorOf("colombia").editionName })],
          ),
        ]),
        el("div", { className: "join-row" }, [
          roomInput,
          el(
            "button",
            {
              disabled: !state.connectionOpen,
              onclick: () => {
                const code = state.roomCodeInput.trim();
                if (code.length > 0) {
                  client.joinRoom(code);
                }
              },
            },
            [t("lobby.friend.join")],
          ),
        ]),
      ]);

  return el("div", {}, [
    el("h1", { className: "brand-name" }, [GAME_NAME]),
    el("p", { className: "subtitle" }, [gameTagline()]),
    el("div", { className: "lobby-panel" }, [
      state.statusLine ? el("p", { className: "status-line" }, [state.statusLine]) : null,
      quickMatchSection,
      friendSection,
      !state.connectionOpen && !state.statusLine
        ? el("p", { className: "subtitle" }, [t("lobby.connecting")])
        : null,
      el("button", { className: "lobby-back", onclick: () => actions.backToMenu() }, [t("lobby.backToMenu")]),
    ]),
  ]);
}

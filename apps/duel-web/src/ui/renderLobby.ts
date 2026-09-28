import type { ClientState } from "../state/ClientState";
import type { GameClient } from "../net/GameClient";
import type { AppActions } from "./renderApp";
import { el } from "./dom";
import { flavorOf, setEdition } from "./flavor";
import { GAME_NAME, GAME_TAGLINE } from "./brand";

export function renderLobby(state: ClientState, client: GameClient, actions: AppActions): HTMLElement {
  const roomInput = el("input", {
    type: "text",
    placeholder: "ROOM CODE",
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
        el("p", { className: "quickmatch-status" }, ["Looking for an opponent…"]),
        el("p", { className: "subtitle" }, ["Nobody around? You'll duel the computer in a few seconds."]),
        el("button", { onclick: () => actions.cancelQuickMatch() }, ["Cancel"]),
      ])
    : el("div", { className: "quickmatch-panel" }, [
        el("h2", { className: "menu-heading" }, ["Quick Match"]),
        el("p", { className: "subtitle" }, ["Get matched with whoever's online right now -- no code needed."]),
        el("div", { className: "edition-row" }, [
          el(
            "button",
            {
              className: "primary",
              disabled: !state.connectionOpen,
              title: "The global base game: world leaders, in English.",
              onclick: () => actions.startQuickMatch("world"),
            },
            [`Quick Match · ${flavorOf("world").editionName}`],
          ),
          el(
            "button",
            {
              className: "edition-special",
              disabled: !state.connectionOpen,
              title: "Special edition: the original Colombian cards (La Embajada, Titulares...).",
              onclick: () => actions.startQuickMatch("colombia"),
            },
            [`Quick Match · ${flavorOf("colombia").editionName}`],
          ),
        ]),
      ]);

  const friendSection = state.quickMatchWaiting
    ? null
    : el("div", { className: "lobby-friend-panel" }, [
        el("h2", { className: "menu-heading" }, ["Play a Friend"]),
        el("div", { className: "edition-row" }, [
          el(
            "button",
            {
              disabled: !state.connectionOpen,
              title: "The global base game: world leaders, in English.",
              onclick: () => {
                setEdition("world");
                client.createRoom("world");
              },
            },
            [`Create a Room · ${flavorOf("world").editionName}`],
          ),
          el(
            "button",
            {
              className: "edition-special",
              disabled: !state.connectionOpen,
              title: "Special edition: the original Colombian cards (La Embajada, Titulares...).",
              onclick: () => {
                setEdition("colombia");
                client.createRoom("colombia");
              },
            },
            [`Special: ${flavorOf("colombia").editionName}`],
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
            ["Join"],
          ),
        ]),
      ]);

  return el("div", {}, [
    el("h1", { className: "brand-name" }, [GAME_NAME]),
    el("p", { className: "subtitle" }, [GAME_TAGLINE]),
    el("div", { className: "lobby-panel" }, [
      state.statusLine ? el("p", { className: "status-line" }, [state.statusLine]) : null,
      quickMatchSection,
      friendSection,
      !state.connectionOpen && !state.statusLine
        ? el("p", { className: "subtitle" }, ["Connecting to server..."])
        : null,
      el("button", { className: "lobby-back", onclick: () => actions.backToMenu() }, ["Back to menu"]),
    ]),
  ]);
}

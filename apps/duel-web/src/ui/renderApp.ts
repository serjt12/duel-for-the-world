import type { ClientState } from "../state/ClientState";
import type { GameClient } from "../net/GameClient";
import { renderLobby } from "./renderLobby";
import { renderBoard } from "./renderBoard";
import { renderMenu } from "./renderMenu";
import type { MenuActions } from "./renderMenu";

export interface AppActions extends MenuActions {
  backToMenu(): void;
}

// The top-level screen dispatcher: the main menu, the online lobby
// (create/join a room) or the board (a duel in progress), based purely on
// `state.screen`. Nothing here holds any state of its own.
export function renderApp(state: ClientState, client: GameClient, rerender: () => void, actions: AppActions): HTMLElement {
  if (state.screen === "menu") {
    return renderMenu(state, rerender, actions);
  }
  if (state.screen === "lobby") {
    return renderLobby(state, client, actions);
  }
  return renderBoard(state, client, rerender, actions);
}

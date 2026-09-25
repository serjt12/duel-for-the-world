import type { ClientState } from "../state/ClientState";
import { isDragging } from "./dragDrop";

/**
 * Esc cancels an Embassy pick, closes the Embassy viewer, or backs out of an open menu or a
 * "choose a target" step. (During a drag, Esc is handled by dragDrop.ts
 * to cancel the drag instead.)
 */
export function installEscapeToCancel(state: ClientState, rerender: () => void): void {
  window.addEventListener("keydown", (event) => {
    // A pending Embassy pick is cancelled first.
    if (event.key === "Escape" && state.embassyPick !== null && !isDragging()) {
      state.embassyPick = null;
      state.interaction = { mode: "idle" };
      rerender();
      return;
    }
    // An open Embassy viewer closes next.
    if (event.key === "Escape" && state.viewingEmbassy !== null && !isDragging()) {
      state.viewingEmbassy = null;
      rerender();
      return;
    }
    const interaction = state.interaction;
    // A committed placement is already on its way to the server; leave it.
    const committed = interaction.mode === "placing" && interaction.committed;
    if (event.key === "Escape" && interaction.mode !== "idle" && !committed && !isDragging()) {
      state.interaction = { mode: "idle" };
      rerender();
    }
  });
}

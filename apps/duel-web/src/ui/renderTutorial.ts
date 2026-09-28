import type { DuelPhase } from "@duel-for-the-world/duel-engine";
import type { ClientState } from "../state/ClientState";
import { el } from "./dom";
import { generalGuide, phaseGuide, PHASE_ORDER } from "./phaseInfo";

// Persists only the open/closed choice across reloads -- everything else
// about tutorial state is derived fresh from ClientState/phaseGuide() each
// render. Wrapped defensively since localStorage can throw or be
// unavailable (private browsing, locked-down environments); losing the
// remembered preference is fine, losing the render isn't.
const STORAGE_KEY = "palacio.tutorialOpen";

export function loadTutorialOpenPreference(defaultValue: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveTutorialOpenPreference(open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    // Best-effort only.
  }
}

function toggleTutorial(state: ClientState, rerender: () => void): void {
  state.tutorialOpen = !state.tutorialOpen;
  // One side panel at a time (see headlines.ts's Titulares panel).
  if (state.tutorialOpen) state.logOpen = false;
  saveTutorialOpenPreference(state.tutorialOpen);
  rerender();
}

function renderPhaseEntry(phase: DuelPhase, isCurrent: boolean): HTMLElement {
  const guide = phaseGuide()[phase];
  return el(
    "div",
    { className: `phase-guide-item${isCurrent ? " current" : ""}` },
    [
      el("div", { className: "phase-guide-title" }, [
        guide.label,
        isCurrent ? el("span", { className: "phase-guide-now" }, ["NOW"]) : null,
      ]),
      el("div", { className: "phase-guide-summary" }, [guide.summary]),
      el(
        "ul",
        {},
        guide.bullets.map((bullet) => el("li", {}, [bullet])),
      ),
    ],
  );
}

// A collapsible "how to play" sidebar. Pass the duel's current phase to
// highlight where the active player is in the turn structure; omit it
// (e.g. from the lobby) to just show the reference material with nothing
// highlighted. Purely local, read-only UI -- it never talks to the server.
export function renderTutorialPanel(
  state: ClientState,
  rerender: () => void,
  currentPhase: DuelPhase | null = null,
): HTMLElement[] {
  const toggleButton = el(
    "button",
    {
      className: "tutorial-tab",
      onclick: () => toggleTutorial(state, rerender),
    },
    [state.tutorialOpen ? "Hide Guide ×" : "How to Play"],
  );

  if (!state.tutorialOpen) {
    return [toggleButton];
  }

  const panel = el("aside", { className: "tutorial-panel" }, [
    el("div", { className: "tutorial-header" }, [
      el("h2", {}, ["How to Play"]),
      el(
        "button",
        { className: "tutorial-close", onclick: () => toggleTutorial(state, rerender) },
        ["×"],
      ),
    ]),
    el("div", { className: "tutorial-section" }, [
      el("h3", {}, ["The Basics"]),
      el(
        "ul",
        {},
        generalGuide().map((line) => el("li", {}, [line])),
      ),
    ]),
    el("div", { className: "tutorial-section" }, [
      el("h3", {}, ["The Turn, Phase by Phase"]),
      ...PHASE_ORDER.map((phase) => renderPhaseEntry(phase, phase === currentPhase)),
    ]),
  ]);

  return [toggleButton, panel];
}

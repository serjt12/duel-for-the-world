import type { Edition } from "@project-palacio/duel-content";
import type { AiLevel, ClientState } from "../state/ClientState";
import { el } from "./dom";
import { flavorOf } from "./flavor";

// The main menu: where the app opens. Play the computer (offline), play a
// person online, or read How to Play.

export interface MenuActions {
  startVsComputer(): void;
  goOnline(): void;
  openHowToPlay(): void;
}

const LEVELS: Array<{ level: AiLevel; label: string; blurb: string }> = [
  { level: "easy", label: "Easy", blurb: "A first-term rookie. Learn the ropes." },
  { level: "normal", label: "Normal", blurb: "A seasoned campaigner." },
  { level: "hard", label: "Hard", blurb: "Thinks ahead. Plays to win the election." },
];

const EDITIONS: Array<{ edition: Edition; blurb: string }> = [
  { edition: "world", blurb: "World leaders, in English." },
  { edition: "colombia", blurb: "Special: the Colombian cards." },
];

const STORAGE_KEY = "palacio.vsComputer";

/** Remembered difficulty and edition (best effort: storage may be unavailable). */
export function loadMenuPreferences(state: ClientState): void {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as { level?: AiLevel; edition?: Edition } | null;
    if (saved?.level && LEVELS.some((l) => l.level === saved.level)) state.aiLevel = saved.level;
    if (saved?.edition && EDITIONS.some((e) => e.edition === saved.edition)) state.aiEdition = saved.edition;
  } catch {
    // ignore
  }
}

function savePreferences(state: ClientState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ level: state.aiLevel, edition: state.aiEdition }));
  } catch {
    // ignore
  }
}

function choice(label: string, blurb: string, selected: boolean, onPick: () => void): HTMLElement {
  return el(
    "button",
    {
      className: `menu-choice${selected ? " menu-choice--selected" : ""}`,
      ariaPressed: String(selected),
      onclick: onPick,
    },
    [el("span", { className: "menu-choice-label" }, [label]), el("span", { className: "menu-choice-blurb" }, [blurb])],
  );
}

export function renderMenu(state: ClientState, rerender: () => void, actions: MenuActions): HTMLElement {
  const title = [el("h1", { className: "app-title" }, ["PALACIO"]), el("p", { className: "subtitle" }, ["The Political Card Duel"])];

  if (state.menuStep === "vs-computer") {
    const pickLevel = (level: AiLevel) => () => {
      state.aiLevel = level;
      savePreferences(state);
      rerender();
    };
    const pickEdition = (edition: Edition) => () => {
      state.aiEdition = edition;
      savePreferences(state);
      rerender();
    };
    return el("div", { className: "menu" }, [
      ...title,
      el("div", { className: "menu-panel menu-panel--wide" }, [
        el("h2", { className: "menu-heading" }, ["Play vs Computer"]),
        el("div", { className: "menu-group", role: "group", ariaLabel: "Difficulty" }, [
          el("span", { className: "menu-group-label" }, ["Difficulty"]),
          el(
            "div",
            { className: "menu-choices" },
            LEVELS.map(({ level, label, blurb }) => choice(label, blurb, state.aiLevel === level, pickLevel(level))),
          ),
        ]),
        el("div", { className: "menu-group", role: "group", ariaLabel: "Edition" }, [
          el("span", { className: "menu-group-label" }, ["Edition"]),
          el(
            "div",
            { className: "menu-choices" },
            EDITIONS.map(({ edition, blurb }) => choice(flavorOf(edition).editionName, blurb, state.aiEdition === edition, pickEdition(edition))),
          ),
        ]),
        el("div", { className: "menu-actions" }, [
          el(
            "button",
            {
              onclick: () => {
                state.menuStep = "main";
                rerender();
              },
            },
            ["Back"],
          ),
          el("button", { className: "primary", onclick: () => actions.startVsComputer() }, ["Start duel"]),
        ]),
      ]),
    ]);
  }

  return el("div", { className: "menu" }, [
    ...title,
    el("div", { className: "menu-panel" }, [
      el(
        "button",
        {
          className: "primary menu-big",
          onclick: () => {
            state.menuStep = "vs-computer";
            rerender();
          },
        },
        ["Play vs Computer"],
      ),
      el("button", { className: "menu-big", onclick: () => actions.goOnline() }, ["Play Online"]),
      el("button", { className: "menu-big menu-big--quiet", onclick: () => actions.openHowToPlay() }, ["How to Play"]),
    ]),
  ]);
}

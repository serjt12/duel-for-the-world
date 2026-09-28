import type { Edition } from "@duel-for-the-world/duel-content";
import { isGuideDone } from "../guide/coach";
import type { AiLevel, ClientState } from "../state/ClientState";
import { el } from "./dom";
import { EMBLEM_URL, GAME_NAME, GAME_TAGLINE } from "./brand";
import { flavorOf } from "./flavor";
import { renderMenuBackdrop } from "./menuBackdrop";

// The main menu: where the app opens. The tutorial (first until it's been
// finished once), play the computer (offline), play a person online, or
// read How to Play.

export interface MenuActions {
  // `level`: this once, instead of the level picked on the menu.
  startVsComputer(level?: AiLevel): void;
  startTutorial(): void;
  goOnline(): void;
  openHowToPlay(): void;
  openShop(): void;
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
  const title = [
    // On the setup screen the name shrinks to leave room for the choices.
    el("div", { className: `brand${state.menuStep === "main" ? "" : " brand--compact"}` }, [
      el("img", { className: "brand-emblem", src: EMBLEM_URL, alt: "" }),
      el("div", { className: "brand-words" }, [
        el("h1", { className: "app-title" }, [GAME_NAME]),
        el("p", { className: "subtitle brand-tagline" }, [GAME_TAGLINE]),
      ]),
    ]),
  ];

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
        el(
          "button",
          { className: "menu-big menu-big--quiet", onclick: () => actions.openShop() },
          [el("span", {}, ["Field Guide"]), el("span", { className: "menu-big-blurb" }, ["Win offline duels to identify every kind of politician"])],
        ),
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

  // New players start with the tutorial; afterwards it moves down with How to Play.
  const firstTime = !isGuideDone();
  const tutorial = el(
    "button",
    { className: firstTime ? "primary menu-big" : "menu-big menu-big--quiet", onclick: () => actions.startTutorial() },
    firstTime ? [el("span", {}, ["Tutorial"]), el("span", { className: "menu-big-blurb" }, ["Your first duel, step by step"])] : ["Tutorial"],
  );
  // Both real play modes wait on the tutorial: it's where the win/loss
  // condition, stances and the election get taught, and a first duel
  // without any of that lands a new player straight into a rules quiz.
  const vsComputerButton = firstTime
    ? el("button", { className: "menu-big", disabled: true }, [
        el("span", {}, ["Play vs Computer"]),
        el("span", { className: "menu-big-blurb" }, ["Finish the tutorial first"]),
      ])
    : el(
        "button",
        {
          className: "primary menu-big",
          onclick: () => {
            state.menuStep = "vs-computer";
            rerender();
          },
        },
        ["Play vs Computer"],
      );

  const playOnlineButton = !state.onlineAvailable
    ? el("button", { className: "menu-big", disabled: true }, [
        el("span", {}, ["Play Online"]),
        el("span", { className: "menu-big-blurb" }, ["Coming soon"]),
      ])
    : firstTime
      ? el("button", { className: "menu-big", disabled: true }, [
          el("span", {}, ["Play Online"]),
          el("span", { className: "menu-big-blurb" }, ["Finish the tutorial first"]),
        ])
      : el("button", { className: "menu-big", onclick: () => actions.goOnline() }, ["Play Online"]);

  return el("div", { className: "menu menu--home" }, [
    renderMenuBackdrop(),
    ...title,
    el("div", { className: "menu-panel" }, [
      firstTime ? tutorial : null,
      vsComputerButton,
      playOnlineButton,
      el("div", { className: "menu-row" }, [
        firstTime ? null : tutorial,
        el("button", { className: "menu-big menu-big--quiet", onclick: () => actions.openHowToPlay() }, ["How to Play"]),
        el(
          "button",
          {
            className: "menu-big menu-big--quiet",
            onclick: () => {
              state.settingsOpen = true;
              rerender();
            },
          },
          ["Settings"],
        ),
      ]),
    ]),
  ]);
}

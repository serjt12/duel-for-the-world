import type { Edition } from "@duel-for-the-world/duel-content";
import { isGuideDone } from "../guide/coach";
import type { AiLevel, ClientState } from "../state/ClientState";
import { adsAreRemoved, isEditionUnlocked, purchasesState } from "../store/purchases";
import { el } from "./dom";
import { EMBLEM_URL, GAME_NAME, gameTagline } from "./brand";
import { flavorOf } from "./flavor";
import { renderMenuBackdrop } from "./menuBackdrop";
import { t, tf } from "../i18n";

// The main menu: where the app opens. The tutorial (first until it's been
// finished once), play the computer (offline), play a person online, or
// read How to Play.
//
// Every user-facing label/blurb here is looked up through `t()` (see
// ../i18n) rather than written as a literal, so this screen -- the first
// thing anyone sees -- is fully localized. `flavorOf(edition).editionName`
// is the one deliberate exception: edition names/flavor carry their own
// voice regardless of UI language (see claude/palacio_i18n_plan.md's
// Colombia-flavor note in the Project).

export interface MenuActions {
  // `level`: this once, instead of the level picked on the menu.
  startVsComputer(level?: AiLevel): void;
  startTutorial(): void;
  goOnline(): void;
  openHowToPlay(): void;
  openShop(): void;
  openStore(): void;
}

const LEVELS: Array<{ level: AiLevel; labelKey: string; blurbKey: string }> = [
  { level: "easy", labelKey: "menu.level.easy.label", blurbKey: "menu.level.easy.blurb" },
  { level: "normal", labelKey: "menu.level.normal.label", blurbKey: "menu.level.normal.blurb" },
  { level: "hard", labelKey: "menu.level.hard.label", blurbKey: "menu.level.hard.blurb" },
];

const EDITIONS: Array<{ edition: Edition; blurbKey: string }> = [
  { edition: "world", blurbKey: "menu.edition.world.blurb" },
  { edition: "colombia", blurbKey: "menu.edition.colombia.blurb" },
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

// A not-yet-purchased edition: dimmed, a lock badge instead of a
// selected/unselected state, and tapping it opens the Store rather than
// picking it (see store/purchases.ts's PAID_EDITIONS -- empty today, so
// this path isn't reachable yet, but it's ready for the next edition).
function lockedChoice(label: string, price: string | null, openStore: () => void): HTMLElement {
  return el(
    "button",
    { className: "menu-choice menu-choice--locked", onclick: openStore },
    [
      el("span", { className: "menu-choice-label" }, [label, " ", el("span", { className: "menu-choice-lock", ariaHidden: "true" }, ["\u{1F512}"])]),
      el("span", { className: "menu-choice-blurb" }, [price ? tf("menu.lockedChoice.buyFor", { price }) : t("menu.lockedChoice.buyInStore")]),
    ],
  );
}

export function renderMenu(state: ClientState, rerender: () => void, actions: MenuActions): HTMLElement {
  const title = [
    // On the setup screen the name shrinks to leave room for the choices.
    el("div", { className: `brand${state.menuStep === "main" ? "" : " brand--compact"}` }, [
      el("img", { className: "brand-emblem", src: EMBLEM_URL, alt: "" }),
      el("div", { className: "brand-words" }, [
        el("h1", { className: "app-title" }, [GAME_NAME]),
        el("p", { className: "subtitle brand-tagline" }, [gameTagline()]),
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
        el("h2", { className: "menu-heading" }, [t("menu.vsComputer.heading")]),
        el("div", { className: "menu-group", role: "group", ariaLabel: t("menu.vsComputer.difficultyGroup") }, [
          el("span", { className: "menu-group-label" }, [t("menu.vsComputer.difficultyGroup")]),
          el(
            "div",
            { className: "menu-choices" },
            LEVELS.map(({ level, labelKey, blurbKey }) => choice(t(labelKey), t(blurbKey), state.aiLevel === level, pickLevel(level))),
          ),
        ]),
        el("div", { className: "menu-group", role: "group", ariaLabel: t("menu.vsComputer.editionGroup") }, [
          el("span", { className: "menu-group-label" }, [t("menu.vsComputer.editionGroup")]),
          el(
            "div",
            { className: "menu-choices" },
            EDITIONS.map(({ edition, blurbKey }) =>
              isEditionUnlocked(edition)
                ? choice(flavorOf(edition).editionName, t(blurbKey), state.aiEdition === edition, pickEdition(edition))
                : lockedChoice(flavorOf(edition).editionName, purchasesState().editionPrices[edition] ?? null, actions.openStore),
            ),
          ),
        ]),
        el(
          "button",
          { className: "menu-big menu-big--quiet", onclick: () => actions.openShop() },
          [el("span", {}, [t("menu.fieldGuide.label")]), el("span", { className: "menu-big-blurb" }, [t("menu.fieldGuide.blurb")])],
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
            [t("common.back")],
          ),
          el("button", { className: "primary", onclick: () => actions.startVsComputer() }, [t("menu.vsComputer.startDuel")]),
        ]),
      ]),
    ]);
  }

  // New players start with the tutorial; afterwards it moves down with How to Play.
  const firstTime = !isGuideDone();
  const tutorial = el(
    "button",
    { className: firstTime ? "primary menu-big" : "menu-big menu-big--quiet", onclick: () => actions.startTutorial() },
    firstTime
      ? [el("span", {}, [t("menu.tutorial.label")]), el("span", { className: "menu-big-blurb" }, [t("menu.tutorial.blurb")])]
      : [t("menu.tutorial.label")],
  );
  // Both real play modes wait on the tutorial: it's where the win/loss
  // condition, stances and the election get taught, and a first duel
  // without any of that lands a new player straight into a rules quiz.
  const vsComputerButton = firstTime
    ? el("button", { className: "menu-big", disabled: true }, [
        el("span", {}, [t("menu.playVsComputer.label")]),
        el("span", { className: "menu-big-blurb" }, [t("menu.playVsComputer.lockedBlurb")]),
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
        [t("menu.playVsComputer.label")],
      );

  const playOnlineButton = !state.onlineAvailable
    ? el("button", { className: "menu-big", disabled: true }, [
        el("span", {}, [t("menu.playOnline.label")]),
        el("span", { className: "menu-big-blurb" }, [t("menu.playOnline.comingSoonBlurb")]),
      ])
    : firstTime
      ? el("button", { className: "menu-big", disabled: true }, [
          el("span", {}, [t("menu.playOnline.label")]),
          el("span", { className: "menu-big-blurb" }, [t("menu.playOnline.lockedBlurb")]),
        ])
      : el("button", { className: "menu-big", onclick: () => actions.goOnline() }, [t("menu.playOnline.label")]);

  return el("div", { className: "menu menu--home" }, [
    renderMenuBackdrop(),
    ...title,
    el("div", { className: "menu-panel" }, [
      firstTime ? tutorial : null,
      vsComputerButton,
      playOnlineButton,
      el("div", { className: "menu-row" }, [
        firstTime ? null : tutorial,
        el("button", { className: "menu-big menu-big--quiet", onclick: () => actions.openHowToPlay() }, [t("menu.howToPlay")]),
        el(
          "button",
          { className: "menu-big menu-big--quiet", onclick: () => actions.openStore() },
          [adsAreRemoved() ? t("menu.store") : t("menu.removeAds")],
        ),
        el(
          "button",
          {
            className: "menu-big menu-big--quiet",
            onclick: () => {
              state.settingsOpen = true;
              rerender();
            },
          },
          [t("menu.settings")],
        ),
      ]),
    ]),
  ]);
}

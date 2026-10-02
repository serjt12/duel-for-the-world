import { settings, updateSettings } from "../audio/settings";
import type { Settings } from "../audio/settings";
import { audioStatus, playSfx, vibrate } from "../audio/sound";
import type { ClientState } from "../state/ClientState";
import { el } from "./dom";
import { locale, setLocale, SUPPORTED_LOCALES, t } from "../i18n";

// Settings: sound effects, music, vibration, and (since this round)
// language. Opens over the menu or a duel (the gear in the board header).

const ROWS: Array<{ key: keyof Settings; labelKey: string; blurbKey: string }> = [
  { key: "sound", labelKey: "settings.sound.label", blurbKey: "settings.sound.blurb" },
  { key: "music", labelKey: "settings.music.label", blurbKey: "settings.music.blurb" },
  { key: "vibration", labelKey: "settings.vibration.label", blurbKey: "settings.vibration.blurb" },
];

// If sound can't play yet (or at all), say so.
function soundNote(): HTMLElement | null {
  const status = audioStatus();
  if (status === "running") return null;
  return el("p", { className: "settings-note" }, [
    status === "unsupported" ? t("settings.sound.unsupported") : t("settings.sound.pending"),
  ]);
}

// A one-row "chip group" the same shape as the Field Guide's type filters
// (see ui/renderShop.ts's .dex-filters/.dex-chip) -- reused here instead
// of a toggle, since this is a pick-one-of-N choice, not an on/off switch.
function languageRow(rerender: () => void): HTMLElement {
  const current = locale();
  return el("div", { className: "settings-row settings-row--language" }, [
    el("span", { className: "settings-text" }, [
      el("span", { className: "menu-choice-label" }, [t("settings.language.label")]),
      el("span", { className: "menu-choice-blurb" }, [t("settings.language.blurb")]),
    ]),
    el(
      "div",
      { className: "dex-filters", role: "group", ariaLabel: t("settings.language.label") },
      SUPPORTED_LOCALES.map(({ code, label }) =>
        el(
          "button",
          {
            type: "button",
            className: `dex-chip${code === current ? " dex-chip--active" : ""}`,
            onclick: () => {
              setLocale(code);
              rerender();
            },
          },
          [label],
        ),
      ),
    ),
  ]);
}

export function renderSettings(state: ClientState, rerender: () => void): HTMLElement | null {
  if (!state.settingsOpen) return null;
  const close = () => {
    state.settingsOpen = false;
    rerender();
  };
  const current = settings();
  const panel = el(
    "div",
    { className: "settings-panel", role: "dialog", ariaLabel: t("settings.heading"), onclick: (event: MouseEvent) => event.stopPropagation() },
    [
      el("h2", { className: "menu-heading" }, [t("settings.heading")]),
      ...ROWS.map(({ key, labelKey, blurbKey }) => {
        const on = current[key];
        return el(
          "button",
          {
            className: `settings-row${on ? " settings-row--on" : ""}`,
            role: "switch",
            ariaChecked: String(on),
            onclick: () => {
              updateSettings({ [key]: !on });
              // Switching something on gives a sample of it.
              if (key === "vibration" && !on) vibrate(40);
              if (key === "sound" && !on) playSfx("turn");
              rerender();
            },
          },
          [
            el("span", { className: "settings-text" }, [
              el("span", { className: "menu-choice-label" }, [t(labelKey)]),
              el("span", { className: "menu-choice-blurb" }, [t(blurbKey)]),
            ]),
            el("span", { className: "settings-switch", ariaHidden: "true" }, [el("span", { className: "settings-knob" })]),
          ],
        );
      }),
      languageRow(rerender),
      soundNote(),
      el("div", { className: "menu-actions" }, [el("span", {}), el("button", { className: "primary", onclick: close }, [t("common.done")])]),
    ],
  );
  return el("div", { className: "settings-backdrop", onclick: close }, [panel]);
}

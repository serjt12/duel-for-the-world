import { settings, updateSettings } from "../audio/settings";
import type { Settings } from "../audio/settings";
import { audioStatus, playSfx, vibrate } from "../audio/sound";
import type { ClientState } from "../state/ClientState";
import { el } from "./dom";

// Settings: sound effects, music and vibration. Opens over the menu or a
// duel (the gear in the board header).

const ROWS: Array<{ key: keyof Settings; label: string; blurb: string }> = [
  { key: "sound", label: "Sound effects", blurb: "Cards, attacks, scandals." },
  { key: "music", label: "Music", blurb: "A quiet background score." },
  { key: "vibration", label: "Vibration", blurb: "A buzz for hits and scandals." },
];

// If sound can't play yet (or at all), say so.
function soundNote(): HTMLElement | null {
  const status = audioStatus();
  if (status === "running") return null;
  return el("p", { className: "settings-note" }, [
    status === "unsupported" ? "This device can't play the game's sound." : "Sound starts after your next tap.",
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
    { className: "settings-panel", role: "dialog", ariaLabel: "Settings", onclick: (event: MouseEvent) => event.stopPropagation() },
    [
      el("h2", { className: "menu-heading" }, ["Settings"]),
      ...ROWS.map(({ key, label, blurb }) => {
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
              el("span", { className: "menu-choice-label" }, [label]),
              el("span", { className: "menu-choice-blurb" }, [blurb]),
            ]),
            el("span", { className: "settings-switch", ariaHidden: "true" }, [el("span", { className: "settings-knob" })]),
          ],
        );
      }),
      soundNote(),
      el("div", { className: "menu-actions" }, [el("span", {}), el("button", { className: "primary", onclick: close }, ["Done"])]),
    ],
  );
  return el("div", { className: "settings-backdrop", onclick: close }, [panel]);
}

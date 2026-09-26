// Player settings: sound effects, music and vibration. Remembered on this
// device (best effort: storage may be unavailable).

export interface Settings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
}

const KEY = "palacio.settings";
const DEFAULTS: Settings = { sound: true, music: true, vibration: true };

function load(): Settings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Settings> | null;
    return {
      sound: typeof saved?.sound === "boolean" ? saved.sound : DEFAULTS.sound,
      music: typeof saved?.music === "boolean" ? saved.music : DEFAULTS.music,
      vibration: typeof saved?.vibration === "boolean" ? saved.vibration : DEFAULTS.vibration,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: Settings = load();
const listeners: Array<(settings: Settings) => void> = [];

export function settings(): Readonly<Settings> {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  for (const listener of listeners) listener(current);
}

export function onSettingsChange(listener: (settings: Settings) => void): void {
  listeners.push(listener);
}

// Offline progress: wins against the computer, remembered on this device
// (best effort: storage may be unavailable). This is what the Card Shop
// (ui/renderShop.ts) unlocks against -- see
// @duel-for-the-world/duel-content's Unlocks.ts for which card unlocks at
// which win count. Online play never reads this.

export interface Progress {
  offlineWins: number;
}

const KEY = "palacio.progress";
const DEFAULTS: Progress = { offlineWins: 0 };

function load(): Progress {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Progress> | null;
    const wins = saved?.offlineWins;
    return { offlineWins: typeof wins === "number" && Number.isFinite(wins) && wins >= 0 ? wins : DEFAULTS.offlineWins };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: Progress = load();
const listeners: Array<(progress: Progress) => void> = [];

export function progress(): Readonly<Progress> {
  return current;
}

/** Call once, the first time a just-finished offline duel's win is shown. */
export function recordOfflineWin(): void {
  current = { offlineWins: current.offlineWins + 1 };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  for (const listener of listeners) listener(current);
}

export function onProgressChange(listener: (progress: Progress) => void): void {
  listeners.push(listener);
}

// Offline progress: wins against the computer, remembered on this device
// (best effort: storage may be unavailable). This is what the Card Shop
// (ui/renderShop.ts) unlocks against -- see
// @duel-for-the-world/duel-content's Unlocks.ts for which card unlocks at
// which win count. Online play never reads this.

export interface Progress {
  offlineWins: number;
  /**
   * Extra "wins," for unlock-gating purposes only, bought with Donations
   * (state/donations.ts) instead of earned by actually winning. Kept
   * separate from offlineWins so nothing that cares about real match
   * results (win totals, the win-screen unlock-reveal animation) gets
   * confused by a purchased shortcut.
   */
  bonusUnlockWins: number;
}

const KEY = "palacio.progress";
const DEFAULTS: Progress = { offlineWins: 0, bonusUnlockWins: 0 };

function load(): Progress {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Progress> | null;
    const wins = saved?.offlineWins;
    const bonus = saved?.bonusUnlockWins;
    return {
      offlineWins: typeof wins === "number" && Number.isFinite(wins) && wins >= 0 ? wins : DEFAULTS.offlineWins,
      bonusUnlockWins: typeof bonus === "number" && Number.isFinite(bonus) && bonus >= 0 ? bonus : DEFAULTS.bonusUnlockWins,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: Progress = load();
const listeners: Array<(progress: Progress) => void> = [];

function persist(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  for (const listener of listeners) listener(current);
}

export function progress(): Readonly<Progress> {
  return current;
}

/**
 * offlineWins plus any early unlocks bought with Donations -- what the
 * Field Guide and offline deck-building (app.ts's cardPool) should treat
 * as "wins" for unlock-gating. Everything else (recordOfflineWin's own
 * threshold check for the win-screen reveal animation) deliberately uses
 * the raw offlineWins instead, so a Donation-bought unlock doesn't
 * trigger that animation out of context on some later real win.
 */
export function effectiveOfflineWins(): number {
  return current.offlineWins + current.bonusUnlockWins;
}

/** Call once, the first time a just-finished offline duel's win is shown. */
export function recordOfflineWin(): void {
  current = { ...current, offlineWins: current.offlineWins + 1 };
  persist();
}

/**
 * Call when the player spends Donations to unlock the next Field Guide
 * card early (state/donations.ts's spendOnUnlock). Unlock steps are
 * spaced 2 wins apart (see duel-content's Unlocks.ts), so +2 effective
 * wins always crosses exactly the next threshold, never more than one.
 */
export function grantBonusUnlockWin(): void {
  current = { ...current, bonusUnlockWins: current.bonusUnlockWins + 2 };
  persist();
}

export function onProgressChange(listener: (progress: Progress) => void): void {
  listeners.push(listener);
}

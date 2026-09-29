// Campaign Donations: a small currency earned by watching a rewarded ad
// (ads/ads.ts's showRewardedAd), spent in the Field Guide to unlock the
// next World Edition card early instead of grinding out more offline
// wins against the computer. On-theme with the game's own satire -- watch
// an ad, take a donation, buy some influence.
//
// Ad-earned only, not sellable for real money (see docs/ADS.md). Purely
// an offline-progression accelerant: it has no effect online (online
// always uses the full card pool) and no effect on match balance, since
// it only ever unlocks a card for the Field Guide/offline deck-building,
// the same thing a real win already does.

export interface DonationsState {
  balance: number;
}

const KEY = "palacio.donations";
const DEFAULTS: DonationsState = { balance: 0 };

/** Donations it costs to unlock one Field Guide card early. */
export const UNLOCK_COST = 5;

function load(): DonationsState {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<DonationsState> | null;
    const balance = saved?.balance;
    return { balance: typeof balance === "number" && Number.isFinite(balance) && balance >= 0 ? balance : DEFAULTS.balance };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: DonationsState = load();
const listeners: Array<(state: DonationsState) => void> = [];

function persist(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  for (const listener of listeners) listener(current);
}

export function donations(): Readonly<DonationsState> {
  return current;
}

export function onDonationsChange(listener: (state: DonationsState) => void): void {
  listeners.push(listener);
}

/** Call after a rewarded ad actually grants its reward (showRewardedAd resolved { rewarded: true }). */
export function addDonation(): void {
  current = { balance: current.balance + 1 };
  persist();
}

/** True if there's enough saved up to buy the next unlock right now. */
export function canAffordUnlock(): boolean {
  return current.balance >= UNLOCK_COST;
}

/**
 * Spends UNLOCK_COST donations. Returns false (and spends nothing) if the
 * balance is too low -- callers should also check canAffordUnlock() before
 * showing a buy button as enabled; this is just the safety net against a
 * stale render.
 */
export function spendOnUnlock(): boolean {
  if (current.balance < UNLOCK_COST) return false;
  current = { balance: current.balance - UNLOCK_COST };
  persist();
  return true;
}

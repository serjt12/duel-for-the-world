// Real-money purchases: "Remove Ads" (a one-time unlock) and paid country
// editions (currently none -- see PAID_EDITIONS below), both sold through
// RevenueCat, which wraps Google Play Billing (and later Apple's, so the
// same purchase code works unchanged if/when this ships on iOS). See
// docs/MONETIZATION.md for the RevenueCat/Play Console setup this depends
// on -- that part is the owner's own accounts, same as docs/SERVER.md's
// Fly.io deploy.
//
// Same shape as audio/settings.ts and state/progress.ts: a module-level
// cache plus a listener list. Unlike those, the source of truth isn't
// localStorage -- it's RevenueCat's own record of what this Play Store
// account owns, which is what makes a purchase survive a reinstall.

import { Capacitor } from "@capacitor/core";
import { LOG_LEVEL, Purchases } from "@revenuecat/purchases-capacitor";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import type { Edition } from "@duel-for-the-world/duel-content";

// From the RevenueCat dashboard (Project settings -> API keys -> Google
// Play). A public, purchase-initiating key, not a secret -- safe to ship
// in the client, since RevenueCat's dashboard (not this key) is what
// actually controls which products/entitlements it's allowed to grant.
// Set via VITE_REVENUECAT_ANDROID_KEY at build time (same pattern as
// main.ts's VITE_SERVER_URL); unset in local/dev builds, where purchases
// just stay unavailable rather than erroring.
const REVENUECAT_ANDROID_API_KEY = import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined;

// RevenueCat identifiers (configured in the dashboard, matched against
// real Google Play in-app products -- see docs/MONETIZATION.md).
const REMOVE_ADS_ENTITLEMENT = "remove_ads";
const REMOVE_ADS_PACKAGE = "remove_ads";

/**
 * Editions that ship free with the base game and always stay that way.
 * World and Colombia were both already free before any of this existed
 * (Colombia was a shipped, freely-selectable edition long before there
 * was any purchase flow at all) -- they're grandfathered rather than
 * retroactively paywalled. Only a *new* edition would ever go in
 * PAID_EDITIONS below.
 */
const FREE_EDITIONS: ReadonlySet<Edition> = new Set<Edition>(["world", "colombia"]);

/**
 * Paid editions: maps an edition id to the RevenueCat entitlement and
 * offering package that unlock/sell it. Empty today -- neither current
 * edition is paid -- but ready for the next one: add a line here (plus a
 * matching entitlement + package in the RevenueCat and Play Console
 * dashboards, and the edition's own card data in
 * @duel-for-the-world/duel-content) and the store panel, the
 * vs-computer edition picker, and isEditionUnlocked() all pick it up
 * with no further code changes.
 *
 * Example, once a real one ships:
 *   mexico: { entitlementId: "edition_mexico", packageId: "edition_mexico", label: "Edición México" },
 */
const PAID_EDITIONS: Partial<Record<Edition, { entitlementId: string; packageId: string; label: string }>> = {};

export interface PurchasesState {
  // False until initPurchases() has answered once (configured and
  // fetched customer info, or given up because it can't run here).
  ready: boolean;
  // False on web/dev builds and any build with no API key set -- there's
  // no real store to buy from outside the installed Android app.
  available: boolean;
  adsRemoved: boolean;
  unlockedEditions: ReadonlySet<Edition>;
  removeAdsPrice: string | null;
  editionPrices: Partial<Record<Edition, string>>;
  // A purchase or restore is in flight -- the store panel disables its
  // buttons meanwhile rather than risking a double-tap double-charge.
  busy: boolean;
}

let current: PurchasesState = {
  ready: false,
  available: false,
  adsRemoved: false,
  unlockedEditions: FREE_EDITIONS,
  removeAdsPrice: null,
  editionPrices: {},
  busy: false,
};

const listeners: Array<(state: PurchasesState) => void> = [];
let packagesById: Record<string, PurchasesPackage> = {};

function set(patch: Partial<PurchasesState>): void {
  current = { ...current, ...patch };
  for (const listener of listeners) listener(current);
}

export function purchasesState(): Readonly<PurchasesState> {
  return current;
}

export function onPurchasesChange(listener: (state: PurchasesState) => void): void {
  listeners.push(listener);
}

export function isEditionUnlocked(edition: Edition): boolean {
  return current.unlockedEditions.has(edition);
}

export function adsAreRemoved(): boolean {
  return current.adsRemoved;
}

/** Which paid editions exist to sell right now (may be none -- see PAID_EDITIONS). */
export function paidEditions(): Edition[] {
  return Object.keys(PAID_EDITIONS) as Edition[];
}

export function editionListing(edition: Edition): { entitlementId: string; packageId: string; label: string } | null {
  return PAID_EDITIONS[edition] ?? null;
}

function applyEntitlements(activeEntitlementIds: ReadonlySet<string>): void {
  const unlocked = new Set<Edition>(FREE_EDITIONS);
  for (const [edition, info] of Object.entries(PAID_EDITIONS) as Array<[Edition, { entitlementId: string }]>) {
    if (activeEntitlementIds.has(info.entitlementId)) unlocked.add(edition);
  }
  set({
    adsRemoved: activeEntitlementIds.has(REMOVE_ADS_ENTITLEMENT),
    unlockedEditions: unlocked,
  });
}

// The RevenueCat Capacitor plugin wraps most results in a container
// object (e.g. `{ customerInfo }`), but the update listener has been
// known to hand back the CustomerInfo directly depending on version --
// this unwraps either shape rather than assuming one.
function entitlementIdsFrom(customerInfoOrWrapper: unknown): Set<string> {
  const wrapper = customerInfoOrWrapper as { customerInfo?: { entitlements?: { active?: Record<string, unknown> } } };
  const direct = customerInfoOrWrapper as { entitlements?: { active?: Record<string, unknown> } };
  const active = wrapper?.customerInfo?.entitlements?.active ?? direct?.entitlements?.active ?? {};
  return new Set(Object.keys(active));
}

async function refreshOfferings(): Promise<void> {
  try {
    const offerings = await Purchases.getOfferings();
    const available = offerings.current?.availablePackages ?? [];
    packagesById = Object.fromEntries(available.map((pkg) => [pkg.identifier, pkg]));
    const editionPrices: Partial<Record<Edition, string>> = {};
    for (const [edition, info] of Object.entries(PAID_EDITIONS) as Array<[Edition, { packageId: string }]>) {
      const price = packagesById[info.packageId]?.product.priceString;
      if (price) editionPrices[edition] = price;
    }
    set({ removeAdsPrice: packagesById[REMOVE_ADS_PACKAGE]?.product.priceString ?? null, editionPrices });
  } catch (error) {
    // Offline, or the RevenueCat dashboard's offering isn't set up yet:
    // buy buttons stay usable (RevenueCat errors clearly if tapped while
    // genuinely unconfigured) -- they just won't show a price yet.
    console.warn("purchases: couldn't load offerings", error);
  }
}

/**
 * Call once at startup (see app.ts). A no-op outside the installed
 * Android app, and outside a build with a real API key set -- there's no
 * Play Billing to talk to from a browser tab or a keyless dev build, so
 * purchases just stay unavailable there instead of throwing.
 */
export async function initPurchases(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !REVENUECAT_ANDROID_API_KEY) {
    set({ ready: true, available: false });
    return;
  }
  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
    await Purchases.configure({ apiKey: REVENUECAT_ANDROID_API_KEY });
    Purchases.addCustomerInfoUpdateListener((update: unknown) => applyEntitlements(entitlementIdsFrom(update)));
    const info = await Purchases.getCustomerInfo();
    applyEntitlements(entitlementIdsFrom(info));
    set({ ready: true, available: true });
    void refreshOfferings();
  } catch (error) {
    console.error("purchases: failed to configure RevenueCat", error);
    set({ ready: true, available: false });
  }
}

export interface PurchaseResult {
  ok: boolean;
  cancelled?: boolean;
  error?: string;
}

async function purchasePackageById(packageId: string): Promise<PurchaseResult> {
  if (!current.available) return { ok: false, error: "Purchases aren't available on this build." };
  const pkg = packagesById[packageId];
  if (!pkg) return { ok: false, error: "This isn't for sale yet -- try again in a moment." };
  set({ busy: true });
  try {
    const result = await Purchases.purchasePackage({ aPackage: pkg });
    applyEntitlements(entitlementIdsFrom(result));
    return { ok: true };
  } catch (error) {
    const purchasesError = error as { userCancelled?: boolean; message?: string };
    return {
      ok: false,
      cancelled: purchasesError.userCancelled === true,
      error: purchasesError.message ?? "The purchase didn't go through.",
    };
  } finally {
    set({ busy: false });
  }
}

export function buyRemoveAds(): Promise<PurchaseResult> {
  return purchasePackageById(REMOVE_ADS_PACKAGE);
}

export function buyEdition(edition: Edition): Promise<PurchaseResult> {
  const info = PAID_EDITIONS[edition];
  if (!info) return Promise.resolve({ ok: false, error: "This edition isn't for sale." });
  return purchasePackageById(info.packageId);
}

/** Required by both app stores: lets a player re-grant what they already bought (a new device, a reinstall). */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!current.available) return { ok: false, error: "Purchases aren't available on this build." };
  set({ busy: true });
  try {
    const result = await Purchases.restorePurchases();
    applyEntitlements(entitlementIdsFrom(result));
    return { ok: true };
  } catch (error) {
    const purchasesError = error as { message?: string };
    return { ok: false, error: purchasesError.message ?? "Couldn't restore purchases." };
  } finally {
    set({ busy: false });
  }
}

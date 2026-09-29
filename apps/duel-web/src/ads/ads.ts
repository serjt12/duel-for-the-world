// AdMob: interstitial ads shown between matches, never during one, capped so
// they don't wear players out. Rewarded ads are wired up (showRewardedAd)
// but not yet called from anywhere -- there's no reward designed for them
// yet, so hooking one up to a UI button is a separate step.
//
// This only does anything in a real Android build (Capacitor.isNativePlatform()).
// In local dev (pnpm dev) or a keyless build, every function here is a no-op,
// same pattern as store/purchases.ts.
//
// Every ad unit ID defaults to Google's public test IDs
// (https://developers.google.com/admob/android/test-ads#sample_ad_units) so a
// fresh checkout is always safe to build and run -- it never requests a real
// ad, and can never accidentally generate invalid traffic against a real
// AdMob account, until real ad unit IDs are set for a release build.
import { Capacitor } from "@capacitor/core";
import { adsAreRemoved } from "../store/purchases";

const TEST_INTERSTITIAL_ID = "ca-app-pub-3940256099942544/1033173712";
const TEST_REWARDED_ID = "ca-app-pub-3940256099942544/5224354917";

const CONFIGURED_INTERSTITIAL_ID = import.meta.env.VITE_ADMOB_INTERSTITIAL_ID as string | undefined;
const CONFIGURED_REWARDED_ID = import.meta.env.VITE_ADMOB_REWARDED_ID as string | undefined;
const INTERSTITIAL_ID = CONFIGURED_INTERSTITIAL_ID || TEST_INTERSTITIAL_ID;
const REWARDED_ID = CONFIGURED_REWARDED_ID || TEST_REWARDED_ID;
// True whenever either ad unit is still the test fallback -- an extra
// safety net so a build with only one real ID configured doesn't
// accidentally send test-flagged requests to the other, real, ad unit.
const USING_TEST_ADS = !CONFIGURED_INTERSTITIAL_ID || !CONFIGURED_REWARDED_ID;

// Show an interstitial after every Nth completed match (not counting the
// mandatory tutorial), reset whenever one is actually shown.
const MATCHES_BETWEEN_INTERSTITIALS = 3;
const MATCH_COUNTER_KEY = "palacio.ads.matchesSinceInterstitial";

type AdMobModule = typeof import("@capacitor-community/admob");

let sdk: AdMobModule | null = null;
let canRequestAds = false;
let initStarted = false;

function readMatchCounter(): number {
  try {
    const raw = window.localStorage.getItem(MATCH_COUNTER_KEY);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeMatchCounter(n: number): void {
  try {
    window.localStorage.setItem(MATCH_COUNTER_KEY, String(n));
  } catch {
    // ignore -- worst case the cadence resets on next launch
  }
}

/**
 * Call once, at startup (see app.ts, next to initPurchases()). Sets up the
 * Google Mobile Ads SDK and, if the player is in the EEA/UK, runs Google's
 * consent (UMP) flow before any ad is ever requested.
 */
export async function initAds(): Promise<void> {
  if (initStarted || !Capacitor.isNativePlatform()) return;
  initStarted = true;
  try {
    sdk = await import("@capacitor-community/admob");
    const { AdMob, AdmobConsentStatus } = sdk;

    // Consent (GDPR/UMP) comes before initialize(), per Google's own
    // guidance -- initialize() should only run once consent is settled.
    let info = await AdMob.requestConsentInfo();
    if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
      info = await AdMob.showConsentForm();
    }
    canRequestAds = info.canRequestAds;
    if (!canRequestAds) return;

    await AdMob.initialize({ initializeForTesting: USING_TEST_ADS });
  } catch (err) {
    // No network, plugin not installed yet (pnpm install still pending),
    // consent form dismissed without resolving, etc. -- ads just stay off
    // for this session rather than breaking anything else.
    console.warn("AdMob init failed", err);
    canRequestAds = false;
  }
}

/**
 * Call right after a real duel (not the tutorial) ends and the player backs
 * out to the menu. Shows a full-screen interstitial every
 * MATCHES_BETWEEN_INTERSTITIALS-th time this is called, unless the player
 * bought Remove Ads.
 */
export async function maybeShowInterstitialAfterMatch(): Promise<void> {
  if (!sdk || !canRequestAds || adsAreRemoved()) return;

  const count = readMatchCounter() + 1;
  if (count < MATCHES_BETWEEN_INTERSTITIALS) {
    writeMatchCounter(count);
    return;
  }

  try {
    const { AdMob } = sdk;
    await AdMob.prepareInterstitial({ adId: INTERSTITIAL_ID, isTesting: USING_TEST_ADS });
    await AdMob.showInterstitial();
    writeMatchCounter(0);
  } catch (err) {
    // Failed to load/show (offline, no fill, etc.) -- don't burn the
    // player's place in the cadence for an ad that never played.
    console.warn("Interstitial failed", err);
  }
}

export interface RewardedAdResult {
  /** True only if the player watched to the end and actually earned the reward. */
  rewarded: boolean;
}

/** For UI gating: is there any point showing a "Watch ad" button right now? */
export function rewardedAdAvailable(): boolean {
  return sdk !== null && canRequestAds;
}

/**
 * Not called from anywhere yet -- there's no reward designed for it. Ready
 * to wire up to a "Watch ad" button once there is: resolves { rewarded:
 * true } only if AdMob's Rewarded event actually fires before the ad is
 * dismissed; resolves { rewarded: false } if the player closes it early or
 * it fails to show.
 */
export async function showRewardedAd(): Promise<RewardedAdResult> {
  if (!sdk || !canRequestAds) return { rewarded: false };
  const { AdMob, RewardAdPluginEvents } = sdk;

  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARDED_ID, isTesting: USING_TEST_ADS });
  } catch (err) {
    console.warn("Rewarded ad failed to load", err);
    return { rewarded: false };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (rewarded: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ rewarded });
    };
    void AdMob.addListener(RewardAdPluginEvents.Rewarded, () => finish(true));
    void AdMob.addListener(RewardAdPluginEvents.Dismissed, () => finish(false));
    void AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish(false));
    void AdMob.showRewardVideoAd().catch((err) => {
      console.warn("Rewarded ad failed to show", err);
      finish(false);
    });
  });
}

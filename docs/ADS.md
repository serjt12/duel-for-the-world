# Ads (AdMob)

**Shipped in version 1.1.0 (versionCode 2), uploaded to Closed testing on
2026-09-29 -- still on Google's test ad IDs.**

`apps/duel-web/src/ads/ads.ts` shows AdMob interstitial ads between matches
(never during one), respects the Remove Ads purchase
(`docs/MONETIZATION.md`), and runs Google's EEA/UK consent (UMP) flow
before ever requesting an ad. The rewarded ad is wired to a "Watch ad: +1
Donation" button in the Field Guide -- see "Donations" below.

Like the RevenueCat integration, this only does anything in a real Android
build. In local dev (`pnpm dev`) or a keyless build, `initAds()` and
`maybeShowInterstitialAfterMatch()` are no-ops.

**Every ad unit ID defaults to Google's public test IDs.** A fresh checkout
is always safe to build and run: it will show real (Google-served) test ad
creatives, never a real ad, and can never accidentally rack up invalid
traffic against a real AdMob account. Nothing here is "live" until you set
real IDs, below.

## One-time setup (your own AdMob and Play Console accounts)

1. **Create an AdMob account** at admob.google.com, same Google account as
   Play Console.
2. **Add the app.** Once it exists in Play Console it can usually be found
   there by package name (`com.jandreus.duelfortheworld`); otherwise add it
   manually in AdMob and link it later.
3. **Create two ad units:** an Interstitial ("Between Matches") and a
   Rewarded one (name it for whatever reward you land on). Each gives you
   an ad unit ID, `ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY`.
4. **Copy the App ID** too -- a different, longer id
   (`ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`) that identifies the whole app,
   not one ad unit. Under AdMob -> Apps -> your app -> App settings.
5. **Set up EEA/UK consent.** AdMob -> Privacy & messaging -> create a GDPR
   message. Google hosts it; the app already calls it via
   `requestConsentInfo()` / `showConsentForm()` in `ads.ts`.
6. **Set the real IDs for a release build:**
   - The App ID goes in `apps/duel-web/capacitor.config.json`'s
     `admobAppId` field (not a secret -- it's baked into the APK either
     way, safe to commit). `pnpm android:setup` writes it into
     `AndroidManifest.xml`'s `com.google.android.gms.ads.APPLICATION_ID`
     meta-data; safe to run again any time.
   - The two ad unit IDs go in `apps/duel-web/.env.production.local`
     (same file `VITE_SERVER_URL` and `VITE_REVENUECAT_ANDROID_KEY` live
     in):
     ```
     VITE_ADMOB_INTERSTITIAL_ID=ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY
     VITE_ADMOB_REWARDED_ID=ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY
     ```
     Leaving either one unset keeps that ad on Google's test ID.
7. **Install and sync** (from `apps/duel-web`, your own terminal -- same
   standing limitation as the RevenueCat setup, this session's device
   bridge can't run `pnpm install` against this monorepo):
   ```
   pnpm install
   npx cap sync android
   pnpm android:setup
   ```

## Donations (the rewarded-ad reward)

Watching a rewarded ad grants one "Donation" (`state/donations.ts`), a
small currency spent in the Field Guide (`ui/renderShop.ts`) to unlock the
next World Edition card early -- 5 Donations per unlock (`UNLOCK_COST`),
instead of grinding out 2 more offline wins the normal way. Ad-earned
only, not sellable for real money. Has no effect online (online always
uses the full card pool) and no effect on match balance -- it only
accelerates the same offline-progression unlock a real win already
grants, via `state/progress.ts`'s `bonusUnlockWins` (kept separate from
the real `offlineWins` counter, so it can't be confused with an actual
win total anywhere).

## Testing before it's live

- With no real IDs set, every ad you see in a debug or internal-testing
  build is already a genuine AdMob test ad -- safe to tap, close, watch,
  as much as you want.
- Once you do set real ad unit IDs, **add your own device as an AdMob test
  device** (AdMob shows you how the first time you view an ad on it) before
  tapping/watching your own real ads -- interacting with your own live ads
  is what trips Google's invalid-traffic policy and can get the account
  restricted.
- The interstitial shows after every 3rd completed match (not the
  tutorial) -- `MATCHES_BETWEEN_INTERSTITIALS` in `ads.ts` if that cadence
  ever needs to change.

## Play Console declarations -- done as of version 1.1.0 (versionCode 2)

The AdMob SDK now ships in every build, even though every ad unit ID still
defaults to Google's test IDs -- so these are flipped at first upload, not
held back until real ad units exist:

- **Store presence -> App content -> Ads**: Yes.
- **Data safety**: Advertising ID declared as collected and shared with
  Google/AdMob for advertising purposes.
- **Privacy policy** (`store/privacy-policy.html`): now has an Advertising
  section and an In-app purchases section (the latter for the RevenueCat
  work in `docs/MONETIZATION.md`).

Re-check these once real ad unit IDs go in -- normally nothing changes,
since the SDK and its data collection are already accounted for either way.

## Troubleshooting

- **No ad ever shows, even a test one.** Check `initAds()` actually ran
  (`Capacitor.isNativePlatform()` is false in a browser/dev build, by
  design) and that `canRequestAds` came back true -- if a player is in the
  EEA/UK and closes the consent form without choosing, AdMob can correctly
  refuse to serve anything.
- **Ad shows constantly / too often.** Check `Remove Ads` didn't fail to
  apply (`adsAreRemoved()` in `store/purchases.ts`) and that
  `backToMenu()`'s `matchFinished` gate is only true for a real duel with a
  winner, not the tutorial or a lobby exit.

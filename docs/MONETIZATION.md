# Remove Ads and paid editions (in-app purchases)

**Shipped in version 1.1.0 (versionCode 2), uploaded to Closed testing on
2026-09-29 -- not yet live (needs the RevenueCat + Play Console product
setup below, and a real-device purchase test).**

`apps/duel-web/src/store/purchases.ts` is what sells "Remove Ads" (a
one-time, non-consumable purchase) and, later, paid country editions,
through [RevenueCat](https://www.revenuecat.com/), which wraps Google
Play Billing (and Apple's, if this ever ships on iOS, with no code
changes needed on that side).

This only matters for a release build of the Android app. It's never hit
in local dev (`pnpm dev`) or a keyless build -- purchases just report
"not available" there instead of erroring, so day-to-day development
doesn't need any of this set up.

## Why RevenueCat instead of raw Play Billing

Handles receipt validation, entitlement state and restores for you, has a
free tier that easily covers a solo-dev-scale app, and the same client
code carries over to iOS later. The alternative (the native Play Billing
Library directly) means owning all of that yourself, including receipt
validation server-side. Not worth it at this scale.

## One-time setup

**All of this is your own RevenueCat and Google Play Console accounts --
not something Claude can do for you.**

1. **Create the Play Console product.** In the Play Console, your app ->
   Monetize -> Products -> In-app products -> Create product. Product ID
   `remove_ads`, one-time (not a subscription). Set a price, activate it.
   A product can't be bought until the app itself has at least one release
   uploaded to an open track (internal testing is enough).
2. **Create a RevenueCat account** at app.revenuecat.com, add a new
   project for this app.
3. **Connect Play Console to RevenueCat.** RevenueCat's dashboard walks
   through creating a Google Cloud service account with access to your
   Play Console and pasting its credentials in -- this is what lets
   RevenueCat verify purchases server-side. Their own docs
   (Integrations -> Google Play Store) are more current than anything
   written here; follow those.
4. **Create the entitlement.** RevenueCat dashboard -> Entitlements ->
   New -> id `remove_ads`. Attach the `remove_ads` Play Console product
   to it.
5. **Create the offering and package.** Offerings -> New -> id `default`
   (RevenueCat's own default, `Purchases.getOfferings()` reads whichever
   offering is marked current). Add a package inside it with identifier
   `remove_ads`, pointing at the `remove_ads` product.
6. **Get the Android API key.** Project settings -> API keys -> Google
   Play Store app -> copy the public SDK key (starts `goog_...`).
7. **Set it for the build:** add to `apps/duel-web/.env.production.local`
   (same file `VITE_SERVER_URL` already lives in):
   ```
   VITE_REVENUECAT_ANDROID_KEY=goog_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
8. **Install the package and sync the native project** (from
   `apps/duel-web`, in your own terminal -- this session's device bridge
   can't run `pnpm install` against this monorepo's symlinked
   `node_modules`, the same standing limitation noted throughout this
   project's other docs):
   ```
   pnpm install
   npx cap sync android
   ```
   `pnpm install` pulls down `@revenuecat/purchases-capacitor` (already
   added to `package.json`) and its native Android dependency; `cap sync`
   wires that native dependency into the Android project.

## Testing before it's live

- Add your own Google account as a **license tester** in Play Console
  (Setup -> License testing) so test purchases don't actually charge you.
- A test purchase still needs a real build installed from an internal
  testing (or higher) track -- a purchase button tapped in a debug build
  side-loaded via `cap run android` won't find real Play Billing products
  to buy, since Play Billing only activates for a build the Play Store
  itself installed.
- RevenueCat's dashboard (Customers tab) shows every purchase/restore
  live, including test ones -- useful for confirming the entitlement
  actually got granted rather than just trusting the app's own UI.

## Adding a new paid edition later

The code is already generic (`store/purchases.ts`'s `PAID_EDITIONS`,
empty today since World and Colombia both stay free -- see that file's
comment for why). When a new edition is ready to sell:

1. Build the edition itself first (new `Edition` union member and card
   data in `@duel-for-the-world/duel-content`, same as Colombia was).
2. Play Console: a new one-time product, e.g. `edition_mexico`.
3. RevenueCat: a new entitlement (e.g. `edition_mexico`) attached to that
   product, and a new package (same identifier) added to the `default`
   offering.
4. One line in `store/purchases.ts`'s `PAID_EDITIONS`:
   ```ts
   mexico: { entitlementId: "edition_mexico", packageId: "edition_mexico", label: "Edición México" },
   ```
   The Store panel, the "Play vs Computer" edition picker, and
   `isEditionUnlocked()` all pick it up automatically -- no other code
   changes.

## Troubleshooting

- **A buy button shows "..." forever instead of a price.** The offering's
  package identifier doesn't match what the code expects (`remove_ads`,
  or an edition's `packageId` from `PAID_EDITIONS`) -- double-check the
  RevenueCat dashboard's Offerings page. Also normal for the first few
  seconds after opening the Store while `getOfferings()` is still
  in flight.
- **Buy button does nothing, or errors immediately, in a real Play Store
  build.** Check `VITE_REVENUECAT_ANDROID_KEY` was actually set at build
  time (an empty/missing key makes purchases silently report
  "unavailable" -- see `store/purchases.ts`'s `initPurchases()`), and that
  the Play Console product is Active, not still in draft.
- **A purchase succeeds but the entitlement doesn't unlock anything in
  the app.** Check the entitlement id in the RevenueCat dashboard exactly
  matches the string `store/purchases.ts` checks for (`remove_ads`, or an
  edition's `entitlementId`) -- these are matched by exact string, not by
  product id.

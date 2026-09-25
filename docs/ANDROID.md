# PALACIO on Android

The game is a web app wrapped as an Android app with
[Capacitor](https://capacitorjs.com/). The Android project lives in
`apps/duel-web/android/`. Play vs Computer works fully offline; Play Online
needs the game server hosted on the internet (wss://), which comes later.

## One-time setup (Windows)

1. **Node.js 22 or newer** (`node --version`). Capacitor 8 requires it.
2. **Android Studio** (2025.2.1 or newer). On first start, let it install the
   Android SDK. It brings its own Java, so you don't need to install one.
3. In the project folder: `pnpm install` (adds Capacitor).
4. The Android project is already created (`apps/duel-web/android/`). If
   you ever need to recreate it, delete that folder and run:

   ```
   pnpm --filter @project-palacio/duel-web android:add
   ```

   This recreates the project, then locks the app to landscape and hides the
   phone's status and navigation bars while you play
   (`apps/duel-web/scripts/android-setup.mjs`).

## Play it on your phone

1. On the phone: Settings -> About phone -> tap "Build number" 7 times to
   unlock Developer options, then turn on **USB debugging**.
2. Plug the phone into the PC and accept the "Allow USB debugging?" prompt.
3. Build and install:

   ```
   pnpm android:run
   ```

   Or run `pnpm android:sync` then `pnpm android:open`, and press the green
   Run button in Android Studio.

After changing the game's code, run `android:run` (or `android:sync`) again:
it rebuilds the web app and copies it into the Android project.

## Before publishing

- **App id:** `apps/duel-web/capacitor.config.json` uses `com.palacio.duel`
  as a placeholder. The id is permanent once uploaded to Google Play, so pick
  your final one first (e.g. `com.<yourname>.palacio`). Changing it later
  means recreating the Android project (step 4 above) with the new id.
- **Online play from the app:** put the server's address in
  `apps/duel-web/.env.production.local` (git ignores this file):

  ```
  VITE_SERVER_URL=wss://your-server.example
  ```

  Then run `android:sync` or `android:run`. Android apps can't use plain
  `ws://` addresses, so the server needs a secure (wss://) address.
- **Test with large system fonts:** Android's font-size setting can enlarge
  text in the app; check the board still fits.

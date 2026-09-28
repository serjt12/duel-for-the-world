# Duel for the World on Android

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
   pnpm --filter @duel-for-the-world/duel-web android:add
   ```

   This recreates the project, then locks the app to landscape, hides the
   phone's status and navigation bars while you play, and allows vibration
   (`apps/duel-web/scripts/android-setup.mjs`). The setup step is safe to
   run again on its own at any time: `pnpm android:setup`.

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

## Name, app id and icon

- The name and the app id come from `apps/duel-web/capacitor.config.json`:
  "Duel for the World" and `com.jandreus.duelfortheworld`. **The app id is
  permanent once uploaded to Google Play.** The name can change any time
  (also change it in `src/ui/brand.ts`).
- The icon and launch screen images are in `apps/duel-web/branding/android/res`.
- `pnpm android:setup` applies the name, app id, icon, launch screen and
  release signing to the Android project. It's safe to run again.

## Release builds (for Google Play)

Google Play only accepts builds signed with your **upload key**. You create it
once, and it is yours alone: never share it or put it in git. Keep a backup of
the key file and its password (e.g. in a password manager). Google Play App
Signing keeps the real signing key, so a lost upload key can be reset through
Google support, but that takes time.

1. Create the key, in the `apps/duel-web/android` folder. It asks you to
   choose a password and for your name. `keytool` comes with Android Studio's
   Java: if Windows says it can't find it, use its full path,
   `"C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"`.

   ```
   keytool -genkeypair -v -keystore upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```

2. Next to it, create `apps/duel-web/android/keystore.properties`:

   ```
   storeFile=upload-key.jks
   storePassword=the password you chose
   keyAlias=upload
   keyPassword=the password you chose
   ```

   Both files are git-ignored.
3. Build the bundle:

   ```
   pnpm android:bundle
   ```

   It prints where the `.aab` is (`android/app/build/outputs/bundle/release/`).
4. Before every new upload, raise `versionCode` (1, 2, 3...) and `versionName`
   in `apps/duel-web/android/app/build.gradle`. Google Play refuses a
   versionCode it has already seen.

The listing texts, icon, feature graphic and privacy policy are in `store/`
(see [store/listing.md](../store/listing.md)).

## Before publishing

- **Online play from the app:** deploy the game server first (see
  [docs/SERVER.md](SERVER.md)), then put its address in
  `apps/duel-web/.env.production.local` (git ignores this file):

  ```
  VITE_SERVER_URL=wss://your-app-name.fly.dev
  ```

  Then run `android:sync` or `android:run`. Android apps can't use plain
  `ws://` addresses, so the server needs a secure (wss://) address. Until a
  server is set, release builds show Play Online as "Coming soon".
- **Test with large system fonts:** Android's font-size setting can enlarge
  text in the app; check the board still fits.

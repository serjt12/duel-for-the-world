# Roadmap: Duel for the World on Google Play

**Goal:** a well-designed, fun game published on Android first (iOS later from
the same code).

Owner decisions so far:

- **Android first.**
- **Landscape.**
- **Live online matches and matches against the computer.**
- **Free with ads.**

## Done

- [x] The rules engine, two editions (World: 39 cards; Colombia: 24 cards)
  with art, and Election Night.
- [x] Bot-tested balance. Every card sits within about ±5 points of win rate,
  except Lobbying Deal (about +7).
- [x] Online duels by room code (local server), with the game server
  checking every move and hiding each player's hidden cards.
- [x] **Phase 1, playable on a phone:**
  - [x] Main menu.
  - [x] Computer opponent: Easy / Normal / Hard, offline.
  - [x] Landscape phone layout, tap controls, long-press card zoom.
  - [x] The Android app shell (Capacitor), locked to landscape and full
    screen.

## Next

### Phase 2: Fun and feel

- [x] A guided first duel (Tutorial), scripted, about 5 minutes.
- [x] Sound, music and vibration, with toggles in Settings.
- [x] A turn banner, an animation for cards returning from the Embassy, and
  attack targets that show what the attack would do.
- [x] Bigger key text on the phone layout (field cards show name and
  ATK/DEF big; long-press for the rest).
- [ ] Playtests on real phones. Tune match length (a quick match with an
  earlier election?).
- [ ] Re-check Lobbying Deal.

### Phase 3: Google Play setup (in parallel)

- [x] Name: **Duel for the World**. App id: `com.jandreus.duelfortheworld`.
- [x] App icon, launch screen, store icon and feature graphic.
- [x] Release build setup: signing from `keystore.properties`,
  `pnpm android:bundle`.
- [x] Privacy policy page and store listing texts (`store/`).
- [ ] Google Play developer account ($25, one-time, identity check).
- [ ] Create the upload key and build the first `.aab`.
- [ ] Host the privacy policy at a public address.
- [ ] Phone screenshots for the listing.
- [ ] A new personal account needs a **closed test with 12 testers for 14
  days** before going public.

### Phase 4: Live online play

- [x] Reconnect (a dropped connection can rejoin its seat), a turn timer
  (an AFK opponent can't stall a match forever), and room cleanup (see
  [docs/SERVER.md](SERVER.md)).
- [ ] Host the server on Fly.io at a secure (wss://) address -- deploy
  files are ready (`Dockerfile`, `fly.toml`); this step is the owner
  running `fly deploy` from their own account.
- [ ] Invite a friend by link or room code.
- [ ] Quick match, with a clearly labelled "play the computer instead" when
  nobody is online.

### Phase 5: Ads and retention

- [ ] AdMob, between matches only and never during one, with a frequency cap.
  Consent form for EEA/UK players.
- [ ] Optional rewarded ads.
- [ ] A "World Tour" campaign against computer Leaders; card unlocks; a daily
  challenge; later, a deck builder.

### Phase 6: Play Store launch

- [ ] Icon, feature graphic, landscape screenshots, a short trailer, store
  text.
- [ ] Privacy policy (ads collect device data), the Data safety form, an IARC
  age rating.
- [ ] Soft launch in a few countries, then worldwide.
- [ ] Trademark check for "Duel for the World" and a legal read of the satire.

### Later

- [ ] iOS (same code; needs a Mac or a cloud build service, and the Apple
  Developer Program).
- [ ] More country editions after Colombia.

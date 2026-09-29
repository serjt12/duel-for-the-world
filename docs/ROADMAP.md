# Roadmap: Duel for the World on Google Play

**Goal:** a well-designed, fun game published on Android first (iOS later from
the same code).

Owner decisions so far:

- **Android first.**
- **Landscape.**
- **Live online matches and matches against the computer.**
- **Free with ads**, plus a one-time Remove Ads purchase and paid country
  editions as DLC (RevenueCat) -- see Phase 5.

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
- [x] Playtests on real phones. Match length tuned (round 16). The owner
  played several matches on-device and confirmed sound, vibration and text
  size all work; field-card text is intentionally small on the phone
  layout -- long-press (or right-click on a computer) shows the full card.
- [x] Re-check Lobbying Deal: trimmed from +1 ATK/+1 DEF to +1 ATK only
  (round 16) -- see the comment on the card in WorldCards.ts.

### Phase 3: Google Play setup (in parallel)

- [x] Name: **Duel for the World**. App id: `com.jandreus.duelfortheworld`.
- [x] App icon, launch screen, store icon and feature graphic.
- [x] Release build setup: signing from `keystore.properties`,
  `pnpm android:bundle`.
- [x] Privacy policy page and store listing texts (`store/`).
- [x] Google Play developer account ($25, one-time, identity check).
- [x] Create the upload key and build the first `.aab`.
- [x] versionCode 2 / versionName 1.1.0 (music polish, RevenueCat
  purchases, AdMob ads, Campaign Donations) built and uploaded to Closed
  testing -- see Phase 5 for what's new in it.
- [x] Host the privacy policy at a public address: https://serjt12.github.io/duel-for-the-world/
- [x] Phone screenshots for the listing: 5 landscape shots (main menu,
  tutorial, busy board, a Scandal, Election Night) captured and in `store/`.
- [ ] A new personal account needs a **closed test with 12 testers for 14
  days** before going public.

### Phase 4: Live online play

- [x] Reconnect (a dropped connection can rejoin its seat), a turn timer
  (an AFK opponent can't stall a match forever), and room cleanup (see
  [docs/SERVER.md](SERVER.md)).
- [x] Host the server on Fly.io at a secure (wss://) address: live at
  `wss://duel-for-the-world.fly.dev`, one machine in `iad`. (See
  [docs/SERVER.md](SERVER.md) -- "Current status" for the app-name story.)
- [ ] Invite a friend by link or room code.
- [x] Quick match, with a clearly labelled "play the computer instead" when
  nobody is online. Built (round 17) exactly as scoped: a new
  `packages/duel-server/src/rooms/MatchmakingQueue.ts` (a plain, socket-free,
  unit-tested "one waiting ticket per edition" data structure -- server.ts
  passes it a WebSocket, but it doesn't know that) pairs two `quick-match`
  requests into a real `DuelRoom` the same way `create-room`/`join-room`
  already do, and sends both sides a new `match-found` message at once.
  The lobby (`ui/renderLobby.ts`) has a "Quick Match" section above the
  existing "Play a Friend" one; while searching it shows "Looking for an
  opponent..." with a Cancel button. A 7s client-side timeout
  (`app.ts`'s `QUICK_MATCH_TIMEOUT_MS`) falls back to an offline AI duel,
  in the edition that was requested, if nobody's found in time -- same
  fallback path fires if the connection drops while waiting. A cancelled
  or abandoned search is cleaned out of the queue server-side too (on an
  explicit `cancel-quick-match` message, or the socket closing).

### Phase 5: Ads and retention

- [x] AdMob interstitial, between matches only and never during one, with a
  frequency cap (every 3rd real match), respecting Remove Ads. Consent
  form for EEA/UK players before ever requesting an ad. Ships on Google's
  test ad IDs until real ones are set -- see `docs/ADS.md`.
- [x] Rewarded ads, wired to a "Watch ad: +1 Donation" button in the Field
  Guide. Donations (`state/donations.ts`) spend at 5 per unlock to open the
  next World Edition card early, via a `bonusUnlockWins` counter kept
  separate from real match wins -- see `docs/ADS.md`'s "Donations"
  section.
- [x] Remove Ads (one-time purchase) and a generic paid-edition-DLC
  mechanism, via RevenueCat -- see `docs/MONETIZATION.md`. World and
  Colombia both stay free.
- [x] Card unlocks (World Edition): a 20-card starter set, unlocking the
  other 19 cards two offline wins vs. the computer apart, up to full
  unlock at 38 wins. Online play always uses the whole edition -- only
  offline decks are gated. The Field Guide (Pokedex-style, off the "Play
  vs Computer" menu) shows progress. Colombia is unaffected (always fully
  unlocked; no curated starter set yet). See
  `packages/duel-content/src/Unlocks.ts`.
- [x] Unlocks are taught, not just built: the guided tutorial's last step
  and the always-available "How to Play" panel both mention that offline
  wins unlock more of the roster, pointing at the Field Guide. The win
  screen itself reveals a newly-unlocked card on the spot (name, art, a
  pop-in animation, and a button straight into its Field Guide entry) --
  see `ui/finale.ts`'s `unlockedCardId` plumbing.
- [ ] **Still needed before any of this is truly live:** a real AdMob
  account + ad unit IDs, a real RevenueCat + Play Console product setup,
  and a real-device test of the interstitial, the rewarded-ad/Donations
  flow and the Remove Ads purchase -- none of the three has been verified
  on-device yet.
- [ ] A "World Tour" campaign against computer Leaders; a daily challenge;
  later, a deck builder.

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
- [ ] A leaderboard. Not a small add-on: `duel-server` currently has no
  accounts, no persistent player identity, and no database (a stateless
  Fly.io WS server that forgets each `DuelRoom` once the match ends). Needs,
  at minimum: a durable identity (device id + chosen name, short of full
  accounts), a persistence layer (Fly Postgres or a volume-backed SQLite),
  a definition of what's ranked (online room-code wins -- offline vs. the
  computer has no one to rank against), and an endpoint to submit/query
  standings. Scope as its own phase after launch, not folded into Phase 5.

# Roadmap: PALACIO on Google Play

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

- [ ] A guided first duel against an Easy computer.
- [ ] Sound, music and vibration, with toggles in Settings.
- [ ] A turn banner, an animation for cards returning from the Embassy, and
  clearer attack targets.
- [ ] Bigger key text on the phone layout.
- [ ] Playtests on real phones. Tune match length (a quick match with an
  earlier election?).
- [ ] Re-check Lobbying Deal.

### Phase 3: Google Play setup (in parallel)

- [ ] Google Play developer account ($25, one-time).
- [ ] Choose the final app id (permanent once uploaded).
- [ ] A new personal account needs a **closed test with 12 testers for 14
  days** before going public.
- [ ] A signed release build (AAB).

### Phase 4: Live online play

- [ ] Host the server on a secure (wss://) address.
- [ ] Reconnect, a turn timer, room cleanup.
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
- [ ] Name/trademark check for "PALACIO" and a legal read of the satire.

### Later

- [ ] iOS (same code; needs a Mac or a cloud build service, and the Apple
  Developer Program).
- [ ] More country editions after Colombia.

# Development guide

## Everyday commands

```
pnpm install        # after pulling changes or editing package.json
pnpm dev            # game server (ws://localhost:8080) + web app (Vite)
pnpm test           # all unit tests
pnpm typecheck      # TypeScript, every package
```

To try the phone layout in a desktop browser, make the window short and wide,
or add `?layout=phone` to the address.

## Tests

- Unit tests live next to the code in `__tests__/` folders (Vitest).
- `packages/duel-engine` has a test file per system, plus `WorldEdition.test.ts`
  and `Wave2.test.ts` for card behavior.
- `packages/duel-server` tests rooms, redaction (nothing hidden may leak) and
  the AI (whole games finish, and the AI decides the same way whatever the
  hidden cards are).
- `apps/duel-web` tests the tutorial: it plays every step against the real
  rules and checks you win the election 25 to 18. If you change a card used
  in the tutorial (see `guide/script.ts`), run it.
- The server smoke test runs against a live server:
  `pnpm --filter @duel-for-the-world/duel-server smoke-test` (start the server
  first).

## Balance

The balance simulator plays thousands of bot-vs-bot duels straight against the
engine:

```
pnpm balance [edition] [games] [seed] [default|random]
```

- `default` plays the normal decks. It reports first-player advantage, how
  games end, and each Leader's win rate.
- `random` builds each deck from a random half of the pool. It reports every
  card's **marginal strength**: its win rate in the deck minus out of it, in
  points. Aim for about ±5.
- `TWEAKS=file.json` tries changes without editing the cards, e.g.
  `{ "protester": { "atk": 5 } }`.

The bots don't bluff or read hidden cards, so use the numbers to find
outliers, then confirm with real playtests.

## Adding or changing a card

1. Add the id to `CardId.ts` and the card to `WorldCards.ts` (or `Cards.ts` for
   Edición Colombia), using effects from `Effects.ts`.
   - If you need a new kind of effect, add it to `Effects.ts`, implement it in
     the engine (`resolveInstantEffects` / `fireScandal` / passives), describe
     it in `rulesText.ts`, and add tests.
2. Add its art as `apps/duel-web/src/assets/cards/<id>.svg` and register it in
   `apps/duel-web/src/ui/cardArt.ts`.
3. Run `pnpm test`, then `pnpm balance world 40000 1 random` to check its
   strength.
4. Run `pnpm docs:cards` to refresh [CARDS.md](CARDS.md).
5. If the card's text looks cramped on the card, shorten the wording.

## Conventions

- **No real people.** Cards are archetypes; flags and emblems are invented.
- **The engine is pure.** No randomness, time or I/O in `duel-engine`.
  Shuffling happens in `DuelRoom`.
- **Never trust the client.** Every action is validated by the engine; bad
  input gets `{ ok: false, reason }`, never an exception.
- **Hidden means absent.** The redacted state omits hidden cards entirely.
  The AI only ever sees that same redacted view.
- **Protocol version.** Bump `PROTOCOL_VERSION`
  (`packages/duel-server/src/protocol/version.ts`) whenever a message or
  `PublicDuelState` changes shape. After an update, restart the server.
- **TypeScript that runs as-is.** No `enum`s and no constructor parameter
  properties (the web app uses `erasableSyntaxOnly`, and scripts run with
  Node's type stripping).
- **Sounds** are code, not files: add a recipe to `audio/synth.ts` and hook it
  to a duel event in `audio/sound.ts`. Keep them short and quiet; music
  stays under the effects.
- **Edition text** goes through `ui/flavor.ts` (UI) or `EMBASSY_TEXT`
  (card text). Don't hard-code "Embassy" or "La Embajada".

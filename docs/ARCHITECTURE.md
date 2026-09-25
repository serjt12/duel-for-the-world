# Architecture

PALACIO is a pnpm monorepo in TypeScript with three packages and one app.
Dependencies only point downwards:

```
apps/duel-web  ──►  duel-server  ──►  duel-engine  ──►  duel-content
   (UI)            (rooms, AI,        (the rules)        (card data)
                    online server)
```

## packages/duel-content: what the cards are

Pure data plus the text that describes it. No rules logic.

- `Cards.ts` (Edición Colombia) and `WorldCards.ts` (World Edition) define every
  card. Each card has an `edition`.
- `Effects.ts` is the effect vocabulary cards are built from:
  - `InstantEffect`: change Mandate, draw, send to the Embassy, retrieve from an
    Embassy, gain votes, discard, postpone the election;
  - `Passive`;
  - Scandal triggers and responses.
- `ActorCard.ts`, `PolicyCard.ts` and `ScandalCard.ts` hold the card shapes;
  `CardId.ts` has the id unions for each edition.
- `rulesText.ts` generates each card's rules text from its effects, so the
  text is always exactly what the card does. It is edition-aware ("the Embassy"
  vs "La Embajada").
- `Edition.ts` and `editions.ts` hold the editions, `cardsOfEdition`, Embassy
  filters and `embassyChoiceIn`.

## packages/duel-engine: the rules

A pure, deterministic rules engine. Plain-data `DuelState` in, mutations out.
It has no randomness (decks arrive already shuffled) and no I/O.

- `duel/`: `createDuel`, `DuelState` and the phases.
- `systems/`: one module per player action.
  - `TurnSystem` (advance phase, draw, "each turn" abilities, Election Night
    trigger), `DeploySystem`, `StanceSystem`, `BattleSystem`, `PolicySystem`,
    `ScandalSystem`.
  - `ElectionSystem`: `countVotes` and `holdElection`.
  - `EffectiveStats`: printed stats plus equips and passives.
- `effects/`:
  - `resolveInstantEffects` is the only place effects happen;
  - `fireScandal`;
  - `resolveActorEffect` handles deploy, flip, turn-start and fall.
- `field/`:
  - `archiveActor` is the one way an Actor leaves the field (equips, fall
    abilities, the "ally fell" passive);
  - Backroom zones and passives.
- `events/`: the **duel log**, public events (`DuelEvent`) that the UI turns
  into the battle report and the field animations.
- `config/DuelConfig.ts`: starting Mandate, hand size, zones, Election Night
  numbers.

Every action returns `{ ok: true }` or `{ ok: false, reason }` and never
throws on bad input. The engine validates everything, because moves can come
from an untrusted client.

## packages/duel-server: rooms, fairness, the AI

- `rooms/DuelRoom.ts` is one authoritative duel. It builds the default decks
  (`buildDefaultDeck(edition)`), checks whose turn it is, maps each
  `PlayerAction` to one engine call, and handles rematches.
- `protocol/redact.ts` builds `PublicDuelState`, **the only view a player ever
  gets**:
  - the opponent's hand and face-down cards are removed, not just hidden;
  - it includes the live poll and the last 40 log events.
- `protocol/Messages.ts` defines the wire messages. `protocol/version.ts`
  holds `PROTOCOL_VERSION`; bump it whenever a message or the public state
  changes shape.
- `server.ts` is the WebSocket server (`ws`) with room codes (`RoomManager`).
- `ai/` is the computer opponent:
  - `chooseAiAction(view, me, level)` decides one move from the **redacted
    view**, so it can't cheat by construction.
  - `AiPlayer` drives one seat step by step and never loops on a rejected move.
  - Levels: Easy (sloppy heuristics), Normal (heuristics), Hard (`search.ts`:
    it samples plausible hidden cards, plays each candidate move forward
    through its turn and the opponent's reply, and picks the best average).
- `offline.ts` is a browser-safe entry point (`@project-palacio/duel-server/offline`)
  so the app can run a room and the AI on the device, with no network.

## apps/duel-web: the game client

Plain TypeScript and CSS with no UI framework. It re-renders by rebuilding the
DOM from `ClientState` (`ui/dom.ts` has a tiny `el()` helper).

- `app.ts`: `startApp()` wires the state, rendering and the active
  "other side". `main.ts` only adds the stylesheet.
- `net/GameClient.ts` is the interface the UI talks to, with two
  implementations:
  - `DuelClient`: the online server over WebSocket (checks the protocol
    version).
  - `LocalDuel`: a `DuelRoom` and `AiPlayer` on the device. The AI moves one
    step at a time with short pauses.
- `state/ClientState.ts`: screen, mode, interaction state (menus, targeting),
  the Embassy picker, preferences.
- `ui/`:
  - `renderMenu` (main menu), `renderLobby` (online rooms), `renderBoard`
    (the duel).
  - Cards: `cardView`, `cardArt`, `cardInfo`, `inspect` (long-press zoom).
  - Interaction: `dragDrop`, `embassyPicker`, `keyboard`.
  - The log: `eventText` and `headlines` (the battle report).
  - Effects: `fieldFx` (hit, fly-to-Embassy), `finale` (the Election Night
    newspaper).
  - `flavor.ts`: every edition-dependent string (Embassy/La Embajada,
    Headlines/Titulares, Rematch!/¡Revancha!…).
  - `phaseInfo` and `renderTutorial`: How to Play.
  - `stage.ts`: the **phone layout**. On short, wide screens the board is a
    fixed 1340×604 stage scaled to fit (`.board--phone` in `style.css`),
    so every card and zone keeps its proportions.
- `src/assets/cards/`: the card illustrations (SVG), one per card plus the
  card back.
- `android/`: the Capacitor Android project. See [ANDROID.md](ANDROID.md).

## How a move flows

1. The player taps a card. The UI sends a `PlayerAction` through the
   `GameClient`.
2. The `DuelRoom` checks the turn and calls the engine, which validates the
   move and changes the `DuelState`, logging events.
3. Each player gets `redactStateFor(state, player)`.
4. `applyServerState` diffs the old and new board for animations, turns the
   new log events into headlines, and the board re-renders.

Online, steps 2 and 3 happen on the server. Against the computer, they happen
on the device, with the AI taking the other seat.

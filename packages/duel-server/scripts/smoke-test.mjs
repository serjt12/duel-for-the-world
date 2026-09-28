// Manual smoke test for the duel-server WebSocket layer.
//
// Usage:
//   Terminal 1: pnpm --filter @duel-for-the-world/duel-server start
//   Terminal 2: pnpm --filter @duel-for-the-world/duel-server smoke-test
//
// Connects two WebSocket clients (standing in for two players), plays
// through room creation/joining and a handful of real actions, and checks
// the server's responses at each step. Prints PASS/FAIL for each check and
// exits non-zero if anything didn't behave as expected -- this is the
// "does the actual transport work" check that plain unit tests can't give
// us (those only exercise the pure room/rules logic, never a real socket).

import WebSocket from "ws";

const WS_URL = process.env.WS_URL ?? "ws://localhost:8080";
const CONNECT_TIMEOUT_MS = 3000;
const RESPONSE_TIMEOUT_MS = 3000;

let passCount = 0;
let failCount = 0;

function check(label, condition) {
  if (condition) {
    passCount += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failCount += 1;
    console.log(`  FAIL  ${label}`);
  }
}

// Every message a socket receives is buffered in arrival order. `next()`
// looks for the first buffered message matching `predicate`, or waits for
// one to arrive -- this avoids the race of a message showing up between
// two sequential one-shot listeners (e.g. "opponent-joined" and "state"
// are sent back-to-back by the server, with no guarantee our code asks
// for the second one before it's already arrived).
function watch(socket, name) {
  const buffered = [];
  const waiters = [];

  socket.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiterIndex = waiters.findIndex((w) => w.predicate(parsed));

    if (waiterIndex !== -1) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      waiter.resolve(parsed);
    } else {
      buffered.push(parsed);
    }
  });

  function next(predicate, label) {
    const bufferedIndex = buffered.findIndex(predicate);

    if (bufferedIndex !== -1) {
      const [message] = buffered.splice(bufferedIndex, 1);
      return Promise.resolve(message);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) waiters.splice(idx, 1);
        reject(new Error(`${name}: timed out waiting for ${label}`));
      }, RESPONSE_TIMEOUT_MS);

      waiters.push({
        predicate,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      });
    });
  }

  return { next };
}

function connect(name) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL);
    const timer = setTimeout(() => {
      reject(new Error(`${name}: timed out connecting to ${WS_URL}`));
    }, CONNECT_TIMEOUT_MS);

    socket.on("open", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${name}: connection error -- ${err.message}`));
    });
  });
}

async function main() {
  console.log(`Connecting to ${WS_URL} ...`);
  const socketA = await connect("Player A");
  const socketB = await connect("Player B");
  const a = watch(socketA, "Player A");
  const b = watch(socketB, "Player B");
  console.log("Both clients connected.\n");

  console.log("Step 1: Player A creates a room");
  socketA.send(JSON.stringify({ type: "create-room" }));
  const created = await a.next((m) => m.type === "room-created", "room-created");
  check("Player A received room-created", created.type === "room-created");
  check("Player A was assigned duelist1", created.you === "duelist1");
  check(
    "Server reports its protocol version (lets the web client detect an out-of-date server)",
    Number.isInteger(created.protocolVersion),
  );
  const roomCode = created.roomCode;
  console.log(`  Room code: ${roomCode}\n`);

  console.log("Step 2: Player B joins that room");
  socketB.send(JSON.stringify({ type: "join-room", roomCode }));
  const joined = await b.next((m) => m.type === "joined-room", "joined-room");
  check("Player B received joined-room", joined.type === "joined-room");
  check("Player B was assigned duelist2", joined.you === "duelist2");
  check("Both players get the same protocol version", joined.protocolVersion === created.protocolVersion);

  const opponentJoined = await a.next(
    (m) => m.type === "opponent-joined",
    "opponent-joined",
  );
  check("Player A was told the opponent joined", opponentJoined.type === "opponent-joined");

  const openingState = await a.next((m) => m.type === "state", "opening state");
  check("Opening state: turn 1", openingState.state.turnNumber === 1);
  check("A room created without an edition plays the World Edition", openingState.state.edition === "world");
  check("Opening state carries the duel log", Array.isArray(openingState.state.log) && openingState.state.log[0]?.kind === "turn-started");
  check("Opening state: Agenda Phase", openingState.state.phase === "agenda");
  check(
    "Opening state: duelist1 is active",
    openingState.state.activeDuelistId === "duelist1",
  );
  // The server broadcasts this same opening state to Player B too -- drain
  // it now so it doesn't sit buffered and get mistaken later for a fresh
  // response to some other action (exactly the bug this comment is here
  // to prevent a repeat of).
  await b.next((m) => m.type === "state", "opening state (Player B)");
  console.log("");

  console.log("Step 3: Player B (not the active duelist) tries to act -- should be rejected");
  socketB.send(
    JSON.stringify({ type: "player-action", action: { type: "advance-phase" } }),
  );
  const rejected = await b.next(
    (m) => m.type === "action-rejected" || m.type === "state",
    "a response to Player B's out-of-turn action",
  );
  check("Out-of-turn action was rejected", rejected.type === "action-rejected");
  check(
    "Rejection reason was not-your-turn",
    rejected.type === "action-rejected" && rejected.reason === "not-your-turn",
  );
  console.log("");

  console.log("Step 4: Player A (the active duelist) advances to Campaign Phase 1");
  socketA.send(
    JSON.stringify({ type: "player-action", action: { type: "advance-phase" } }),
  );
  const afterAdvance = await a.next((m) => m.type === "state", "state after advance-phase");
  check("Phase advanced to campaign-1", afterAdvance.state.phase === "campaign-1");
  console.log("");

  console.log("Step 5: Player A deploys an Actor from hand");
  // The server shuffles the default deck, so the hand varies: try each
  // card in turn until one deploys. Non-Actors and tribute-requiring
  // Actors are rejected along the way -- which also exercises the
  // server's clean rejection of mismatched card types. A hand with no
  // free-to-deploy Actor (about 1 in 140) passes a full round and tries
  // again with the next draw.
  const hand = afterAdvance.state.duelists.duelist1.hand;
  const advanceFor = async (socket) => {
    socket.send(JSON.stringify({ type: "player-action", action: { type: "advance-phase" } }));
    return a.next((m) => m.type === "state", "state after advancing");
  };
  let deployed = null;
  let current = afterAdvance;
  for (let round = 0; round < 4 && !deployed; round += 1) {
    for (const cardId of current.state.duelists.duelist1.hand) {
      socketA.send(
        JSON.stringify({
          type: "player-action",
          action: {
            type: "deploy-actor",
            actorCardId: cardId,
            options: { stance: "campaign", facing: "face-up" },
          },
        }),
      );
      const response = await a.next(
        (m) => m.type === "state" || m.type === "action-rejected",
        `a response to deploying ${cardId}`,
      );
      if (response.type === "state") {
        deployed = response;
        console.log(`  Deployed ${cardId}.`);
        break;
      }
      console.log(`  ${cardId} rejected (${response.reason}) -- trying the next card.`);
    }
    if (!deployed) {
      console.log("  No free-to-deploy Actor in hand -- passing a full round.");
      for (let i = 0; i < 4; i += 1) await advanceFor(socketA); // A: Campaign 1 -> B's Agenda
      for (let i = 0; i < 5; i += 1) await advanceFor(socketB); // B: Agenda -> A's Agenda
      current = await advanceFor(socketA); // A: Agenda -> Campaign 1
    }
  }
  check(
    "An Actor from hand deployed",
    deployed !== null,
  );
  if (deployed) {
    check("Field now has one Actor", deployed.state.duelists.duelist1.field.length === 1);
    check("The deploy is in the duel log", deployed.state.log.some((e) => e.kind === "actor-deployed" && e.duelistId === "duelist1"));
    check("Deployed Actor has a zone and real ATK/DEF numbers", (() => {
      const actor = deployed.state.duelists.duelist1.field[0];
      return Number.isInteger(actor.zone) && Number.isInteger(actor.atk) && Number.isInteger(actor.def);
    })());
    check(
      "Deck is shuffled: hand isn't the unshuffled listing order",
      JSON.stringify(hand) !==
        JSON.stringify(["protester", "protester", "riot-cop", "riot-cop", "intern"]),
    );

    // Change stance: the just-deployed Actor can't (not the turn it was
    // deployed), and a bogus id is rejected cleanly rather than crashing.
    const instanceId = deployed.state.duelists.duelist1.field[0].instanceId;
    socketA.send(JSON.stringify({ type: "player-action", action: { type: "change-stance", instanceId } }));
    const tooSoon = await a.next((m) => m.type === "action-rejected", "change-stance rejection");
    check("Change stance on a just-deployed Actor -> rejected deployed-this-turn", tooSoon.reason === "deployed-this-turn");
    socketA.send(JSON.stringify({ type: "player-action", action: { type: "change-stance", instanceId: "x" } }));
    const bogus = await a.next((m) => m.type === "action-rejected", "change-stance bogus-id rejection");
    check("Change stance on a bogus id -> rejected actor-not-owned", bogus.reason === "actor-not-owned");
  }
  console.log("");

  console.log("Step 6: Malformed and mismatched messages are rejected, and the server stays up");
  // Before this was hardened, the mismatched deploy below crashed the whole
  // server process (every room with it).
  socketA.send("null");
  socketA.send("42");
  socketA.send("{this is not json");
  socketA.send(JSON.stringify({ type: "nonsense" }));
  socketA.send(
    JSON.stringify({
      type: "player-action",
      action: {
        type: "deploy-actor",
        actorCardId: "maletin-de-sobornos",
        options: { stance: "campaign", facing: "face-up" },
      },
    }),
  );
  socketA.send(JSON.stringify({ type: "player-action", action: null }));

  const isError = (reason) => (m) => m.type === "error" && m.reason === reason;
  const isRejected = (reason) => (m) => m.type === "action-rejected" && m.reason === reason;
  for (const label of ["null", "42", "broken JSON"]) {
    const reply = await a.next(isError("invalid-message"), `invalid-message for ${label}`);
    check(`${label} -> error invalid-message`, reply.reason === "invalid-message");
  }
  const unknown = await a.next(isError("unknown-message"), "unknown-message");
  check("Unknown message type -> error unknown-message", unknown.reason === "unknown-message");
  const notActor = await a.next(isRejected("not-an-actor"), "not-an-actor rejection");
  check("Policy sent as an Actor -> rejected not-an-actor", notActor.reason === "not-an-actor");
  const nullAction = await a.next(isRejected("invalid-action"), "invalid-action rejection");
  check("Null action -> rejected invalid-action", nullAction.reason === "invalid-action");

  socketA.send(JSON.stringify({ type: "player-action", action: { type: "advance-phase" } }));
  const stillAlive = await a.next((m) => m.type === "state", "state after the bad messages");
  check("Server still running and playable afterwards", stillAlive.state.phase === "confrontation");

  console.log("\nStep 9: an Edición Colombia room, and an unknown edition");
  const socketC = await connect("Player C");
  const socketD = await connect("Player D");
  const c = watch(socketC, "Player C");
  const d = watch(socketD, "Player D");
  socketC.send(JSON.stringify({ type: "create-room", edition: "colombia" }));
  const colombiaRoom = await c.next((m) => m.type === "room-created", "colombia room-created");
  socketD.send(JSON.stringify({ type: "join-room", roomCode: colombiaRoom.roomCode }));
  const colombiaState = await d.next((m) => m.type === "state", "colombia opening state");
  check("create-room {edition: colombia} -> an Edición Colombia duel", colombiaState.state.edition === "colombia");
  check("...dealt from the 34-card Colombian deck", colombiaState.state.duelists.duelist2.deckCount + colombiaState.state.duelists.duelist2.handCount === 34);
  const socketE = await connect("Player E");
  const socketF = await connect("Player F");
  const e = watch(socketE, "Player E");
  const f = watch(socketF, "Player F");
  socketE.send(JSON.stringify({ type: "create-room", edition: "mars" }));
  const marsRoom = await e.next((m) => m.type === "room-created", "unknown-edition room-created");
  socketF.send(JSON.stringify({ type: "join-room", roomCode: marsRoom.roomCode }));
  const marsState = await f.next((m) => m.type === "state", "unknown-edition opening state");
  check("An unknown edition falls back to a World room", marsState.state.edition === "world");
  for (const socket of [socketC, socketD, socketE, socketF]) socket.close();

  console.log(`\n${passCount} passed, ${failCount} failed.`);
  socketA.close();
  socketB.close();
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nSmoke test crashed:", err.message);
  console.error(
    "Is the server actually running? Start it in another terminal first:\n" +
      "  pnpm --filter @duel-for-the-world/duel-server start",
  );
  process.exit(1);
});

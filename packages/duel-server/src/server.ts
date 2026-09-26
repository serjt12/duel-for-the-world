import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { EDITIONS } from "@project-palacio/duel-content";
import type { Edition } from "@project-palacio/duel-content";
import { RoomManager } from "./rooms/RoomManager";
import type { PlayerSlot } from "./rooms/DuelRoom";
import type { ClientMessage, ServerMessage } from "./protocol/Messages";
import { redactStateFor } from "./protocol/redact";
import { PROTOCOL_VERSION } from "./protocol/version";

const PORT = Number(process.env.PORT ?? 8080);

// How long a dropped connection's slot stays reserved before the room
// gives up on it and, if the other player is still around, hands them the
// win by forfeit. Long enough to survive a phone locking or a subway
// tunnel; short enough that nobody waits around all night for a rival who
// isn't coming back.
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 90_000);
// If the active player hasn't acted by this long, the server advances the
// phase on their behalf -- so an AFK or unusually slow opponent can't
// stall the match forever for the player who's actually still there.
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS ?? 90_000);
// A safety net, not the normal cleanup path (that's the reconnect-grace
// timer above): catches a room nobody ever fully connected to -- e.g. one
// player created it and never came back -- so it doesn't sit in memory
// forever.
const IDLE_SWEEP_INTERVAL_MS = 5 * 60_000;
const ROOM_MAX_IDLE_MS = 30 * 60_000;
// A ws-level ping every this often. A half-open connection (the OS never
// told us the socket died -- flaky mobile networks do this constantly)
// won't answer a ping, so it gets terminated and treated like any other
// disconnect instead of silently occupying a slot forever.
const HEARTBEAT_INTERVAL_MS = 30_000;

const roomManager = new RoomManager();

interface ConnectionInfo {
  roomCode: string;
  slot: PlayerSlot;
}

// Which room + slot each open socket belongs to, and the reverse index for
// broadcasting to everyone currently in a given room.
const connections = new Map<WebSocket, ConnectionInfo>();
const roomSockets = new Map<string, Set<WebSocket>>();

// Per-room live timers, and the last time anything happened in a room
// (join, rejoin, or a player action) -- what the idle sweep checks.
interface RoomTimers {
  turnTimer: ReturnType<typeof setTimeout> | null;
  disconnectTimers: Partial<Record<PlayerSlot, ReturnType<typeof setTimeout>>>;
}
const roomTimers = new Map<string, RoomTimers>();
const roomActivity = new Map<string, number>();

function timersFor(roomCode: string): RoomTimers {
  let timers = roomTimers.get(roomCode);
  if (!timers) {
    timers = { turnTimer: null, disconnectTimers: {} };
    roomTimers.set(roomCode, timers);
  }
  return timers;
}

function touch(roomCode: string): void {
  roomActivity.set(roomCode, Date.now());
}

function clearRoomTimers(roomCode: string): void {
  const timers = roomTimers.get(roomCode);
  if (!timers) return;
  if (timers.turnTimer) clearTimeout(timers.turnTimer);
  for (const timer of Object.values(timers.disconnectTimers)) {
    if (timer) clearTimeout(timer);
  }
  roomTimers.delete(roomCode);
}

function destroyRoom(roomCode: string): void {
  clearRoomTimers(roomCode);
  roomManager.removeRoom(roomCode);
  roomSockets.delete(roomCode);
  roomActivity.delete(roomCode);
}

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

function broadcast(roomCode: string, message: ServerMessage, exclude?: WebSocket): void {
  const sockets = roomSockets.get(roomCode);
  if (!sockets) return;
  for (const socket of sockets) {
    if (socket !== exclude) send(socket, message);
  }
}

// Sends each connected socket its OWN view of the state -- never the raw
// engine DuelState, and never the same message to both sockets. Hand
// contents, deck contents, face-down Resistance Actors, and Set Scandals
// are all redacted relative to who's actually looking (see
// protocol/redact.ts). This is what keeps a player from reading their
// opponent's hand out of the browser's network tab.
function broadcastState(roomCode: string): void {
  const room = roomManager.getRoom(roomCode);
  const sockets = roomSockets.get(roomCode);

  if (!room || !sockets) {
    return;
  }

  for (const socket of sockets) {
    const info = connections.get(socket);

    if (!info) {
      continue;
    }

    const message: ServerMessage = {
      type: "state",
      state: redactStateFor(room.state, info.slot, { rematchVotes: room.rematchVotes(), edition: room.edition }),
    };
    send(socket, message);
  }
}

// Re-arms the per-room turn clock. Called after anything that could start
// or move a turn along (a player's own action, the room filling up,
// rejoin). A duel that's already over needs no clock.
function scheduleTurnTimer(roomCode: string): void {
  const timers = timersFor(roomCode);
  if (timers.turnTimer) clearTimeout(timers.turnTimer);

  const room = roomManager.getRoom(roomCode);
  if (!room || room.state.winnerId) return;

  timers.turnTimer = setTimeout(() => {
    const current = roomManager.getRoom(roomCode);
    if (!current || current.state.winnerId) return;
    current.applyAction(current.state.activeDuelistId, { type: "advance-phase" });
    broadcastState(roomCode);
    scheduleTurnTimer(roomCode);
  }, TURN_TIMEOUT_MS);
}

function clearDisconnectTimer(roomCode: string, slot: PlayerSlot): void {
  const timers = roomTimers.get(roomCode);
  const pending = timers?.disconnectTimers[slot];
  if (pending) {
    clearTimeout(pending);
    delete timers!.disconnectTimers[slot];
  }
}

function handleMessage(socket: WebSocket, raw: { toString(): string }): void {
  let message: ClientMessage;

  try {
    message = JSON.parse(raw.toString());
  } catch {
    send(socket, { type: "error", reason: "invalid-message" });
    return;
  }

  // Valid JSON isn't necessarily a message object (e.g. `null`, `42`).
  if (typeof message !== "object" || message === null) {
    send(socket, { type: "error", reason: "invalid-message" });
    return;
  }

  if (message.type === "create-room") {
    // Untrusted input: anything but a known edition means the default.
    const edition = EDITIONS.includes(message.edition as Edition) ? (message.edition as Edition) : "world";
    const { roomCode, room } = roomManager.createRoom(undefined, undefined, edition);
    const slot = room.join();

    if (!slot) {
      // Unreachable in practice (a brand-new room always has an open
      // slot), but keeps the types honest rather than asserting.
      send(socket, { type: "error", reason: "room-full" });
      return;
    }

    connections.set(socket, { roomCode, slot });
    roomSockets.set(roomCode, new Set([socket]));
    touch(roomCode);
    send(socket, {
      type: "room-created",
      roomCode,
      you: slot,
      protocolVersion: PROTOCOL_VERSION,
      reconnectToken: room.tokenFor(slot)!,
    });
    return;
  }

  if (message.type === "join-room") {
    const room = roomManager.getRoom(message.roomCode);

    if (!room) {
      send(socket, { type: "error", reason: "room-not-found" });
      return;
    }

    const slot = room.join();

    if (!slot) {
      send(socket, { type: "error", reason: "room-full" });
      return;
    }

    connections.set(socket, { roomCode: message.roomCode, slot });
    const sockets = roomSockets.get(message.roomCode) ?? new Set<WebSocket>();
    sockets.add(socket);
    roomSockets.set(message.roomCode, sockets);
    touch(message.roomCode);
    send(socket, {
      type: "joined-room",
      roomCode: message.roomCode,
      you: slot,
      protocolVersion: PROTOCOL_VERSION,
      reconnectToken: room.tokenFor(slot)!,
    });

    if (room.isFull()) {
      broadcast(message.roomCode, { type: "opponent-joined" }, socket);
      broadcastState(message.roomCode);
      scheduleTurnTimer(message.roomCode);
    }
    return;
  }

  if (message.type === "rejoin") {
    const room = roomManager.getRoom(message.roomCode);

    if (!room) {
      send(socket, { type: "error", reason: "room-not-found" });
      return;
    }

    const slot = room.reconnect(message.token);

    if (!slot) {
      send(socket, { type: "error", reason: "invalid-token" });
      return;
    }

    clearDisconnectTimer(message.roomCode, slot);
    connections.set(socket, { roomCode: message.roomCode, slot });
    const sockets = roomSockets.get(message.roomCode) ?? new Set<WebSocket>();
    sockets.add(socket);
    roomSockets.set(message.roomCode, sockets);
    touch(message.roomCode);

    send(socket, {
      type: "rejoined-room",
      roomCode: message.roomCode,
      you: slot,
      protocolVersion: PROTOCOL_VERSION,
    });
    broadcast(message.roomCode, { type: "opponent-reconnected" }, socket);
    broadcastState(message.roomCode);
    scheduleTurnTimer(message.roomCode);
    return;
  }

  if (message.type === "player-action") {
    const info = connections.get(socket);

    if (!info) {
      send(socket, { type: "error", reason: "not-in-a-room" });
      return;
    }

    const room = roomManager.getRoom(info.roomCode);

    if (!room) {
      send(socket, { type: "error", reason: "room-not-found" });
      return;
    }

    const result = room.applyAction(info.slot, message.action);

    if (!result.ok) {
      send(socket, { type: "action-rejected", reason: result.reason });
      return;
    }

    touch(info.roomCode);
    broadcastState(info.roomCode);
    scheduleTurnTimer(info.roomCode);
    return;
  }

  send(socket, { type: "error", reason: "unknown-message" });
}

// A socket going away: the room isn't torn down immediately (a network
// blip, the app backgrounding, or a phone locking all look identical to
// this) -- the slot just stops being "connected," the other player (if
// any) is told, and a grace-period timer starts. If nobody reclaims the
// slot with the right token before it fires, whoever's left is told the
// room is done and it's destroyed; if nobody's left either, it's simply
// destroyed.
function handleClose(socket: WebSocket): void {
  const info = connections.get(socket);
  connections.delete(socket);

  if (!info) return;

  roomSockets.get(info.roomCode)?.delete(socket);
  const room = roomManager.getRoom(info.roomCode);
  if (!room) return;

  room.disconnectSlot(info.slot);
  broadcast(info.roomCode, { type: "opponent-disconnected" });

  const timers = timersFor(info.roomCode);
  timers.disconnectTimers[info.slot] = setTimeout(() => {
    delete timers.disconnectTimers[info.slot];
    const current = roomManager.getRoom(info.roomCode);
    if (!current || current.isSlotConnected(info.slot)) return; // reclaimed meanwhile

    const remaining = roomSockets.get(info.roomCode);
    if (remaining && remaining.size > 0) {
      broadcast(info.roomCode, { type: "opponent-left" });
    }
    destroyRoom(info.roomCode);
  }, RECONNECT_GRACE_MS);
}

export function startServer(port: number = PORT): WebSocketServer {
  // An explicit HTTP server in front of the WebSocket upgrade, rather than
  // letting WebSocketServer make its own bare one, so a plain GET (a load
  // balancer's health check, or just someone opening the URL in a
  // browser) gets a real 200 instead of hanging forever. Fly.io's proxy
  // in particular healthchecks over HTTP before it will route any traffic
  // to a machine -- a service that only ever answers WebSocket upgrades
  // reads to it as unhealthy, and every connection gets reset before the
  // handshake completes even though the process itself is up and logging
  // fine. (This is exactly what happened the first time this went out:
  // `fly logs` showed "duel-server listening..." while every wss://
  // connection died with code 1006.)
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("duel-server: ok\n");
  });
  const wss = new WebSocketServer({ server: httpServer });
  httpServer.listen(port);

  wss.on("connection", (socket: WebSocket & { isAlive?: boolean }) => {
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("message", (raw) => {
      // Last line of defense: an exception escaping a ws event handler
      // would crash the whole Node process -- every room, every player --
      // so anything unexpected is contained to an error reply to this one
      // socket. (Known-bad input is already rejected cleanly by DuelRoom
      // and the engine; this is for whatever nobody anticipated.)
      try {
        handleMessage(socket, raw);
      } catch (error) {
        console.error("duel-server: error while handling a message:", error);
        send(socket, { type: "error", reason: "internal-error" });
      }
    });

    socket.on("close", () => handleClose(socket));
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients as Set<WebSocket & { isAlive?: boolean }>) {
      if (socket.isAlive === false) {
        socket.terminate(); // fires "close" above, same path as a normal disconnect
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  const idleSweep = setInterval(() => {
    const now = Date.now();
    for (const [roomCode, lastActive] of roomActivity) {
      if (now - lastActive > ROOM_MAX_IDLE_MS) {
        destroyRoom(roomCode);
      }
    }
  }, IDLE_SWEEP_INTERVAL_MS);

  wss.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(idleSweep);
    httpServer.close();
  });

  return wss;
}

// Compared as a proper file:// URL (via pathToFileURL) rather than a
// hand-built string -- a naive `file://${process.argv[1]}` comparison
// breaks on Windows, where argv[1] is a drive-letter/backslash path that
// doesn't match import.meta.url's URL-encoded forward-slash form. Without
// this, the check silently evaluates to false and startServer() never
// runs -- exactly what happened when this was first tried on Windows.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
  console.log(`duel-server listening on ws://localhost:${PORT}`);
}

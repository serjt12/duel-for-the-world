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

const roomManager = new RoomManager();

interface ConnectionInfo {
  roomCode: string;
  slot: PlayerSlot;
}

// Which room + slot each open socket belongs to, and the reverse index for
// broadcasting to everyone currently in a given room.
const connections = new Map<WebSocket, ConnectionInfo>();
const roomSockets = new Map<string, Set<WebSocket>>();

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
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
    send(socket, { type: "room-created", roomCode, you: slot, protocolVersion: PROTOCOL_VERSION });
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
    send(socket, {
      type: "joined-room",
      roomCode: message.roomCode,
      you: slot,
      protocolVersion: PROTOCOL_VERSION,
    });

    if (room.isFull()) {
      for (const other of sockets) {
        if (other !== socket) {
          send(other, { type: "opponent-joined" });
        }
      }
      broadcastState(message.roomCode);
    }
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

    broadcastState(info.roomCode);
    return;
  }

  send(socket, { type: "error", reason: "unknown-message" });
}

export function startServer(port: number = PORT): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on("connection", (socket: WebSocket) => {
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

    socket.on("close", () => {
      const info = connections.get(socket);
      connections.delete(socket);

      if (info) {
        // Deliberately not tearing the room down on disconnect for v1 -- a
        // dropped player just leaves the room waiting. Cleaning up
        // long-abandoned rooms (a TTL, most likely) is a later concern,
        // not a blocker for a first playable multiplayer version.
        roomSockets.get(info.roomCode)?.delete(socket);
      }
    });
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

import type { Edition } from "@duel-for-the-world/duel-content";
import type { GameClient } from "./GameClient";
import type {
  ClientMessage,
  PlayerAction,
  PlayerSlot,
  PublicDuelState,
  ServerMessage,
} from "@duel-for-the-world/duel-server";

// How long to keep retrying a dropped connection before giving up (a
// little under the server's own reconnect-grace window, so we don't keep
// hammering a socket the server has already forfeited).
const RECONNECT_RETRY_MS = 2500;
const RECONNECT_MAX_MS = 80_000;

// A thin wrapper around the browser's native WebSocket. Deliberately no
// game logic here -- this only translates between the wire protocol
// (ClientMessage/ServerMessage, defined once in duel-server and reused
// here type-only, so the client can never drift from what the server
// actually speaks) and a small set of callbacks the UI layer reacts to.
//
// It also owns reconnection: a phone locking, a subway tunnel, or a Wi-Fi
// handoff all just look like the socket closing. As long as we're
// mid-match (we're holding a roomCode + reconnectToken from the server),
// a close that wasn't asked for (disconnect()) triggers a few retries
// that try to rejoin the same seat rather than dropping the player back
// to the menu.
export interface DuelClientHandlers {
  onOpen(): void;
  onRoomCreated(roomCode: string, you: PlayerSlot, serverProtocolVersion: unknown): void;
  onJoinedRoom(roomCode: string, you: PlayerSlot, serverProtocolVersion: unknown): void;
  onRejoinedRoom(roomCode: string, you: PlayerSlot, serverProtocolVersion: unknown): void;
  // Nobody else was waiting for this edition yet -- this connection is
  // now the one other quick-match requests get paired with.
  onQuickMatchWaiting(): void;
  // Paired with another quick-match request; same meaning as
  // onRoomCreated/onJoinedRoom, just for both sides at once.
  onMatchFound(roomCode: string, you: PlayerSlot, serverProtocolVersion: unknown): void;
  onOpponentJoined(): void;
  // The opponent's connection dropped but their seat is still reserved --
  // they may still come back.
  onOpponentDisconnected(): void;
  onOpponentReconnected(): void;
  // The opponent's grace period ran out: the room is gone server-side.
  onOpponentLeft(): void;
  onState(state: PublicDuelState): void;
  onActionRejected(reason: string): void;
  onServerError(reason: string): void;
  // Our own connection dropped. Doesn't by itself mean the match is over
  // -- a reconnect attempt may already be under way (see above).
  onDisconnected(): void;
  // Every retry has been used up without getting back in.
  onReconnectFailed(): void;
}

export class DuelClient implements GameClient {
  private socket: WebSocket | null = null;
  private readonly url: string;
  private readonly handlers: DuelClientHandlers;
  private roomCode: string | null = null;
  private reconnectToken: string | null = null;
  private intentionalDisconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDeadline: number | null = null;

  constructor(url: string, handlers: DuelClientHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /** Leave the server (back to the menu). Never retries after this. */
  disconnect(): void {
    this.intentionalDisconnect = true;
    this.cancelReconnect();
    this.roomCode = null;
    this.reconnectToken = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  connect(): void {
    this.intentionalDisconnect = false;
    this.cancelReconnect();
    this.openSocket();
  }

  private openSocket(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.cancelReconnect();
      if (this.roomCode && this.reconnectToken) {
        this.send({ type: "rejoin", roomCode: this.roomCode, token: this.reconnectToken });
      }
      this.handlers.onOpen();
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      const message = JSON.parse(event.data as string) as ServerMessage;
      this.handleMessage(message);
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.handlers.onDisconnected();
      this.maybeScheduleReconnect();
    });

    // A browser WebSocket always fires "close" alongside (or right after)
    // "error", whether or not it ever finished opening -- so the actual
    // reconnect scheduling lives in the "close" handler above. Doing it
    // here too would double-schedule every failed attempt.
    socket.addEventListener("error", () => {});
  }

  private maybeScheduleReconnect(): void {
    if (this.intentionalDisconnect) return;
    if (!this.roomCode || !this.reconnectToken) return; // nothing worth rejoining

    if (this.reconnectDeadline === null) {
      this.reconnectDeadline = Date.now() + RECONNECT_MAX_MS;
    }
    if (Date.now() >= this.reconnectDeadline) {
      this.reconnectDeadline = null;
      this.roomCode = null;
      this.reconnectToken = null;
      this.handlers.onReconnectFailed();
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentionalDisconnect) return;
      this.openSocket();
    }, RECONNECT_RETRY_MS);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectDeadline = null;
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case "room-created":
        this.roomCode = message.roomCode;
        this.reconnectToken = message.reconnectToken;
        this.handlers.onRoomCreated(message.roomCode, message.you, message.protocolVersion);
        return;
      case "joined-room":
        this.roomCode = message.roomCode;
        this.reconnectToken = message.reconnectToken;
        this.handlers.onJoinedRoom(message.roomCode, message.you, message.protocolVersion);
        return;
      case "rejoined-room":
        this.handlers.onRejoinedRoom(message.roomCode, message.you, message.protocolVersion);
        return;
      case "quick-match-waiting":
        this.handlers.onQuickMatchWaiting();
        return;
      case "match-found":
        this.roomCode = message.roomCode;
        this.reconnectToken = message.reconnectToken;
        this.handlers.onMatchFound(message.roomCode, message.you, message.protocolVersion);
        return;
      case "opponent-joined":
        this.handlers.onOpponentJoined();
        return;
      case "opponent-disconnected":
        this.handlers.onOpponentDisconnected();
        return;
      case "opponent-reconnected":
        this.handlers.onOpponentReconnected();
        return;
      case "opponent-left":
        // The room is gone server-side: nothing left to rejoin.
        this.roomCode = null;
        this.reconnectToken = null;
        this.handlers.onOpponentLeft();
        return;
      case "state":
        this.handlers.onState(message.state);
        return;
      case "action-rejected":
        this.handlers.onActionRejected(message.reason);
        return;
      case "error":
        if (message.reason === "room-not-found" || message.reason === "invalid-token") {
          // The server no longer knows this room/seat -- stop retrying it.
          this.roomCode = null;
          this.reconnectToken = null;
        }
        this.handlers.onServerError(message.reason);
        return;
    }
  }

  private send(message: ClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }

  createRoom(edition: Edition = "world"): void {
    this.send({ type: "create-room", edition });
  }

  joinRoom(roomCode: string): void {
    this.send({ type: "join-room", roomCode });
  }

  quickMatch(edition: Edition = "world"): void {
    this.send({ type: "quick-match", edition });
  }

  cancelQuickMatch(): void {
    this.send({ type: "cancel-quick-match" });
  }

  sendAction(action: PlayerAction): void {
    this.send({ type: "player-action", action });
  }
}

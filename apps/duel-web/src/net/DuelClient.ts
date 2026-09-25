import type { Edition } from "@project-palacio/duel-content";
import type { GameClient } from "./GameClient";
import type {
  ClientMessage,
  PlayerAction,
  PlayerSlot,
  PublicDuelState,
  ServerMessage,
} from "@project-palacio/duel-server";

// A thin wrapper around the browser's native WebSocket. Deliberately no
// game logic here -- this only translates between the wire protocol
// (ClientMessage/ServerMessage, defined once in duel-server and reused
// here type-only, so the client can never drift from what the server
// actually speaks) and a small set of callbacks the UI layer reacts to.
export interface DuelClientHandlers {
  onOpen(): void;
  onRoomCreated(roomCode: string, you: PlayerSlot, serverProtocolVersion: unknown): void;
  onJoinedRoom(roomCode: string, you: PlayerSlot, serverProtocolVersion: unknown): void;
  onOpponentJoined(): void;
  onState(state: PublicDuelState): void;
  onActionRejected(reason: string): void;
  onServerError(reason: string): void;
  onDisconnected(): void;
}

export class DuelClient implements GameClient {
  private socket: WebSocket | null = null;
  private readonly url: string;
  private readonly handlers: DuelClientHandlers;

  constructor(url: string, handlers: DuelClientHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /** Leave the server (back to the menu). */
  disconnect(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  connect(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.handlers.onOpen();
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      const message = JSON.parse(event.data as string) as ServerMessage;
      this.handleMessage(message);
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) this.handlers.onDisconnected();
    });

    socket.addEventListener("error", () => {
      if (this.socket === socket) this.handlers.onDisconnected();
    });
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case "room-created":
        this.handlers.onRoomCreated(message.roomCode, message.you, message.protocolVersion);
        return;
      case "joined-room":
        this.handlers.onJoinedRoom(message.roomCode, message.you, message.protocolVersion);
        return;
      case "opponent-joined":
        this.handlers.onOpponentJoined();
        return;
      case "state":
        this.handlers.onState(message.state);
        return;
      case "action-rejected":
        this.handlers.onActionRejected(message.reason);
        return;
      case "error":
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

  sendAction(action: PlayerAction): void {
    this.send({ type: "player-action", action });
  }
}

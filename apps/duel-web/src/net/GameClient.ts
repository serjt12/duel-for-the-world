import type { Edition } from "@project-palacio/duel-content";
import type { PlayerAction } from "@project-palacio/duel-server";

/**
 * What the UI needs from "the other side" of a duel: either the online
 * server (DuelClient, over a WebSocket) or a duel against the computer
 * running right here on the device (LocalDuel). Renderers only ever talk
 * to this, so they can't tell -- or care -- which one they're driving.
 */
export interface GameClient {
  createRoom(edition?: Edition): void;
  joinRoom(roomCode: string): void;
  sendAction(action: PlayerAction): void;
}

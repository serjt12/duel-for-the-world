import type { CardId, Edition } from "@project-palacio/duel-content";
import { DuelRoom } from "./DuelRoom";
import { generateRoomCode } from "./RoomCode";

/**
 * The in-memory registry of active duels. One process, one Map -- fine for
 * a v1 aimed at "actually playable," and swappable for shared storage
 * (Redis, etc.) later without changing anything that calls this class,
 * since callers only ever go through createRoom/getRoom/removeRoom.
 */
export class RoomManager {
  private readonly rooms = new Map<string, DuelRoom>();

  createRoom(deck1?: CardId[], deck2?: CardId[], edition: Edition = "world"): { roomCode: string; room: DuelRoom } {
    let roomCode = generateRoomCode();

    while (this.rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const room = new DuelRoom(deck1, deck2, Math.random, edition);
    this.rooms.set(roomCode, room);

    return { roomCode, room };
  }

  getRoom(roomCode: string): DuelRoom | undefined {
    return this.rooms.get(roomCode);
  }

  removeRoom(roomCode: string): void {
    this.rooms.delete(roomCode);
  }
}

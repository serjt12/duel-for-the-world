import { describe, expect, it } from "vitest";
import { RoomManager } from "../RoomManager";

describe("RoomManager", () => {
  it("creates a room and can look it back up by its room code", () => {
    const manager = new RoomManager();
    const { roomCode, room } = manager.createRoom();

    expect(manager.getRoom(roomCode)).toBe(room);
  });

  it("returns undefined for an unknown room code", () => {
    const manager = new RoomManager();

    expect(manager.getRoom("NOPE1")).toBeUndefined();
  });

  it("removes a room so it's no longer findable", () => {
    const manager = new RoomManager();
    const { roomCode } = manager.createRoom();

    manager.removeRoom(roomCode);

    expect(manager.getRoom(roomCode)).toBeUndefined();
  });

  it("creates rooms with distinct codes across many calls", () => {
    const manager = new RoomManager();
    const codes = new Set(
      Array.from({ length: 10 }, () => manager.createRoom().roomCode),
    );

    expect(codes.size).toBe(10);
  });
});

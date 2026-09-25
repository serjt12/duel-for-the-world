import { describe, expect, it } from "vitest";
import { generateRoomCode } from "../RoomCode";

describe("generateRoomCode", () => {
  it("generates a 5-character code", () => {
    expect(generateRoomCode()).toHaveLength(5);
  });

  it("generates different codes across many calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    expect(codes.size > 1).toBe(true);
  });
});

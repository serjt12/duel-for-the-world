import { describe, expect, it } from "vitest";
import { MatchmakingQueue } from "../MatchmakingQueue";

describe("MatchmakingQueue", () => {
  it("pairs a second ticket with the first one waiting for the same edition", () => {
    const queue = new MatchmakingQueue<string>();

    expect(queue.match("world", "alice")).toBeNull();
    expect(queue.match("world", "bob")).toBe("alice");
  });

  it("keeps separate waiting lists per edition", () => {
    const queue = new MatchmakingQueue<string>();

    expect(queue.match("world", "alice")).toBeNull();
    expect(queue.match("colombia", "bob")).toBeNull();
    expect(queue.match("colombia", "carol")).toBe("bob");
    // "alice" is still waiting for a World Edition opponent.
    expect(queue.match("world", "dave")).toBe("alice");
  });

  it("does not match a ticket with itself", () => {
    const queue = new MatchmakingQueue<string>();

    expect(queue.match("world", "alice")).toBeNull();
    // Re-requesting quick match while already waiting stays queued, not
    // matched against yourself.
    expect(queue.match("world", "alice")).toBeNull();
  });

  it("removing a waiting ticket clears it, so the next request waits fresh", () => {
    const queue = new MatchmakingQueue<string>();

    queue.match("world", "alice");
    queue.remove("alice");

    expect(queue.isWaiting("alice")).toBe(false);
    expect(queue.match("world", "bob")).toBeNull();
  });

  it("remove is a no-op for a ticket that isn't queued", () => {
    const queue = new MatchmakingQueue<string>();

    expect(() => queue.remove("nobody")).not.toThrow();
  });

  it("after a match is made, both tickets are no longer waiting", () => {
    const queue = new MatchmakingQueue<string>();

    queue.match("world", "alice");
    queue.match("world", "bob");

    expect(queue.isWaiting("alice")).toBe(false);
    expect(queue.isWaiting("bob")).toBe(false);
  });

  it("moving a ticket to a different edition drops its old queue entry", () => {
    const queue = new MatchmakingQueue<string>();

    queue.match("world", "alice");
    queue.remove("alice"); // as server.ts does before re-queuing under a new edition
    queue.match("colombia", "alice");

    // No stray "world" entry left for someone else to be paired against.
    expect(queue.match("world", "bob")).toBeNull();
    expect(queue.match("colombia", "carol")).toBe("alice");
  });
});

import { ACTOR_CARDS, CARDS, POLICY_CARDS, SCANDAL_CARDS } from "./Cards";
import type { ActorCardId, CardId, PolicyCardId, ScandalCardId } from "./CardId";

// Runtime checks for card ids that arrive from outside the type system
// (e.g. parsed JSON from a client). Object.hasOwn rather than `in`, so a
// crafted id such as "constructor" or "toString" can't match through the
// object prototype.

export function isCardId(value: unknown): value is CardId {
  return typeof value === "string" && Object.hasOwn(CARDS, value);
}

export function isActorCardId(value: unknown): value is ActorCardId {
  return typeof value === "string" && Object.hasOwn(ACTOR_CARDS, value);
}

export function isPolicyCardId(value: unknown): value is PolicyCardId {
  return typeof value === "string" && Object.hasOwn(POLICY_CARDS, value);
}

export function isScandalCardId(value: unknown): value is ScandalCardId {
  return typeof value === "string" && Object.hasOwn(SCANDAL_CARDS, value);
}

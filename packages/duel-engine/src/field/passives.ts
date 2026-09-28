import { ACTOR_CARDS } from "@duel-for-the-world/duel-content";
import type { Passive } from "@duel-for-the-world/duel-content";
import type { FieldActor } from "./FieldActor";

type PassiveKind = Passive["kind"];

/** An Actor's passives that are active right now (only while face-up). */
export function activePassives(actor: FieldActor): readonly Passive[] {
  return actor.facing === "face-up" ? (ACTOR_CARDS[actor.cardId].passives ?? []) : [];
}

export function passiveOf<K extends PassiveKind>(actor: FieldActor, kind: K): Extract<Passive, { kind: K }> | undefined {
  return activePassives(actor).find((passive) => passive.kind === kind) as Extract<Passive, { kind: K }> | undefined;
}

export function hasPassive(actor: FieldActor, kind: PassiveKind): boolean {
  return passiveOf(actor, kind) !== undefined;
}

/**
 * Does the card itself carry this passive, face-up or not? (For rules
 * that apply to how the card may be played, e.g. campaign-only.)
 */
export function cardHasPassive(actor: Pick<FieldActor, "cardId">, kind: PassiveKind): boolean {
  return (ACTOR_CARDS[actor.cardId].passives ?? []).some((passive) => passive.kind === kind);
}

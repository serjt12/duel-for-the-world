import type { PolicyCardId } from "./CardId";
import type { Edition } from "./Edition";
import type { ActorTarget, InstantEffect, StatModifier } from "./Effects";

// Supported kinds. "continuous" (an ongoing whole-field effect) and
// "field" are parked ideas -- deliberately absent until the engine can
// actually resolve them, so no card can be defined with a kind that would
// silently do nothing.
export type PolicyKind = "normal" | "equip";

interface PolicyCardBase {
  id: PolicyCardId;
  category: "policy";
  edition: Edition;
  name: string;
  flavorText: string;
}

/**
 * The effect fields depend on the kind, so a card can't be defined with a
 * kind and a mismatched (or missing) effect:
 * - "normal": resolves `onActivate` once, then goes to La Embajada. With
 *   a `target`, the player picks that Actor when activating, and
 *   targeted effects (send-target-to-embassy) apply to it.
 * - "equip": attaches to an Actor -- your own, or with
 *   `attachTo: "opponent-actor"` one of your opponent's -- and applies
 *   `whileEquipped` for as long as it stays attached. It sits in its
 *   controller's Backroom zone either way.
 */
export type PolicyCardDefinition =
  | (PolicyCardBase & {
      kind: "normal";
      target?: "opponent-actor";
      // Only an opposing Actor with at most this much (effective) ATK.
      targetMaxAtk?: number;
      onActivate: InstantEffect[];
    })
  | (PolicyCardBase & { kind: "equip"; attachTo: ActorTarget; whileEquipped: StatModifier });

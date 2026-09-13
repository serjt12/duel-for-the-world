import type { CardId } from "./CardId";

export type CardRole =
  | "cheap-melee"
  | "tank"
  | "ranged"
  | "capture-specialist";

export interface CardDefinition {
  id: CardId;
  role: CardRole;
  cost: number;
  cooldownMs: number;
  health: number;
  damage: number;
  attackIntervalMs: number;
  speed: number;
  attackRange: number;
  capturePower: number;
}

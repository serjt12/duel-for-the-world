import type { CardDefinition } from "./CardDefinition";
import type { CardId } from "./CardId";

export const CARDS: Record<CardId, CardDefinition> = {
  militant: {
    id: "militant",
    role: "cheap-melee",
    cost: 2,
    cooldownMs: 6000,
    health: 100,
    damage: 20,
    attackIntervalMs: 1000,
    speed: 1.0,
    attackRange: 1,
    capturePower: 1,
  },

  enforcer: {
    id: "enforcer",
    role: "tank",
    cost: 5,
    cooldownMs: 14000,
    health: 300,
    damage: 25,
    attackIntervalMs: 1500,
    speed: 0.65,
    attackRange: 1,
    capturePower: 1,
  },

  orator: {
    id: "orator",
    role: "ranged",
    cost: 4,
    cooldownMs: 10000,
    health: 80,
    damage: 30,
    attackIntervalMs: 1500,
    speed: 0.85,
    attackRange: 4,
    capturePower: 1,
  },

  operator: {
    id: "operator",
    role: "capture-specialist",
    cost: 3,
    cooldownMs: 12000,
    health: 70,
    damage: 10,
    attackIntervalMs: 1500,
    speed: 1.15,
    attackRange: 1,
    capturePower: 2,
  },
};

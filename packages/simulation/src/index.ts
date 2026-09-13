export {
  SIMULATION_TICK_MS,
  SIMULATION_TICKS_PER_SECOND,
} from "./config/SimulationTime";

export { BattleSimulation } from "./battle/BattleSimulation";

export type {
  BattleState,
  MatchPhase,
} from "./battle/BattleState";

export { updateCardCooldowns } from "./systems/CardCooldownSystem";
export { processBattleCommand } from "./systems/CommandProcessingSystem";

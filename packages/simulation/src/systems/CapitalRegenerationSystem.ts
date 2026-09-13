import {
  MAX_CAPITAL,
  NORMAL_CAPITAL_REGEN_INTERVAL_MS,
} from "../config/EconomyConfig";
import { SIMULATION_TICK_MS } from "../config/SimulationTime";
import type { PlayerState } from "../players/PlayerState";

export function updateCapitalRegeneration(player: PlayerState): void {
  if (player.capital >= MAX_CAPITAL) {
    player.capitalRegenElapsedMs = 0;
    return;
  }

  player.capitalRegenElapsedMs += SIMULATION_TICK_MS;

  if (player.capitalRegenElapsedMs >= NORMAL_CAPITAL_REGEN_INTERVAL_MS) {
    player.capital += 1;
    player.capitalRegenElapsedMs -= NORMAL_CAPITAL_REGEN_INTERVAL_MS;
  }
}

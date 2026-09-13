import type { PlayerState } from "../players/PlayerState";
import { SIMULATION_TICK_MS } from "../config/SimulationTime";

export function updateCardCooldowns(player: PlayerState): void {
  for (const cardId of Object.keys(player.cardCooldowns) as Array<
    keyof typeof player.cardCooldowns
  >) {
    if (player.cardCooldowns[cardId] <= 0) {
      player.cardCooldowns[cardId] = 0;
      continue;
    }

    player.cardCooldowns[cardId] -= SIMULATION_TICK_MS;

    if (player.cardCooldowns[cardId] < 0) {
      player.cardCooldowns[cardId] = 0;
    }
  }
}

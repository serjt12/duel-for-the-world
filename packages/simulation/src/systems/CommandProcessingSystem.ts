import { CARDS } from "@project-palacio/content";
import type { BattleCommand } from "../commands/BattleCommand";
import type { BattleState } from "../battle/BattleState";

export function processBattleCommand(
  state: BattleState,
  command: BattleCommand,
): void {
  if (command.type !== "DEPLOY_UNIT") {
    return;
  }

  const player = state.players[command.playerId];
  const card = CARDS[command.cardId];

  if (player.capital < card.cost) {
    return;
  }

  if (player.cardCooldowns[command.cardId] > 0) {
    return;
  }

  player.capital -= card.cost;
  player.cardCooldowns[command.cardId] = card.cooldownMs;

  state.units.push({
    id: state.nextUnitId,
    ownerId: command.playerId,
    cardId: command.cardId,
    health: card.health,
    targetZoneId: command.targetZoneId,
    attackCooldownMs: 0,
  });

  state.nextUnitId += 1;
}

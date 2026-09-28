import { SCANDAL_CARDS } from "@duel-for-the-world/duel-content";
import type { CardId, ScandalEvent } from "@duel-for-the-world/duel-content";
import type { DuelistId } from "../duelists/DuelistId";
import type { DuelState } from "../duel/DuelState";
import { changeMandate, logEvent, otherDuelist } from "../events/log";
import { archiveActor } from "../field/archiveActor";
import { hasPassive } from "../field/passives";

function assertNever(value: never): never {
  throw new Error(`Unhandled Scandal response: ${JSON.stringify(value)}`);
}

export interface ScandalContext {
  // The attacking Actor, for attack events.
  attackerInstanceId?: number;
  // The just-deployed Actor, for deploy events.
  deployedInstanceId?: number;
  // The Actor destroyed in battle (now in the Scandal controller's
  // Embassy), for the actor-destroyed event.
  destroyedCardId?: CardId;
}

/**
 * Fires the first of `defenderId`'s Set Scandals that lies in wait for
 * `event`: it is revealed, spent (to its controller's Embajada) and its
 * responses resolve in order. Returns true if one fired. Scandals fire
 * automatically -- there's no "do you want to activate?" prompt yet.
 */
export function fireScandal(
  state: DuelState,
  defenderId: DuelistId,
  event: ScandalEvent,
  context: ScandalContext,
): boolean {
  const defender = state.duelists[defenderId];
  const index = defender.setScandals.findIndex((scandal) => {
    const trigger = SCANDAL_CARDS[scandal.cardId].trigger;
    // Scandals fire automatically, so one never fires if its own Mandate
    // cost (e.g. Impeachment's) would knock out its controller.
    const selfCost = trigger.responses.reduce(
      (sum, response) => sum + (response.kind === "change-mandate" && response.recipient === "you" ? response.amount : 0),
      0,
    );
    return trigger.event === event && defender.mandate + selfCost > 0;
  });

  if (index === -1) {
    return false;
  }

  const [triggered] = defender.setScandals.splice(index, 1);
  defender.archive.push(triggered.cardId);
  logEvent(state, { kind: "scandal-triggered", duelistId: defenderId, cardId: triggered.cardId });

  for (const response of SCANDAL_CARDS[triggered.cardId].trigger.responses) {
    if (state.winnerId) {
      break;
    }
    switch (response.kind) {
      case "destroy-attacker":
        if (context.attackerInstanceId !== undefined) {
          archiveActor(state, context.attackerInstanceId, "scandal");
        }
        break;
      case "send-deployed-to-embassy": {
        const deployed = state.duelists[otherDuelist(defenderId)].field.find(
          (actor) => actor.instanceId === context.deployedInstanceId,
        );
        // An immune Actor can't be removed by an opposing effect.
        if (deployed && !hasPassive(deployed, "immune-to-effects")) {
          archiveActor(state, deployed.instanceId, "scandal");
        }
        break;
      }
      case "return-destroyed-to-hand": {
        const index = context.destroyedCardId ? defender.archive.lastIndexOf(context.destroyedCardId) : -1;
        if (index !== -1) {
          const [cardId] = defender.archive.splice(index, 1);
          defender.hand.push(cardId);
          logEvent(state, { kind: "returned-to-hand", duelistId: defenderId, cardId, fromOpponent: false });
        }
        break;
      }
      case "gain-votes":
        defender.bonusVotes += response.amount;
        logEvent(state, { kind: "votes-gained", duelistId: defenderId, amount: response.amount, total: defender.bonusVotes });
        break;
      case "change-mandate":
        changeMandate(
          state,
          response.recipient === "you" ? defenderId : otherDuelist(defenderId),
          response.amount,
        );
        break;
      default:
        assertNever(response);
    }
  }

  return true;
}

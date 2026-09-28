import { isScandalCardId } from "@duel-for-the-world/duel-content";
import type { ScandalCardId } from "@duel-for-the-world/duel-content";
import type { DuelState } from "../duel/DuelState";
import { logEvent } from "../events/log";
import { pickBackroomZone } from "../field/backroom";

export type SetScandalFailureReason =
  | "wrong-phase"
  | "not-a-scandal"
  | "already-set-this-turn"
  | "card-not-in-hand"
  | "invalid-zone"
  | "zone-occupied"
  | "backroom-full";

export type SetScandalResult =
  | { ok: true }
  | { ok: false; reason: SetScandalFailureReason };

/**
 * The Campaign Phase action of Setting a Scandal card face-down. It sits
 * on its controller's field until its trigger condition fires -- for
 * Escandalo de Corrupcion, that's BattleSystem's Ambush Destroy check --
 * or the duel ends. Only one Set per turn, mirroring the Normal Deploy
 * limit.
 */
export function setScandal(
  state: DuelState,
  scandalCardId: ScandalCardId,
  // Which Backroom zone to Set it in; defaults to the first free one.
  zone?: number,
): SetScandalResult {
  if (state.phase !== "campaign-1" && state.phase !== "campaign-2") {
    return { ok: false, reason: "wrong-phase" };
  }

  if (!isScandalCardId(scandalCardId)) {
    return { ok: false, reason: "not-a-scandal" };
  }

  const duelist = state.duelists[state.activeDuelistId];

  if (duelist.hasSetScandalThisTurn) {
    return { ok: false, reason: "already-set-this-turn" };
  }

  const handIndex = duelist.hand.indexOf(scandalCardId);

  if (handIndex === -1) {
    return { ok: false, reason: "card-not-in-hand" };
  }

  // Backroom zones are shared with Policies (Set or equipped).
  const picked = pickBackroomZone(duelist, zone);
  if (!picked.ok) {
    return { ok: false, reason: picked.reason };
  }
  const targetZone = picked.zone;

  duelist.hand.splice(handIndex, 1);
  duelist.setScandals.push({
    instanceId: state.nextInstanceId,
    cardId: scandalCardId,
    controllerId: duelist.id,
    zone: targetZone,
  });
  state.nextInstanceId += 1;
  duelist.hasSetScandalThisTurn = true;
  logEvent(state, { kind: "card-set", duelistId: duelist.id, category: "scandal" });

  return { ok: true };
}

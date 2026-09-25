import type { DuelState } from "../duel/DuelState";
import { resolveActorEffect } from "../effects/resolveInstantEffects";
import type { EmbassyReason } from "../events/DuelEvent";
import { changeMandate, logEvent } from "../events/log";
import type { FieldActor } from "./FieldActor";
import { passiveOf } from "./passives";

/**
 * Removes a field Actor (whichever duelist controls it) and sends it to
 * its controller's Embassy, together with every Equip attached to it --
 * each equip to ITS controller's Embassy, since a hostile equip (e.g.
 * Attack Ad) belongs to the other player. The single path for every way
 * an Actor leaves the field (battle, Scandal, tribute, effect), so none of
 * them can forget the equips, the log, or the "when it falls" abilities:
 *
 * - the fallen Actor's own onSentToEmbassy effect (any reason), and
 * - its controller's other Actors with "mandate-when-ally-lost"
 *   (not for tributes -- a tribute is a choice, not a loss).
 *
 * Returns the removed Actor, or null (changing nothing) if it isn't on
 * the field.
 */
export function archiveActor(state: DuelState, instanceId: number, reason: EmbassyReason): FieldActor | null {
  for (const duelist of [state.duelists.duelist1, state.duelists.duelist2]) {
    const index = duelist.field.findIndex((actor) => actor.instanceId === instanceId);
    if (index === -1) continue;

    const [removed] = duelist.field.splice(index, 1);
    duelist.archive.push(removed.cardId);
    const ownIndex = duelist.archive.length - 1;
    logEvent(state, { kind: "sent-to-embassy", duelistId: duelist.id, cardId: removed.cardId, reason });

    for (const owner of [state.duelists.duelist1, state.duelists.duelist2]) {
      const attached = owner.backroomPolicies.filter((policy) => policy.equippedToInstanceId === instanceId);
      if (attached.length === 0) continue;
      owner.backroomPolicies = owner.backroomPolicies.filter((policy) => policy.equippedToInstanceId !== instanceId);
      for (const policy of attached) {
        owner.archive.push(policy.cardId);
        logEvent(state, { kind: "sent-to-embassy", duelistId: owner.id, cardId: policy.cardId, reason });
      }
    }

    // Its own "when it falls" ability ("another" Actor: not itself).
    resolveActorEffect(state, removed, "fall", { excludeEmbassyIndex: ownIndex });

    // Allies that profit from a loss (The Victim-in-Chief).
    if (reason !== "tribute") {
      for (const ally of [...duelist.field]) {
        const passive = passiveOf(ally, "mandate-when-ally-lost");
        if (passive && !state.winnerId) {
          logEvent(state, { kind: "actor-effect", duelistId: duelist.id, cardId: ally.cardId, trigger: "ally-fell" });
          changeMandate(state, duelist.id, passive.amount);
        }
      }
    }
    return removed;
  }
  return null;
}

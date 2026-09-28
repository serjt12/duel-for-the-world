import { describe, expect, it } from "vitest";
import type { CardId } from "@duel-for-the-world/duel-content";
import { createDuel } from "../createDuel";
import type { DuelState } from "../DuelState";
import { advancePhase } from "../../systems/TurnSystem";
import { deployActor } from "../../systems/DeploySystem";
import { declareAttack } from "../../systems/BattleSystem";
import { activatePolicy } from "../../systems/PolicySystem";
import { setScandal } from "../../systems/ScandalSystem";

function buildDeck(cardId: CardId, size: number): CardId[] {
  return Array.from({ length: size }, () => cardId);
}

// Advances the duel phase-by-phase until `predicate` holds, so tests read
// as "play until X happens" rather than counting phases by hand.
function advanceTo(
  duel: DuelState,
  predicate: (duel: DuelState) => boolean,
  maxSteps = 200,
): void {
  let steps = 0;

  while (!predicate(duel) && steps < maxSteps) {
    advancePhase(duel);
    steps += 1;
  }

  if (!predicate(duel)) {
    throw new Error("advanceTo: predicate not reached within maxSteps");
  }
}

describe("a full duel, end to end", () => {
  it("is won by repeated undefended direct attacks bringing the opponent's Mandate to 0", () => {
    const duel = createDuel(
      buildDeck("la-tribuna", 20), // atk 4, opening hand is 5 copies
      buildDeck("agitador", 20), // never deployed -- just filler so duelist2 doesn't deck out
    );

    advanceTo(duel, (d) => d.phase === "campaign-1");
    expect(deployActor(duel, "la-tribuna", { stance: "campaign", facing: "face-up" })).toEqual({
      ok: true,
    });
    const attackerId = duel.duelists.duelist1.field[0].instanceId;

    let steps = 0;
    while (duel.winnerId === null && steps < 300) {
      advancePhase(duel);

      if (duel.phase === "confrontation" && duel.activeDuelistId === "duelist1") {
        const attacker = duel.duelists.duelist1.field.find(
          (actor) => actor.instanceId === attackerId && !actor.hasAttackedThisTurn,
        );

        if (attacker && attacker.turnDeployed !== duel.turnNumber) {
          declareAttack(duel, attackerId);
        }
      }

      steps += 1;
    }

    expect(duel.winnerId).toBe("duelist1");
    expect(duel.duelists.duelist2.mandate).toBe(0); // 26 - 4*7 = -2, clamped to 0 on the 7th landed attack

    // Confirm the duel is really over: no further state change once won.
    const stateBefore = JSON.stringify(duel);
    advancePhase(duel);
    expect(JSON.stringify(duel)).toBe(stateBefore);
  });

  it("carries Decreto de Emergencia's Mandate gain and Maletin de Sobornos's ATK boost into a later attack", () => {
    const duel = createDuel(
      [
        "agitador",
        "decreto-de-emergencia",
        "maletin-de-sobornos",
        "agitador",
        "agitador",
        ...buildDeck("agitador", 20),
      ],
      buildDeck("agitador", 20),
    );

    advanceTo(duel, (d) => d.phase === "campaign-1");
    expect(
      deployActor(duel, "agitador", { stance: "campaign", facing: "face-up" }),
    ).toEqual({ ok: true });
    const actorId = duel.duelists.duelist1.field[0].instanceId;

    advanceTo(duel, (d) => d.phase === "campaign-2");
    expect(activatePolicy(duel, "decreto-de-emergencia")).toEqual({ ok: true });
    expect(duel.duelists.duelist1.mandate).toBe(31); // 26 + 5

    // Reach duelist1's next turn to equip and attack (can't attack the
    // turn it was deployed).
    advanceTo(
      duel,
      (d) => d.phase === "campaign-1" && d.activeDuelistId === "duelist1" && d.turnNumber === 3,
    );
    expect(
      activatePolicy(duel, "maletin-de-sobornos", { targetInstanceId: actorId }),
    ).toEqual({ ok: true });

    advanceTo(duel, (d) => d.phase === "confrontation");
    const result = declareAttack(duel, actorId);

    // agitador: base atk 3, +2 from the equip = 5.
    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: false, defenderDestroyed: false, mandateDamage: 5 },
    });
    expect(duel.duelists.duelist2.mandate).toBe(21); // 26 - 5
  });

  it("lets a Set Escandalo de Corrupcion ambush an attack on its controller's Actor", () => {
    const duel = createDuel(
      buildDeck("la-tribuna", 20),
      ["agitador", "escandalo-de-corrupcion", ...buildDeck("agitador", 20)],
    );

    advanceTo(duel, (d) => d.phase === "campaign-1" && d.activeDuelistId === "duelist1");
    deployActor(duel, "la-tribuna", { stance: "campaign", facing: "face-up" });
    const attackerId = duel.duelists.duelist1.field[0].instanceId;

    advanceTo(duel, (d) => d.phase === "campaign-1" && d.activeDuelistId === "duelist2");
    deployActor(duel, "agitador", { stance: "campaign", facing: "face-up" });
    setScandal(duel, "escandalo-de-corrupcion");
    const targetId = duel.duelists.duelist2.field[0].instanceId;

    advanceTo(
      duel,
      (d) => d.phase === "confrontation" && d.activeDuelistId === "duelist1" && d.turnNumber === 3,
    );
    const result = declareAttack(duel, attackerId, targetId);

    expect(result).toEqual({
      ok: true,
      outcome: { attackerDestroyed: true, defenderDestroyed: false, mandateDamage: 0 },
    });
    expect(duel.duelists.duelist1.field).toEqual([]);
    expect(duel.duelists.duelist1.archive).toEqual(["la-tribuna"]);
    expect(duel.duelists.duelist2.field).toHaveLength(1);
    expect(duel.duelists.duelist2.setScandals).toEqual([]);
    expect(duel.duelists.duelist2.archive).toEqual(["escandalo-de-corrupcion"]);
  });
});

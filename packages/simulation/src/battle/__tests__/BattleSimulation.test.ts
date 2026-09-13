import { describe, expect, it } from "vitest";
import { BattleSimulation } from "../BattleSimulation";

describe("BattleSimulation", () => {
  it("starts with the expected initial state", () => {
    const simulation = new BattleSimulation();

    expect(simulation.getState()).toEqual({
      tick: 0,
      elapsedMs: 0,
      phase: "normal",
      units: [],
      nextUnitId: 1,
      zones: {
        zoneA: {
          id: "zoneA",
          ownerId: null,
          controlHp: 100,
          maxControlHp: 100,
        },
        zoneB: {
          id: "zoneB",
          ownerId: null,
          controlHp: 100,
          maxControlHp: 100,
        },
        zoneC: {
          id: "zoneC",
          ownerId: null,
          controlHp: 100,
          maxControlHp: 100,
        },
      },
      players: {
        player1: {
          id: "player1",
          cardCooldowns: {
            militant: 0,
            enforcer: 0,
            orator: 0,
            operator: 0,
          },
          capital: 5,
          mandato: 0,
          capitalRegenElapsedMs: 0,
        },
        player2: {
          id: "player2",
          cardCooldowns: {
            militant: 0,
            enforcer: 0,
            orator: 0,
            operator: 0,
          },
          capital: 5,
          mandato: 0,
          capitalRegenElapsedMs: 0,
        },
      },
    });
  });

  it("starts both players with 5 Capital and 0 Mandato", () => {
    const simulation = new BattleSimulation();
    const state = simulation.getState();

    expect(state.players.player1.capital).toBe(5);
    expect(state.players.player1.mandato).toBe(0);
    expect(state.players.player1.capitalRegenElapsedMs).toBe(0);

    expect(state.players.player2.capital).toBe(5);
    expect(state.players.player2.mandato).toBe(0);
    expect(state.players.player2.capitalRegenElapsedMs).toBe(0);
  });

  it("advances exactly one fixed tick", () => {
    const simulation = new BattleSimulation();

    simulation.tick();

    expect(simulation.getState().tick).toBe(1);
    expect(simulation.getState().elapsedMs).toBe(50);
  });

  it("advances exactly one second after twenty ticks", () => {
    const simulation = new BattleSimulation();

    for (let i = 0; i < 20; i += 1) {
      simulation.tick();
    }

    expect(simulation.getState().tick).toBe(20);
    expect(simulation.getState().elapsedMs).toBe(1000);
  });
  it("does not regenerate Capital before two seconds", () => {
    const simulation = new BattleSimulation();

    for (let i = 0; i < 39; i += 1) {
      simulation.tick();
    }

    expect(simulation.getState().players.player1.capital).toBe(5);
    expect(simulation.getState().players.player2.capital).toBe(5);
  });

  it("regenerates exactly one Capital after two seconds", () => {
    const simulation = new BattleSimulation();

    for (let i = 0; i < 40; i += 1) {
      simulation.tick();
    }

    expect(simulation.getState().players.player1.capital).toBe(6);
    expect(simulation.getState().players.player2.capital).toBe(6);

    expect(
      simulation.getState().players.player1.capitalRegenElapsedMs,
    ).toBe(0);
  });

  it("never regenerates above maximum Capital", () => {
    const simulation = new BattleSimulation();

    for (let i = 0; i < 400; i += 1) {
      simulation.tick();
    }

    expect(simulation.getState().players.player1.capital).toBe(10);
    expect(simulation.getState().players.player2.capital).toBe(10);

    expect(
      simulation.getState().players.player1.capitalRegenElapsedMs,
    ).toBe(0);
  });
  it("queues a submitted deploy command without mutating Capital immediately", () => {
    const simulation = new BattleSimulation();

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "militant",
      targetZoneId: "zoneA",
    });

    expect(simulation.getPendingCommandCount()).toBe(1);
    expect(simulation.getState().players.player1.capital).toBe(5);
  });

  it("processes a deploy command on the next tick", () => {
    const simulation = new BattleSimulation();

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "militant",
      targetZoneId: "zoneA",
    });

    simulation.tick();

    expect(simulation.getPendingCommandCount()).toBe(0);
    expect(simulation.getState().players.player1.capital).toBe(3);
    expect(simulation.getState().units).toEqual([
      {
        id: 1,
        ownerId: "player1",
        cardId: "militant",
        health: 100,
        targetZoneId: "zoneA",
        attackCooldownMs: 0,
      },
    ]);
    expect(simulation.getState().nextUnitId).toBe(2);
  });

  it("rejects an unaffordable deploy command without creating a unit", () => {
    const simulation = new BattleSimulation();

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "enforcer",
      targetZoneId: "zoneA",
    });

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "militant",
      targetZoneId: "zoneA",
    });

    simulation.tick();

    expect(simulation.getPendingCommandCount()).toBe(0);
    expect(simulation.getState().players.player1.capital).toBe(0);
    expect(simulation.getState().units).toHaveLength(1);
    expect(simulation.getState().units[0]?.cardId).toBe("enforcer");
    expect(simulation.getState().nextUnitId).toBe(2);
  });

  it("starts card cooldown after deploying a unit", () => {
    const simulation = new BattleSimulation();

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "militant",
      targetZoneId: "zoneA",
    });

    simulation.tick();

    expect(
      simulation.getState().players.player1.cardCooldowns.militant,
    ).toBe(6000);
  });

  it("rejects deploying the same card while it is on cooldown", () => {
    const simulation = new BattleSimulation();

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "militant",
      targetZoneId: "zoneA",
    });

    simulation.tick();

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "militant",
      targetZoneId: "zoneA",
    });

    simulation.tick();

    expect(simulation.getState().units).toHaveLength(1);
    expect(simulation.getState().players.player1.capital).toBe(3);
  });

  it("allows deployment again after cooldown expires", () => {
    const simulation = new BattleSimulation();

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "militant",
      targetZoneId: "zoneA",
    });

    simulation.tick();

    for (let i = 0; i < 120; i += 1) {
      simulation.tick();
    }

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "militant",
      targetZoneId: "zoneB",
    });

    simulation.tick();

    expect(simulation.getState().units).toHaveLength(2);
    expect(
      simulation.getState().players.player1.cardCooldowns.militant,
    ).toBe(6000);
  });

  it("starts all zones neutral with full control HP", () => {
    const simulation = new BattleSimulation();
    const zones = simulation.getState().zones;

    expect(zones.zoneA).toEqual({
      id: "zoneA",
      ownerId: null,
      controlHp: 100,
      maxControlHp: 100,
    });

    expect(zones.zoneB).toEqual({
      id: "zoneB",
      ownerId: null,
      controlHp: 100,
      maxControlHp: 100,
    });

    expect(zones.zoneC).toEqual({
      id: "zoneC",
      ownerId: null,
      controlHp: 100,
      maxControlHp: 100,
    });
  });

  it("does not let a contested zone change control while both units are alive and fighting", () => {
    const simulation = new BattleSimulation();

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "militant",
      targetZoneId: "zoneA",
    });
    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player2",
      cardId: "militant",
      targetZoneId: "zoneA",
    });

    for (let i = 0; i < 61; i += 1) {
      simulation.tick();
    }

    const state = simulation.getState();

    expect(state.zones.zoneA).toEqual({
      id: "zoneA",
      ownerId: null,
      controlHp: 100,
      maxControlHp: 100,
    });
    expect(state.units[0]?.health).toBe(20);
    expect(state.units[1]?.health).toBe(20);
  });

  it("hands the zone to the survivor once combat kills the contesting unit", () => {
    const simulation = new BattleSimulation();

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "militant",
      targetZoneId: "zoneA",
    });
    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player2",
      cardId: "militant",
      targetZoneId: "zoneA",
    });

    for (let i = 0; i < 180; i += 1) {
      simulation.tick();
    }

    const state = simulation.getState();

    expect(state.zones.zoneA.ownerId).toBe("player1");
    expect(state.zones.zoneA.controlHp).toBe(100);
    expect(state.units[0]?.health).toBe(20);
    expect(state.units[1]?.health).toBe(0);
  });

  it("generates no Mandate while every zone is neutral", () => {
    const simulation = new BattleSimulation();

    for (let i = 0; i < 40; i += 1) {
      simulation.tick();
    }

    const state = simulation.getState();

    expect(state.players.player1.mandato).toBe(0);
    expect(state.players.player2.mandato).toBe(0);
  });

  it("starts generating Mandate for a player the same tick they capture a zone", () => {
    const simulation = new BattleSimulation();

    simulation.submitCommand({
      type: "DEPLOY_UNIT",
      playerId: "player1",
      cardId: "operator",
      targetZoneId: "zoneA",
    });

    // operator capturePower 2 * ZONE_CONTROL_RATE_PER_SECOND 20 = 40 HP/s
    // against a 100 HP neutral zone -> captured after exactly 50 ticks.
    for (let i = 0; i < 49; i += 1) {
      simulation.tick();
    }

    expect(simulation.getState().zones.zoneA.ownerId).toBeNull();
    expect(simulation.getState().players.player1.mandato).toBe(0);

    simulation.tick();

    const state = simulation.getState();

    expect(state.zones.zoneA.ownerId).toBe("player1");
    expect(state.players.player1.mandato).toBeCloseTo(0.05, 9);

    for (let i = 0; i < 50; i += 1) {
      simulation.tick();
    }

    expect(simulation.getState().players.player1.mandato).toBeCloseTo(2.55, 9);
    expect(simulation.getState().players.player2.mandato).toBe(0);
  });
});


import { describe, expect, it } from "vitest";
import type { UnitState } from "../../units/UnitState";
import type { ZoneState } from "../../zones/ZoneState";
import { applyCapturePressure, calculateCapturePower, getZoneControlStatus, updateZoneControl } from "../ZoneControlSystem";

const zoneA: ZoneState = {
  id: "zoneA",
  ownerId: null,
  controlHp: 100,
  maxControlHp: 100,
};

describe("ZoneControlSystem", () => {
  it("calculates capture power from living units targeting the zone", () => {
    const units: UnitState[] = [
      {
        id: 1,
        ownerId: "player1",
        cardId: "militant",
        health: 100,
        targetZoneId: "zoneA",
        attackCooldownMs: 0,
      },
      {
        id: 2,
        ownerId: "player1",
        cardId: "operator",
        health: 70,
        targetZoneId: "zoneA",
        attackCooldownMs: 0,
      },
    ];

    expect(calculateCapturePower(units, zoneA, "player1")).toBe(3);
  });

  it("ignores dead units and units targeting another zone", () => {
    const units: UnitState[] = [
      {
        id: 1,
        ownerId: "player1",
        cardId: "militant",
        health: 0,
        targetZoneId: "zoneA",
        attackCooldownMs: 0,
      },
      {
        id: 2,
        ownerId: "player1",
        cardId: "operator",
        health: 70,
        targetZoneId: "zoneB",
        attackCooldownMs: 0,
      },
      {
        id: 3,
        ownerId: "player1",
        cardId: "orator",
        health: 80,
        targetZoneId: "zoneA",
        attackCooldownMs: 0,
      },
    ];

    expect(calculateCapturePower(units, zoneA, "player1")).toBe(1);
  });

  it("does not count units belonging to the other player", () => {
    const units: UnitState[] = [
      {
        id: 1,
        ownerId: "player1",
        cardId: "operator",
        health: 70,
        targetZoneId: "zoneA",
        attackCooldownMs: 0,
      },
      {
        id: 2,
        ownerId: "player2",
        cardId: "enforcer",
        health: 300,
        targetZoneId: "zoneA",
        attackCooldownMs: 0,
      },
    ];

    expect(calculateCapturePower(units, zoneA, "player1")).toBe(2);
    expect(calculateCapturePower(units, zoneA, "player2")).toBe(1);
  });

  it("reduces control HP by the capture power", () => {
    const zone: ZoneState = {
      id: "zoneA",
      ownerId: "player1",
      controlHp: 100,
      maxControlHp: 100,
    };

    applyCapturePressure(zone, 3, 50);

    expect(zone.controlHp).toBe(97);
  });

  it("never reduces control HP below zero", () => {
    const zone: ZoneState = {
      id: "zoneA",
      ownerId: "player1",
      controlHp: 2,
      maxControlHp: 100,
    };

    applyCapturePressure(zone, 3, 50);

    expect(zone.controlHp).toBe(0);
  });

  it("does nothing when there is no capture pressure", () => {
    const zone: ZoneState = {
      id: "zoneA",
      ownerId: "player1",
      controlHp: 73,
      maxControlHp: 100,
    };

    applyCapturePressure(zone, 0, 50);

    expect(zone.controlHp).toBe(73);
  });

  it("scales control damage according to simulated time", () => {
    const zone: ZoneState = {
      id: "zoneA",
      ownerId: "player1",
      controlHp: 100,
      maxControlHp: 100,
    };

    applyCapturePressure(zone, 1, 1000);

    expect(zone.controlHp).toBe(80);
  });
  it("produces the same control damage across equivalent time slices", () => {
    const zoneA: ZoneState = {
      id: "zoneA",
      ownerId: "player1",
      controlHp: 100,
      maxControlHp: 100,
    };

    const zoneB: ZoneState = {
      id: "zoneB",
      ownerId: "player1",
      controlHp: 100,
      maxControlHp: 100,
    };

    applyCapturePressure(zoneA, 1, 1000);

    for (let i = 0; i < 20; i += 1) {
      applyCapturePressure(zoneB, 1, 50);
    }

    expect(zoneA.controlHp).toBe(zoneB.controlHp);
    expect(zoneA.controlHp).toBe(80);
  });

  it("reports neutral when neither player has capture pressure", () => {
    const units: UnitState[] = [];

    expect(getZoneControlStatus(units, zoneA)).toBe("neutral");
  });

  it("reports player1 when only player1 has capture pressure", () => {
    const units: UnitState[] = [
      {
        id: 1,
        ownerId: "player1",
        cardId: "militant",
        health: 100,
        targetZoneId: "zoneA",
        attackCooldownMs: 0,
      },
    ];

    expect(getZoneControlStatus(units, zoneA)).toBe("player1");
  });
  it("reports player2 when only player2 has capture pressure", () => {
    const units: UnitState[] = [
      {
        id: 1,
        ownerId: "player2",
        cardId: "operator",
        health: 70,
        targetZoneId: "zoneA",
        attackCooldownMs: 0,
      },
    ];

    expect(getZoneControlStatus(units, zoneA)).toBe("player2");
  });

  it("reports contested when both players have capture pressure", () => {
    const units: UnitState[] = [
      {
        id: 1,
        ownerId: "player1",
        cardId: "militant",
        health: 100,
        targetZoneId: "zoneA",
        attackCooldownMs: 0,
      },
      {
        id: 2,
        ownerId: "player2",
        cardId: "operator",
        health: 70,
        targetZoneId: "zoneA",
        attackCooldownMs: 0,
      },
    ];

    expect(getZoneControlStatus(units, zoneA)).toBe("contested");
  });

  it("recovers control HP when the owner has uncontested presence", () => {
  const zone: ZoneState = {
    id: "zoneA",
    ownerId: "player1",
    controlHp: 60,
    maxControlHp: 100,
  };

  const units: UnitState[] = [
    {
      id: 1,
      ownerId: "player1",
      cardId: "militant",
      health: 100,
      targetZoneId: "zoneA",
      attackCooldownMs: 0,
    },
  ];

  updateZoneControl(zone, units, 1000);

  expect(zone.controlHp).toBe(80);
  expect(zone.ownerId).toBe("player1");
});

it("does not recover above maximum control HP", () => {
  const zone: ZoneState = {
    id: "zoneA",
    ownerId: "player1",
    controlHp: 95,
    maxControlHp: 100,
  };

  const units: UnitState[] = [
    {
      id: 1,
      ownerId: "player1",
      cardId: "militant",
      health: 100,
      targetZoneId: "zoneA",
      attackCooldownMs: 0,
    },
  ];

  updateZoneControl(zone, units, 1000);

  expect(zone.controlHp).toBe(100);
});
it("reduces control HP when an enemy attacks a controlled zone", () => {
  const zone: ZoneState = {
    id: "zoneA",
    ownerId: "player1",
    controlHp: 100,
    maxControlHp: 100,
  };

  const units: UnitState[] = [
    {
      id: 1,
      ownerId: "player2",
      cardId: "militant",
      health: 100,
      targetZoneId: "zoneA",
      attackCooldownMs: 0,
    },
  ];

  updateZoneControl(zone, units, 1000);

  expect(zone.controlHp).toBe(80);
  expect(zone.ownerId).toBe("player1");
});
it("does not change control HP while the zone is contested", () => {
  const zone: ZoneState = {
    id: "zoneA",
    ownerId: "player1",
    controlHp: 60,
    maxControlHp: 100,
  };

  const units: UnitState[] = [
    {
      id: 1,
      ownerId: "player1",
      cardId: "militant",
      health: 100,
      targetZoneId: "zoneA",
      attackCooldownMs: 0,
    },
    {
      id: 2,
      ownerId: "player2",
      cardId: "operator",
      health: 70,
      targetZoneId: "zoneA",
      attackCooldownMs: 0,
    },
  ];

  updateZoneControl(zone, units, 1000);

  expect(zone.controlHp).toBe(60);
  expect(zone.ownerId).toBe("player1");
});
it("captures a neutral zone when control HP reaches zero", () => {
  const zone: ZoneState = {
    id: "zoneA",
    ownerId: null,
    controlHp: 20,
    maxControlHp: 100,
  };

  const units: UnitState[] = [
    {
      id: 1,
      ownerId: "player1",
      cardId: "operator",
      health: 70,
      targetZoneId: "zoneA",
      attackCooldownMs: 0,
    },
  ];

  updateZoneControl(zone, units, 1000);

  expect(zone.ownerId).toBe("player1");
  expect(zone.controlHp).toBe(100);
});
it("makes a controlled zone neutral when enemy pressure destroys its control HP", () => {
  const zone: ZoneState = {
    id: "zoneA",
    ownerId: "player1",
    controlHp: 20,
    maxControlHp: 100,
  };

  const units: UnitState[] = [
    {
      id: 1,
      ownerId: "player2",
      cardId: "operator",
      health: 70,
      targetZoneId: "zoneA",
      attackCooldownMs: 0,
    },
  ];

  updateZoneControl(zone, units, 1000);

  expect(zone.ownerId).toBeNull();
  expect(zone.controlHp).toBe(0);
});
});

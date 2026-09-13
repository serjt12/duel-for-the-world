import type { ZoneId } from "./ZoneId";
import type { ZoneState } from "./ZoneState";
import { ZONE_MAX_CONTROL_HP } from "../config/EconomyConfig";

export function createInitialZones(): Record<ZoneId, ZoneState> {
  return {
    zoneA: {
      id: "zoneA",
      ownerId: null,
      controlHp: ZONE_MAX_CONTROL_HP,
      maxControlHp: ZONE_MAX_CONTROL_HP,
    },
    zoneB: {
      id: "zoneB",
      ownerId: null,
      controlHp: ZONE_MAX_CONTROL_HP,
      maxControlHp: ZONE_MAX_CONTROL_HP,
    },
    zoneC: {
      id: "zoneC",
      ownerId: null,
      controlHp: ZONE_MAX_CONTROL_HP,
      maxControlHp: ZONE_MAX_CONTROL_HP,
    },
  };
}
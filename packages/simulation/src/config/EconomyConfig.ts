export const STARTING_CAPITAL = 5;
export const MAX_CAPITAL = 10;
export const NORMAL_CAPITAL_REGEN_INTERVAL_MS = 2000;
export const ZONE_MAX_CONTROL_HP = 100;
export const ZONE_CONTROL_RATE_PER_SECOND = 20;

// A player earns Mandate for every zone they currently own, each second,
// regardless of whether that zone is under enemy pressure right now --
// ownership itself is what generates political legitimacy. Placeholder
// balance value, easy to retune later.
export const MANDATE_RATE_PER_ZONE_PER_SECOND = 1;
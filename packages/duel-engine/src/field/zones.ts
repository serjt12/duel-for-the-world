/** True if `zone` is a whole number in 0..count-1 (safe for untrusted input). */
export function isValidZone(zone: unknown, count: number): zone is number {
  return typeof zone === "number" && Number.isInteger(zone) && zone >= 0 && zone < count;
}

/** The lowest-numbered zone not in `occupied`, or null if every zone is taken. */
export function firstFreeZone(occupied: readonly number[], count: number): number | null {
  for (let zone = 0; zone < count; zone += 1) {
    if (!occupied.includes(zone)) {
      return zone;
    }
  }
  return null;
}

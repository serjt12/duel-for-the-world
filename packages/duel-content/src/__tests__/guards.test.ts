import { describe, expect, it } from "vitest";
import { isActorCardId, isCardId, isPolicyCardId, isScandalCardId } from "../guards";

describe("card id guards", () => {
  it("accept real ids of the right category only", () => {
    expect(isActorCardId("agitador")).toBe(true);
    expect(isActorCardId("maletin-de-sobornos")).toBe(false);
    expect(isPolicyCardId("maletin-de-sobornos")).toBe(true);
    expect(isPolicyCardId("agitador")).toBe(false);
    expect(isScandalCardId("escandalo-de-corrupcion")).toBe(true);
    expect(isScandalCardId("decreto-de-emergencia")).toBe(false);
    expect(isCardId("el-caudillo")).toBe(true);
  });

  it("reject names that only exist on the object prototype", () => {
    for (const sneaky of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(isCardId(sneaky)).toBe(false);
      expect(isActorCardId(sneaky)).toBe(false);
      expect(isPolicyCardId(sneaky)).toBe(false);
      expect(isScandalCardId(sneaky)).toBe(false);
    }
  });

  it("reject non-strings", () => {
    for (const value of [null, undefined, 42, {}, ["agitador"]]) {
      expect(isCardId(value)).toBe(false);
    }
  });
});

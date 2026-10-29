import { describe, expect, it } from "vitest";
import { MAX_GAIN, getDb, getGainParameter, getGainValue } from "./gain.ts";

describe("gain conversion", () => {
  it("maps the knob ends and center to silence, +14 dB and unity", () => {
    expect(getGainValue(0)).toBe(0);
    expect(getGainValue(0.5)).toBeCloseTo(1);
    expect(getGainValue(1)).toBeCloseTo(5.0119);
    expect(getGainParameter(0)).toBe(0);
    expect(getGainParameter(1)).toBeCloseTo(0.5);
    expect(getGainParameter(MAX_GAIN)).toBe(1);
  });

  it("is linear in dB above unity", () => {
    expect(getDb(getGainValue(0.75))).toBeCloseTo(7);
    expect(getGainParameter(getGainValue(0.75))).toBeCloseTo(0.75);
  });

  it("round-trips across the whole knob", () => {
    for (let parameter = 0; parameter <= 1; parameter += 0.05) {
      expect(getGainParameter(getGainValue(parameter))).toBeCloseTo(parameter);
    }
  });

  it("clamps values outside the knob range", () => {
    expect(getGainParameter(-1)).toBe(0);
    expect(getGainParameter(10)).toBe(1);
    expect(getGainValue(-0.5)).toBe(0);
    expect(getGainValue(2)).toBe(MAX_GAIN);
  });
});

import { describe, expect, it } from "vitest";
import { type Beats, getBeat, getBpm, getPosition } from "./beats.ts";

const badApple: Beats = { type: "grid", bpm: 138, firstBeat: 19080 / 44100 };

const map: Beats = { type: "map", positions: [-0.5, 0.25, 0.75, 1.75] };

describe("grid", () => {
  it("numbers the first beat at or after the track start as beat 0", () => {
    expect(getBeat(badApple, 19080 / 44100)).toBeCloseTo(0);
    expect(getBeat(badApple, 0)).toBeCloseTo(-19080 / (44100 * (60 / 138)));
    expect(getBeat(badApple, 19080 / 44100 + 60 / 138)).toBeCloseTo(1);
  });

  it("extrapolates lead-in beats", () => {
    expect(getPosition(badApple, -1)).toBeCloseTo(19080 / 44100 - 60 / 138);
  });

  it("offsets grids that start before the track", () => {
    const grid: Beats = { type: "grid", bpm: 120, firstBeat: -1.2 };
    expect(getBeat(grid, 0.3)).toBeCloseTo(0);
    expect(getBeat(grid, 0)).toBeCloseTo(-0.6);
  });

  it("inverts getBeat", () => {
    for (const beat of [-3, 0, 12.5, 687]) {
      expect(getBeat(badApple, getPosition(badApple, beat))).toBeCloseTo(beat);
    }
  });

  it("has a constant bpm", () => {
    expect(getBpm(badApple, 100)).toBe(138);
  });
});

describe("map", () => {
  it("numbers the first beat at or after the track start as beat 0", () => {
    expect(getBeat(map, 0.25)).toBeCloseTo(0);
    expect(getBeat(map, -0.5)).toBeCloseTo(-1);
  });

  it("interpolates between beats", () => {
    expect(getBeat(map, 0.5)).toBeCloseTo(0.5);
    expect(getBeat(map, 1.25)).toBeCloseTo(1.5);
  });

  it("extrapolates past both ends with the edge intervals", () => {
    expect(getBeat(map, -1.25)).toBeCloseTo(-2);
    expect(getBeat(map, 2.75)).toBeCloseTo(3);
  });

  it("inverts getBeat", () => {
    for (const beat of [-2, -0.5, 0, 0.3, 1.5, 4]) {
      expect(getBeat(map, getPosition(map, beat))).toBeCloseTo(beat);
    }
  });

  it("uses the local beat interval for bpm", () => {
    expect(getBpm(map, 0.5)).toBeCloseTo(120);
    expect(getBpm(map, 1.5)).toBeCloseTo(60);
    expect(getBpm(map, 10)).toBeCloseTo(60);
  });
});

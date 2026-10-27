import { describe, expect, it } from "vitest";
import type { Beats } from "./beats.ts";
import { getFraction, getTicks } from "./track-scale.ts";

const grid: Beats = { type: "grid", bpm: 120, firstBeat: 0.25 };

describe("getFraction", () => {
  it("clamps to the track", () => {
    expect(getFraction(30, 120)).toBe(0.25);
    expect(getFraction(-1, 120)).toBe(0);
    expect(getFraction(200, 120)).toBe(1);
    expect(getFraction(1, 0)).toBe(0);
  });
});

describe("getTicks", () => {
  it("places a tick on every bar when bars are wide enough", () => {
    const ticks = getTicks(grid, 10, 1000, 6);
    expect(ticks.map((tick) => tick.beat)).toEqual([0, 4, 8, 12, 16]);
    expect(ticks[1]!.position).toBeCloseTo(2.25);
    expect(ticks.map((tick) => tick.isStrong)).toEqual([true, false, false, false, true]);
  });

  it("thins ticks to phrases when bars are too narrow", () => {
    const ticks = getTicks(grid, 300, 500, 6);
    expect(ticks.slice(0, 3).map((tick) => tick.beat)).toEqual([0, 16, 32]);
    expect(ticks[0]!.isStrong).toBe(true);
    expect(ticks[1]!.isStrong).toBe(false);
  });

  it("aligns ticks to beat 0 when the track starts mid-bar", () => {
    const ticks = getTicks({ type: "grid", bpm: 120, firstBeat: -3.1 }, 10, 1000, 6);
    expect(ticks[0]!.beat % 4).toBe(0);
    expect(ticks[0]!.position).toBeGreaterThanOrEqual(0);
  });

  it("returns nothing for an empty track", () => {
    expect(getTicks(grid, 0, 1000, 6)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { Beats } from "./beats.ts";
import { FULL_RANGE, getFraction, getRenderRange, getTicks } from "./track-scale.ts";

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
    const ticks = getTicks(grid, 10, 100, 6);
    expect(ticks.map((tick) => tick.beat)).toEqual([0, 4, 8, 12, 16]);
    expect(ticks[1]!.position).toBeCloseTo(2.25);
    expect(ticks.map((tick) => tick.isStrong)).toEqual([true, false, false, false, true]);
  });

  it("places a tick on every beat when beats are wide enough", () => {
    const ticks = getTicks(grid, 10, 1000, 6);
    expect(ticks.slice(0, 5).map((tick) => tick.beat)).toEqual([0, 1, 2, 3, 4]);
    expect(ticks.slice(0, 5).map((tick) => tick.isStrong)).toEqual([
      true,
      false,
      false,
      false,
      true,
    ]);
  });

  it("thins ticks to phrases when bars are too narrow", () => {
    const ticks = getTicks(grid, 300, 500, 6);
    expect(ticks.slice(0, 3).map((tick) => tick.beat)).toEqual([0, 16, 32]);
    expect(ticks[0]!.isStrong).toBe(true);
    expect(ticks[1]!.isStrong).toBe(false);
  });

  it("aligns ticks to beat 0 when the track starts mid-bar", () => {
    const ticks = getTicks({ type: "grid", bpm: 120, firstBeat: -3.1 }, 10, 100, 6);
    expect(ticks[0]!.beat % 4).toBe(0);
    expect(ticks[0]!.position).toBeGreaterThanOrEqual(0);
  });

  it("returns nothing for an empty track", () => {
    expect(getTicks(grid, 0, 1000, 6)).toEqual([]);
  });
});

describe("getRenderRange", () => {
  it("covers the whole track when not zoomed", () => {
    expect(getRenderRange(0, 1)).toBe(FULL_RANGE);
  });

  it("covers the visible chunk and one chunk on each side", () => {
    expect(getRenderRange(0.3, 0.25)).toEqual({ start: 0, end: 0.75 });
    expect(getRenderRange(0.55, 0.25)).toEqual({ start: 0.25, end: 1 });
  });

  it("stays the same while scrolling within a chunk", () => {
    expect(getRenderRange(0.26, 0.25)).toEqual(getRenderRange(0.49, 0.25));
  });
});

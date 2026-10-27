import { describe, expect, it } from "vitest";
import { getBeatSelection, getLoopedTime, getSelectionLabel, isInLoop } from "./loop.ts";

describe("getBeatSelection", () => {
  it("orders the anchor and pointer beats", () => {
    expect(getBeatSelection(8, 4)).toEqual({ start: 4, end: 8 });
    expect(getBeatSelection(4, 8)).toEqual({ start: 4, end: 8 });
  });
});

describe("getSelectionLabel", () => {
  it("shows the start, end and beat count", () => {
    expect(getSelectionLabel({ start: 16, end: 32 })).toBe("16 – 32 · 16 beats");
    expect(getSelectionLabel({ start: 3, end: 4 })).toBe("3 – 4 · 1 beat");
  });

  it("rounds unsnapped beats", () => {
    expect(getSelectionLabel({ start: 1.234_56, end: 2.5 })).toBe("1.23 – 2.5 · 1.27 beats");
  });
});

describe("isInLoop", () => {
  it("includes the start and excludes the end", () => {
    const loop = { start: 2, end: 4 };
    expect(isInLoop(2, loop)).toBe(true);
    expect(isInLoop(3.9, loop)).toBe(true);
    expect(isInLoop(4, loop)).toBe(false);
    expect(isInLoop(1, loop)).toBe(false);
  });
});

describe("getLoopedTime", () => {
  const loop = { start: 2, end: 4 };

  it("jumps to the start when playback crosses the end", () => {
    expect(getLoopedTime(3.99, 4.01, loop)).toBe(2);
    expect(getLoopedTime(1, 4.5, loop)).toBe(2);
  });

  it("does not jump before the end or after a seek past it", () => {
    expect(getLoopedTime(3, 3.5, loop)).toBeUndefined();
    expect(getLoopedTime(5, 5.1, loop)).toBeUndefined();
  });
});

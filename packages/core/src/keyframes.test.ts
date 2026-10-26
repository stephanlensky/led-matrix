import { describe, expect, it } from "vitest";
import { easings, getKeyframeValue, resolveParams } from "./keyframes.ts";

describe("easings", () => {
  it("map 0 to 0 and 1 to 1", () => {
    for (const easing of Object.values(easings)) {
      expect(easing(0)).toBeCloseTo(0);
      expect(easing(1)).toBeCloseTo(1);
    }
  });
});

describe("getKeyframeValue", () => {
  it("interpolates numbers between keyframes with easing", () => {
    const keyframes = [
      { at: 0, value: 0, easing: "easeInQuad" as const },
      { at: 0.5, value: 10 },
      { at: 1, value: 20 },
    ];
    expect(getKeyframeValue(keyframes, 0.25)).toBeCloseTo(2.5);
    expect(getKeyframeValue(keyframes, 0.75)).toBeCloseTo(15);
  });

  it("holds the first and last values outside the track", () => {
    const keyframes = [
      { at: 0.75, value: 5 },
      { at: 0.25, value: 1 },
    ];
    expect(getKeyframeValue(keyframes, 0)).toBe(1);
    expect(getKeyframeValue(keyframes, 1)).toBe(5);
  });

  it("interpolates colors", () => {
    const keyframes = [
      { at: 0, value: "#000000" },
      { at: 1, value: "#ff0080" },
    ];
    expect(getKeyframeValue(keyframes, 0.5)).toBe("#800040");
  });
});

describe("resolveParams", () => {
  it("replaces keyframe tracks and keeps static values", () => {
    const params = {
      text: "HI",
      brightness: {
        keyframes: [
          { at: 0, value: 0 },
          { at: 1, value: 1 },
        ],
      },
    };
    expect(resolveParams(params, 0.5)).toEqual({ text: "HI", brightness: 0.5 });
  });
});

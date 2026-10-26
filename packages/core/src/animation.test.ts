import { describe, expect, it } from "vitest";
import { animationSchema, getAnimationTiming } from "./animation.ts";

describe("animationSchema", () => {
  it("applies layer defaults", () => {
    const animation = animationSchema.parse({
      name: "Plasma",
      mode: { type: "loop", beats: 4 },
      layers: [{ effect: "plasma" }],
    });
    expect(animation.layers[0]).toEqual({
      effect: "plasma",
      params: {},
      blend: "normal",
      opacity: 1,
    });
  });

  it("rejects unknown effects and invalid params", () => {
    const result = animationSchema.safeParse({
      name: "Broken",
      mode: { type: "duration", ms: 1000 },
      layers: [
        { effect: "missing" },
        { effect: "solid", params: { color: "red" } },
        {
          effect: "strobe",
          params: {
            duty: {
              keyframes: [
                { at: 0, value: 0.5 },
                { at: 1, value: 2 },
              ],
            },
          },
        },
      ],
    });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ["layers", 0, "effect"],
      ["layers", 1, "params", "color"],
      ["layers", 2, "params", "duty"],
    ]);
  });

  it("rejects invalid modes", () => {
    expect(
      animationSchema.safeParse({
        name: "x",
        mode: { type: "loop" },
        layers: [{ effect: "solid" }],
      }).success,
    ).toBe(false);
  });
});

describe("getAnimationTiming", () => {
  it("wraps beat loops using the bpm", () => {
    expect(getAnimationTiming({ type: "loop", beats: 4 }, 2500, 120, 30)).toEqual({
      time: 500,
      progress: 0.25,
      beat: 1,
    });
  });

  it("wraps frame loops using the fps", () => {
    expect(getAnimationTiming({ type: "loop", frames: 30 }, 1500, 120, 30).progress).toBeCloseTo(
      0.5,
    );
  });

  it("clamps duration animations at their end", () => {
    expect(getAnimationTiming({ type: "duration", ms: 1000 }, 5000, 120, 30)).toEqual({
      time: 1000,
      progress: 1,
      beat: 2,
    });
  });
});

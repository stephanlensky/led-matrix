import { type Frame, animationSchema, createRenderer, getAnimationLength } from "@led-matrix/core";
import { nodeCanvas } from "@led-matrix/core/node-canvas";
import { describe, expect, it } from "vitest";
import { seedAnimations } from "./seeds.ts";

function getPixels(frame: Frame): string[] {
  return Array.from({ length: frame.length / 3 }, (_, pixel) =>
    frame.subarray(pixel * 3, pixel * 3 + 3).join(),
  );
}

describe("seed animations", () => {
  it("are valid", () => {
    for (const animation of Object.values(seedAnimations)) {
      expect(animationSchema.safeParse(animation).error).toBeUndefined();
    }
  });

  it("continue the cat between sections, adding only the launch sparks", () => {
    const animation = animationSchema.parse(seedAnimations["cat"]);
    const renderer = createRenderer({ fps: 30, canvas: nodeCanvas });
    const changedPixels = animation.sections.slice(0, -1).map(({ mode }, index) => {
      const end = mode.type === "loop" ? 0 : getAnimationLength(mode, 120, 30);
      const before = getPixels(renderer.render(animation, end, 120, index));
      const after = getPixels(renderer.render(animation, 0, 120, index + 1));
      return before.filter((pixel, offset) => pixel !== after[offset]).length;
    });
    expect(changedPixels[0]).toBe(0);
    expect(changedPixels[1]).toBeLessThan(12);
  });
});

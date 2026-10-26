import { describe, expect, it } from "vitest";
import { animationSchema } from "../animation.ts";
import { nodeCanvas } from "../node-canvas.ts";
import { createRenderer } from "../renderer.ts";
import { effects, getEffect } from "./index.ts";

describe("built-in effects", () => {
  it("have unique ids", () => {
    expect(new Set(effects.map((effect) => effect.id)).size).toBe(effects.length);
    expect(getEffect("plasma")?.name).toBe("Plasma");
    expect(getEffect("missing")).toBeUndefined();
  });

  it.each(effects.map((effect) => [effect.id]))("%s renders with default params", (id) => {
    const renderer = createRenderer({ fps: 30, canvas: nodeCanvas });
    const animation = animationSchema.parse({
      name: id,
      mode: { type: "loop", beats: 4 },
      layers: [{ effect: id }],
    });
    const frames = [0, 300, 1200].map((elapsed) => renderer.render(animation, elapsed, 120));
    expect(frames.some((frame) => frame.some((value) => value > 0))).toBe(true);
  });
});

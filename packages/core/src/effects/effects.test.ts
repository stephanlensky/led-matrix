import { describe, expect, it } from "vitest";
import { animationSchema } from "../animation.ts";
import { emptyClipLibrary } from "../clip.ts";
import { nodeCanvas } from "../node-canvas.ts";
import { CHANNELS, HEIGHT, type RgbaImage, WIDTH, createRgbaImage } from "../frame.ts";
import { createRenderer } from "../renderer.ts";
import { effects, getEffect } from "./index.ts";

describe("built-in effects", () => {
  it("have unique ids", () => {
    expect(new Set(effects.map((effect) => effect.id)).size).toBe(effects.length);
    expect(getEffect("plasma")?.name).toBe("Plasma");
    expect(getEffect("missing")).toBeUndefined();
  });

  it.each(effects.filter((effect) => effect.id !== "clip").map((effect) => [effect.id]))(
    "%s renders with default params",
    (id) => {
      const renderer = createRenderer({ fps: 30, canvas: nodeCanvas });
      const animation = animationSchema.parse({
        name: id,
        mode: { type: "loop", beats: 4 },
        layers:
          getEffect(id)?.kind === "filter"
            ? [{ effect: "plasma" }, { effect: id }]
            : [{ effect: id }],
      });
      const frames = [0, 300, 1200].map((elapsed) => renderer.render(animation, elapsed, 120));
      expect(frames.some((frame) => frame.some((value) => value > 0))).toBe(true);
    },
  );
});

function getLitColumns(align: string): number[] {
  const renderer = createRenderer({ fps: 30 });
  const animation = animationSchema.parse({
    name: "text",
    mode: { type: "loop", beats: 4 },
    layers: [{ effect: "text", params: { text: "I", font: "spleen-5x8", align } }],
  });
  const frame = renderer.render(animation, 0, 120);
  const columns = new Set<number>();
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
    if (frame[pixel * CHANNELS]) {
      columns.add(pixel % WIDTH);
    }
  }
  return [...columns].toSorted((a, b) => a - b);
}

describe("text", () => {
  it("aligns lines horizontally", () => {
    expect(Math.max(...getLitColumns("left"))).toBeLessThan(5);
    expect(Math.min(...getLitColumns("right"))).toBeGreaterThan(WIDTH - 6);
    const center = getLitColumns("center");
    expect(Math.min(...center)).toBeGreaterThan(WIDTH / 2 - 5);
    expect(Math.max(...center)).toBeLessThan(WIDTH / 2 + 5);
  });
});

function renderEffect(id: string, progress: number): RgbaImage {
  const effect = getEffect(id);
  const image = createRgbaImage();
  if (effect?.kind === "pixel") {
    effect.render(image, {
      params: effect.params.parse({}),
      progress,
      time: 0,
      beat: 0,
      bpm: 120,
      cycle: 0,
      clips: emptyClipLibrary,
    });
  }
  return image;
}

function getMeanDifference(a: RgbaImage, b: RgbaImage): number {
  return a.reduce((sum, value, index) => sum + Math.abs(value - (b[index] ?? 0)), 0) / a.length;
}

describe("cat sequence", () => {
  it.each([
    ["cat", "cat-spawn"],
    ["cat-spawn", "cat-bounce"],
    ["cat-bounce", "cat-bounce"],
    ["cat-pair-spawn", "cat-hyperspace"],
    ["cat-hyperspace", "cat-hyperspace"],
    ["cat-pair-spawn", "cat-explode"],
  ])("%s ends where %s starts", (from, to) => {
    expect(getMeanDifference(renderEffect(from, 1 - 1e-6), renderEffect(to, 0))).toBeLessThan(0.5);
  });
});

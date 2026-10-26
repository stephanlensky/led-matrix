import { describe, expect, it } from "vitest";
import { animationSchema } from "./animation.ts";
import { getPixel } from "./frame.ts";
import { nodeCanvas } from "./node-canvas.ts";
import { createRenderer } from "./renderer.ts";

function render(input: unknown, elapsed = 0, bpm = 120) {
  const renderer = createRenderer({ fps: 30, canvas: nodeCanvas });
  return renderer.render(animationSchema.parse(input), elapsed, bpm);
}

const loop = { type: "loop", beats: 4 } as const;

function renderBlend(blend: string, opacity = 1) {
  return getPixel(
    render({
      name: "Blend",
      mode: loop,
      layers: [
        { effect: "solid", params: { color: "#804020" } },
        { effect: "solid", params: { color: "#808080" }, blend, opacity },
      ],
    }),
    10,
    10,
  );
}

describe("renderer", () => {
  it("renders a solid layer", () => {
    const frame = render({
      name: "Red",
      mode: loop,
      layers: [{ effect: "solid", params: { color: "#ff0000" } }],
    });
    expect(getPixel(frame, 0, 0)).toEqual([255, 0, 0]);
    expect(getPixel(frame, 63, 63)).toEqual([255, 0, 0]);
  });

  it("composites layers with blend modes and opacity", () => {
    expect(renderBlend("normal")).toEqual([128, 128, 128]);
    expect(renderBlend("normal", 0.5)).toEqual([128, 96, 80]);
    expect(renderBlend("add")).toEqual([255, 192, 160]);
    expect(renderBlend("multiply")).toEqual([64, 32, 16]);
    expect(renderBlend("difference")).toEqual([0, 64, 96]);
  });

  it("lets transparent pixels show lower layers", () => {
    const frame = render({
      name: "Text",
      mode: loop,
      layers: [
        { effect: "solid", params: { color: "#0000ff" } },
        { effect: "scrolling-text", params: { text: "", color: "#ffffff" } },
      ],
    });
    expect(getPixel(frame, 32, 32)).toEqual([0, 0, 255]);
  });

  it("resolves keyframed params over the animation progress", () => {
    const animation = {
      name: "Fade",
      mode: { type: "duration", ms: 1000 },
      layers: [
        {
          effect: "solid",
          params: {
            color: {
              keyframes: [
                { at: 0, value: "#000000" },
                { at: 1, value: "#ffffff" },
              ],
            },
          },
        },
      ],
    } as const;
    expect(getPixel(render(animation, 0), 0, 0)).toEqual([0, 0, 0]);
    expect(getPixel(render(animation, 500), 0, 0)).toEqual([128, 128, 128]);
    expect(getPixel(render(animation, 2000), 0, 0)).toEqual([255, 255, 255]);
  });

  it("strobes on the beat", () => {
    const animation = {
      name: "Strobe",
      mode: loop,
      layers: [{ effect: "strobe", params: { duty: 0.5 } }],
    };
    expect(getPixel(render(animation, 100), 0, 0)).toEqual([255, 255, 255]);
    expect(getPixel(render(animation, 400), 0, 0)).toEqual([0, 0, 0]);
  });

  it("renders canvas effects through the canvas provider and resets state per frame", () => {
    const renderer = createRenderer({ fps: 30, canvas: nodeCanvas });
    const animation = animationSchema.parse({
      name: "Squares",
      mode: loop,
      layers: [{ effect: "squares" }],
    });
    const first = renderer.render(animation, 0, 120);
    expect(first.some((value) => value > 0)).toBe(true);
    renderer.render(animation, 300, 120);
    expect(renderer.render(animation, 0, 120)).toEqual(first);
  });

  it("produces identical frames on every loop pass", () => {
    const animation = {
      name: "Plasma",
      mode: loop,
      layers: [{ effect: "plasma", params: { cycles: 2 } }],
    };
    expect(render(animation, 250)).toEqual(render(animation, 2250));
  });

  it("throws for canvas effects without a canvas provider", () => {
    const renderer = createRenderer({ fps: 30 });
    const animation = animationSchema.parse({
      name: "Squares",
      mode: loop,
      layers: [{ effect: "squares" }],
    });
    expect(() => renderer.render(animation, 0, 120)).toThrow("canvas provider");
  });
});

function isPartial(value: number): boolean {
  return value > 0 && value < 255;
}

describe("antialias", () => {
  it("snaps canvas edges to fully opaque or transparent pixels when disabled", () => {
    const layer = { effect: "big-text", params: { text: "O", color: "#ffffff" } };
    const smooth = render({ name: "Smooth", mode: loop, layers: [layer] });
    const sharp = render({ name: "Sharp", mode: loop, layers: [{ ...layer, antialias: false }] });
    expect(smooth.some(isPartial)).toBe(true);
    expect(sharp.some(isPartial)).toBe(false);
  });
});

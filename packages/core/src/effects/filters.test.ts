import { describe, expect, it } from "vitest";
import { animationSchema } from "../animation.ts";
import { getPixel } from "../frame.ts";
import { nodeCanvas } from "../node-canvas.ts";
import { createRenderer } from "../renderer.ts";

const loop = { type: "loop", beats: 4 } as const;

const gradient = { effect: "squares", params: { glow: 0 } };

function render(layers: unknown[], elapsed = 0) {
  const renderer = createRenderer({ fps: 30, canvas: nodeCanvas });
  return renderer.render(
    animationSchema.parse({ name: "Filter", mode: loop, layers }),
    elapsed,
    120,
  );
}

describe("filter effects", () => {
  it("leave flat colors unchanged when embossing", () => {
    const frame = render([
      { effect: "solid", params: { color: "#804020" } },
      { effect: "emboss", params: { specular: 0.5 } },
    ]);
    expect(getPixel(frame, 32, 32)).toEqual([128, 64, 32]);
  });

  it("shade edges facing toward and away from the light", () => {
    const frame = render([
      { effect: "text", params: { text: "■", font: "spleen-16x32", color: "#808080" } },
      { effect: "emboss", params: { angle: 180, elevation: 30, specular: 0 } },
    ]);
    const lit = Array.from({ length: 64 }, (_, x) => getPixel(frame, x, 32)[0]);
    expect(Math.max(...lit)).toBeGreaterThan(128);
  });

  it("replace the layers below instead of drawing over them", () => {
    const frame = render([
      { effect: "solid", params: { color: "#ffffff" } },
      { effect: "tilt", params: { wobble: 0, spinEvery: 0, scale: 0.5 } },
    ]);
    expect(getPixel(frame, 32, 32)).toEqual([255, 255, 255]);
    expect(getPixel(frame, 2, 2)).toEqual([0, 0, 0]);
  });

  it("mix with the unfiltered image by opacity", () => {
    const frame = render([
      { effect: "solid", params: { color: "#ffffff" } },
      { effect: "tilt", params: { wobble: 0, spinEvery: 0, scale: 0.5 }, opacity: 0.5 },
    ]);
    expect(getPixel(frame, 2, 2)).toEqual([128, 128, 128]);
  });

  it("keep the image unchanged when the plane faces the camera", () => {
    const layers = [gradient];
    expect(
      render([
        ...layers,
        { effect: "tilt", params: { wobble: 0, spinEvery: 0, scale: 1, sampling: "nearest" } },
      ]),
    ).toEqual(render(layers));
  });

  it("spin the plane on the beat", () => {
    const layers = [
      { effect: "text", params: { text: "A" } },
      { effect: "tilt", params: { wobble: 0, spinEvery: 4, spinBeats: 2 } },
    ];
    expect(render(layers, 500)).not.toEqual(render(layers, 0));
    expect(render(layers, 1000)).toEqual(render(layers, 0));
  });

  it("mirror the left half onto the right", () => {
    const frame = render([
      { effect: "text", params: { text: "A", align: "left" } },
      { effect: "mirror" },
    ]);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 32; x++) {
        expect(getPixel(frame, 63 - x, y)).toEqual(getPixel(frame, x, y));
      }
    }
  });

  it("posterize to the given number of levels", () => {
    const frame = render([
      { effect: "solid", params: { color: "#604020" } },
      { effect: "posterize", params: { levels: 2 } },
    ]);
    expect(getPixel(frame, 0, 0)).toEqual([0, 0, 0]);
  });

  it("fade trails from earlier frames", () => {
    const renderer = createRenderer({ fps: 30, canvas: nodeCanvas });
    const animation = animationSchema.parse({
      name: "Trails",
      mode: loop,
      layers: [
        { effect: "strobe", params: { duty: 0.5 } },
        { effect: "trails", params: { decay: 0.5 } },
      ],
    });
    expect(getPixel(renderer.render(animation, 100, 120), 0, 0)).toEqual([255, 255, 255]);
    expect(getPixel(renderer.render(animation, 300, 120), 0, 0)).toEqual([128, 128, 128]);
  });
});

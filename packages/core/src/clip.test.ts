import { describe, expect, it } from "vitest";
import { animationSchema } from "./animation.ts";
import {
  CLIP_FRAME_BYTES,
  type Clip,
  createClip,
  encodeClipFrames,
  fitImage,
  getClipFrameIndex,
  getEncodedFrameCount,
} from "./clip.ts";
import { getParamFields } from "./params.ts";
import { clip } from "./effects/clip.ts";
import { type Color, fillRgbaImage, createRgbaImage, getPixel, getRgbaPixel } from "./frame.ts";
import { createRenderer } from "./renderer.ts";

function createSource(width: number, height: number, getColor: (x: number, y: number) => Color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set([...getColor(x, y), 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

const checkerboard = createSource(128, 128, (x, y) =>
  (x + y) % 2 === 0 ? [255, 255, 255] : [0, 0, 0],
);

describe("fitImage", () => {
  it("averages pixels with area resampling", () => {
    const image = fitImage(checkerboard, { fit: "fill", resample: "area" });
    expect(getRgbaPixel(image, 10, 10)).toEqual([128, 128, 128, 255]);
  });

  it("keeps hard pixels with nearest resampling", () => {
    const image = fitImage(checkerboard, { fit: "fill", resample: "nearest" });
    expect([0, 255]).toContain(getRgbaPixel(image, 10, 10)[0]);
  });

  it("letterboxes wide images with contain", () => {
    const wide = createSource(128, 64, () => [255, 0, 0]);
    const image = fitImage(wide, { fit: "contain", resample: "area" });
    expect(getRgbaPixel(image, 0, 0)[3]).toBe(0);
    expect(getRgbaPixel(image, 0, 32)).toEqual([255, 0, 0, 255]);
  });

  it("crops wide images with cover", () => {
    const halves = createSource(128, 32, (x) => (x < 32 ? [255, 0, 0] : [0, 0, 255]));
    const image = fitImage(halves, { fit: "cover", resample: "nearest" });
    expect(getRgbaPixel(image, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(getRgbaPixel(image, 0, 63)).toEqual([0, 0, 255, 255]);
  });
});

describe("encodeClipFrames", () => {
  it("round-trips frames across compression groups", () => {
    const frameCount = 11;
    const frames = new Uint8Array(frameCount * CLIP_FRAME_BYTES);
    for (let index = 0; index < frameCount; index++) {
      frames.fill(index * 20, index * CLIP_FRAME_BYTES, (index + 1) * CLIP_FRAME_BYTES);
    }
    const encoded = encodeClipFrames(frames);
    const decoded = createClip(encoded, []);
    expect(getEncodedFrameCount(encoded)).toBe(frameCount);
    expect(decoded.getFrame(10)?.[0]).toBe(200);
    expect(decoded.getFrame(3)?.[CLIP_FRAME_BYTES - 1]).toBe(60);
    expect(decoded.getFrame(frameCount)).toBeUndefined();
  });
});

describe("getClipFrameIndex", () => {
  it("weights frames by duration", () => {
    const durations = [100, 300];
    expect(getClipFrameIndex({ durations }, 0)).toBe(0);
    expect(getClipFrameIndex({ durations }, 0.2)).toBe(0);
    expect(getClipFrameIndex({ durations }, 0.3)).toBe(1);
    expect(getClipFrameIndex({ durations }, 1)).toBe(1);
  });
});

const colors: readonly Color[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
];

const testFrames = colors.map((color) => {
  const image = createRgbaImage();
  fillRgbaImage(image, color);
  return image;
});

const testClip: Clip = {
  durations: [100, 100, 100, 100],
  getFrame: (index) => testFrames[index],
};

function renderClip(
  params: Record<string, unknown>,
  elapsed: number,
  mode = { type: "loop", beats: 4 },
) {
  const renderer = createRenderer({
    fps: 30,
    clips: { getClip: (id) => (id === "test" ? testClip : undefined) },
  });
  const animation = animationSchema.parse({
    name: "Clip",
    mode,
    layers: [{ effect: "clip", params: { clip: "test", ...params } }],
  });
  return getPixel(renderer.render(animation, elapsed, 120), 32, 32);
}

describe("clip effect", () => {
  it("plays frames at their native timing", () => {
    expect(renderClip({}, 0)).toEqual([255, 0, 0]);
    expect(renderClip({}, 150)).toEqual([0, 255, 0]);
    expect(renderClip({}, 450)).toEqual([255, 0, 0]);
    expect(renderClip({ speed: 2 }, 150)).toEqual([255, 255, 0]);
  });

  it("stretches the clip over the animation length", () => {
    expect(renderClip({ timing: "stretch" }, 600)).toEqual([0, 255, 0]);
    expect(renderClip({ timing: "stretch", cycles: 2 }, 600)).toEqual([0, 0, 255]);
  });

  it("plays in reverse and ping-pong", () => {
    expect(renderClip({ direction: "reverse" }, 50)).toEqual([255, 255, 0]);
    expect(renderClip({ direction: "pingpong" }, 350)).toEqual([255, 255, 0]);
    expect(renderClip({ direction: "pingpong" }, 650)).toEqual([0, 255, 0]);
  });

  it("tints frames", () => {
    expect(renderClip({ direction: "reverse", tint: "#800000" }, 50)).toEqual([128, 0, 0]);
  });

  it("renders nothing for a missing clip", () => {
    expect(renderClip({ clip: "missing" }, 0)).toEqual([0, 0, 0]);
  });

  it("exposes the clip param as a clip field", () => {
    expect(getParamFields(clip.params)[0]).toMatchObject({ key: "clip", type: "clip" });
  });
});

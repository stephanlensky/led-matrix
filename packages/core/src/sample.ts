import { HEIGHT, RGBA_CHANNELS, type RgbaImage, WIDTH } from "./frame.ts";

export const samplingModes = ["nearest", "bilinear"] as const;

export type SamplingMode = (typeof samplingModes)[number];

export type Rgba = [r: number, g: number, b: number, a: number];

export function createRgba(): Rgba {
  return [0, 0, 0, 0];
}

function sampleNearest(image: RgbaImage, x: number, y: number, out: Rgba): void {
  const pixelX = Math.floor(x);
  const pixelY = Math.floor(y);
  if (pixelX < 0 || pixelX >= WIDTH || pixelY < 0 || pixelY >= HEIGHT) {
    out.fill(0);
    return;
  }
  const offset = (pixelY * WIDTH + pixelX) * RGBA_CHANNELS;
  for (let channel = 0; channel < RGBA_CHANNELS; channel++) {
    out[channel] = image[offset + channel] ?? 0;
  }
}

function sampleBilinear(image: RgbaImage, x: number, y: number, out: Rgba): void {
  const left = Math.floor(x - 0.5);
  const top = Math.floor(y - 0.5);
  const fractionX = x - 0.5 - left;
  const fractionY = y - 0.5 - top;
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  for (let row = 0; row < 2; row++) {
    const pixelY = top + row;
    if (pixelY < 0 || pixelY >= HEIGHT) {
      continue;
    }
    const weightY = row === 0 ? 1 - fractionY : fractionY;
    for (let column = 0; column < 2; column++) {
      const pixelX = left + column;
      if (pixelX < 0 || pixelX >= WIDTH) {
        continue;
      }
      const offset = (pixelY * WIDTH + pixelX) * RGBA_CHANNELS;
      const weight = weightY * (column === 0 ? 1 - fractionX : fractionX);
      const coverage = (weight * (image[offset + 3] ?? 0)) / 255;
      red += (image[offset] ?? 0) * coverage;
      green += (image[offset + 1] ?? 0) * coverage;
      blue += (image[offset + 2] ?? 0) * coverage;
      alpha += coverage;
    }
  }
  if (alpha === 0) {
    out.fill(0);
    return;
  }
  out[0] = red / alpha;
  out[1] = green / alpha;
  out[2] = blue / alpha;
  out[3] = alpha * 255;
}

export function sampleImage(
  image: RgbaImage,
  x: number,
  y: number,
  mode: SamplingMode,
  out: Rgba,
): Rgba {
  if (mode === "nearest") {
    sampleNearest(image, x, y, out);
  } else {
    sampleBilinear(image, x, y, out);
  }
  return out;
}

export function getReflected(position: number, length: number): number {
  const span = length - 1;
  const period = span * 2;
  const wrapped = (((position - 0.5) % period) + period) % period;
  return 0.5 + (wrapped < span ? wrapped : period - wrapped);
}

export function setRgba(image: RgbaImage, x: number, y: number, [r, g, b, a]: Rgba): void {
  const offset = (y * WIDTH + x) * RGBA_CHANNELS;
  image[offset] = r;
  image[offset + 1] = g;
  image[offset + 2] = b;
  image[offset + 3] = a;
}

export function getLuminance(image: RgbaImage, x: number, y: number): number {
  const clampedX = Math.min(Math.max(x, 0), WIDTH - 1);
  const clampedY = Math.min(Math.max(y, 0), HEIGHT - 1);
  const offset = (clampedY * WIDTH + clampedX) * RGBA_CHANNELS;
  return (
    ((image[offset] ?? 0) * 0.2126 +
      (image[offset + 1] ?? 0) * 0.7152 +
      (image[offset + 2] ?? 0) * 0.0722) /
    255
  );
}

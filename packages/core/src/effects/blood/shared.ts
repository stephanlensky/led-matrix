import type { Color, RgbaImage } from "../../frame.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { hashSeed } from "../../random.ts";

export const BLOOD_COLOR = "#8a0303";
export const DRIED_COLOR: Color = [34, 5, 3];

const DRIP_HANG = 0.65;
const DRIP_STUB = 0.4;

export function getScaledColor([r, g, b]: Color, scale: number): Color {
  return [r * scale, g * scale, b * scale];
}

export function getMixedColor([r1, g1, b1]: Color, [r2, g2, b2]: Color, amount: number): Color {
  return [r1 + (r2 - r1) * amount, g1 + (g2 - g1) * amount, b1 + (b2 - b1) * amount];
}

export function getNoise(seed: number, ...values: readonly number[]): number {
  return hashSeed(seed, ...values) / 4_294_967_296;
}

export function getSmoothNoise(seed: number, x: number): number {
  const cell = Math.floor(x);
  const fraction = x - cell;
  const smooth = fraction * fraction * (3 - 2 * fraction);
  return getNoise(seed, cell) * (1 - smooth) + getNoise(seed, cell + 1) * smooth;
}

export function getSmoothNoise2d(seed: number, x: number, y: number): number {
  const cellY = Math.floor(y);
  const fraction = y - cellY;
  const smooth = fraction * fraction * (3 - 2 * fraction);
  return (
    getSmoothNoise(hashSeed(seed, cellY), x) * (1 - smooth) +
    getSmoothNoise(hashSeed(seed, cellY + 1), x) * smooth
  );
}

export function getCycle(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function getModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export type Drip = {
  x: number;
  top: number;
  width: number;
  length: number;
  cycle: number;
  trail: number;
  color: Color;
};

export function drawDrip(
  image: RgbaImage,
  { x, top, width, length, cycle, trail, color }: Drip,
): void {
  const isFalling = cycle > DRIP_HANG;
  const grow = isFalling ? DRIP_STUB : 1 - (1 - cycle / DRIP_HANG) ** 2;
  const current = Math.max(1, Math.round(grow * length));
  for (let y = 0; y < current; y++) {
    const shade = 0.8 - (y / length) * 0.3;
    for (let column = 0; column < width; column++) {
      setRgbaPixel(image, x + column, top + y, getScaledColor(color, shade));
    }
  }
  const tipY = top + current - 1;
  const isSwelling = !isFalling && cycle > DRIP_HANG * 0.6 && length >= 4;
  if (isSwelling) {
    setRgbaPixel(image, x - 1, tipY, getScaledColor(color, 0.45));
    setRgbaPixel(image, x + width, tipY, getScaledColor(color, 0.45));
    for (let column = 0; column < width; column++) {
      setRgbaPixel(image, x + column, tipY + 1, getScaledColor(color, 0.7));
    }
  }
  if (!isFalling) {
    return;
  }
  const fall = (cycle - DRIP_HANG) / (1 - DRIP_HANG);
  const releaseY = top + length;
  const dropY = Math.round(releaseY + fall ** 2 * (HEIGHT - releaseY + 4));
  for (let y = tipY + 1; y < dropY - 2; y++) {
    for (let column = 0; column < width; column++) {
      setRgbaPixel(image, x + column, y, getScaledColor(color, trail * 0.3));
    }
  }
  for (const [offset, shade] of [
    [-2, 0.45],
    [-1, 0.75],
    [0, 1],
  ] as const) {
    for (let column = 0; column < width; column++) {
      setRgbaPixel(image, x + column, dropY + offset, getScaledColor(color, shade));
    }
  }
}

export type Point = readonly [x: number, y: number];

export function getBallisticPosition(
  [x, y]: Point,
  [velocityX, velocityY]: Point,
  gravity: number,
  time: number,
): Point {
  return [x + velocityX * time, y + velocityY * time + 0.5 * gravity * time ** 2];
}

export function drawDot(image: RgbaImage, [x, y]: Point, size: number, color: Color): void {
  for (let offsetY = 0; offsetY < size; offsetY++) {
    for (let offsetX = 0; offsetX < size; offsetX++) {
      setRgbaPixel(image, Math.round(x) + offsetX, Math.round(y) + offsetY, color);
    }
  }
}

export function drawStreak(
  image: RgbaImage,
  [tailX, tailY]: Point,
  [headX, headY]: Point,
  color: Color,
): void {
  const samples = Math.max(1, Math.ceil(Math.hypot(headX - tailX, headY - tailY)));
  for (let sample = 0; sample <= samples; sample++) {
    const along = sample / samples;
    setRgbaPixel(
      image,
      Math.round(tailX + (headX - tailX) * along),
      Math.round(tailY + (headY - tailY) * along),
      getScaledColor(color, 0.35 + 0.65 * along),
    );
  }
}

export function fillImage(image: RgbaImage, color: Color): void {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      setRgbaPixel(image, x, y, color);
    }
  }
}

export function getEnvelope(beat: number, decay: number): number {
  return Math.exp(-getCycle(beat) * decay);
}

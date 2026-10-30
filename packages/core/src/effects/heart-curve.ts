import { type Color, HEIGHT, type RgbaImage, WIDTH, createRgbaImage } from "../frame.ts";
import { createRandom, hashSeed } from "../random.ts";
import { TAU } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { HEART_ASPECT, type Heart, drawHeart, getHeartCoverage } from "./heart.ts";

export type Point = readonly [x: number, y: number];

const RAW_STEPS = 2048;
const CURVE_STEPS = 720;
const SEED_LOOP_BEATS = 8;
const SEED_STEPS_PER_BEAT = 64;

function getRawPoint(t: number): Point {
  return [
    16 * Math.sin(t) ** 3,
    -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
  ];
}

function getCurve(): { points: Float32Array; length: number } {
  const raw = Array.from({ length: RAW_STEPS + 1 }, (_, index) =>
    getRawPoint((index / RAW_STEPS) * TAU),
  );
  const xs = raw.map(([x]) => x);
  const ys = raw.map(([, y]) => y);
  const width = Math.max(...xs) - Math.min(...xs);
  const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const centerY = (Math.max(...ys) + Math.min(...ys)) / 2;
  const distances = [0];
  for (let index = 1; index < raw.length; index++) {
    const [ax, ay] = raw[index - 1] ?? [0, 0];
    const [bx, by] = raw[index] ?? [0, 0];
    distances.push((distances[index - 1] ?? 0) + Math.hypot(bx - ax, by - ay));
  }
  const total = distances.at(-1) ?? 1;
  const points = new Float32Array(CURVE_STEPS * 2);
  let rawIndex = 0;
  for (let step = 0; step < CURVE_STEPS; step++) {
    const target = (step / CURVE_STEPS) * total;
    while ((distances[rawIndex + 1] ?? total) < target) {
      rawIndex++;
    }
    const start = distances[rawIndex] ?? 0;
    const span = (distances[rawIndex + 1] ?? total) - start || 1;
    const amount = (target - start) / span;
    const [ax, ay] = raw[rawIndex] ?? [0, 0];
    const [bx, by] = raw[rawIndex + 1] ?? [0, 0];
    points[step * 2] = (ax + (bx - ax) * amount - centerX) / width;
    points[step * 2 + 1] = (ay + (by - ay) * amount - centerY) / width;
  }
  return { points, length: total / width };
}

const curve = getCurve();

export const HEART_CURVE_LENGTH = curve.length;

export function getHeartPoint(position: number): Point {
  const scaled = getCycle(position) * CURVE_STEPS;
  const index = Math.floor(scaled);
  const next = (index + 1) % CURVE_STEPS;
  const amount = scaled - index;
  const ax = curve.points[index * 2] ?? 0;
  const ay = curve.points[index * 2 + 1] ?? 0;
  const bx = curve.points[next * 2] ?? 0;
  const by = curve.points[next * 2 + 1] ?? 0;
  return [ax + (bx - ax) * amount, ay + (by - ay) * amount];
}

export type Placement = { x: number; y: number; size: number; angle?: number };

export function getPlacedPoint([px, py]: Point, { x, y, size, angle = 0 }: Placement): Point {
  const [sin, cos] = [Math.sin(angle), Math.cos(angle)];
  return [x + (px * cos - py * sin) * size, y + (px * sin + py * cos) * size];
}

export function getHitSeed(seed: number, beat: number): number {
  const step = Math.round(getCycle(beat / SEED_LOOP_BEATS) * SEED_LOOP_BEATS * SEED_STEPS_PER_BEAT);
  return hashSeed(seed, step % (SEED_LOOP_BEATS * SEED_STEPS_PER_BEAT));
}

export function addPixel(
  image: RgbaImage,
  x: number,
  y: number,
  [r, g, b]: Color,
  amount: number,
): void {
  if (amount <= 0 || x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    return;
  }
  const offset = (y * WIDTH + x) * 4;
  image[offset] = (image[offset] ?? 0) + r * amount;
  image[offset + 1] = (image[offset + 1] ?? 0) + g * amount;
  image[offset + 2] = (image[offset + 2] ?? 0) + b * amount;
  image[offset + 3] = 255;
}

export function addDot(image: RgbaImage, x: number, y: number, color: Color, amount: number): void {
  if (amount <= 0) {
    return;
  }
  const left = Math.floor(x - 0.5);
  const top = Math.floor(y - 0.5);
  const fx = x - 0.5 - left;
  const fy = y - 0.5 - top;
  addPixel(image, left, top, color, amount * (1 - fx) * (1 - fy));
  addPixel(image, left + 1, top, color, amount * fx * (1 - fy));
  addPixel(image, left, top + 1, color, amount * (1 - fx) * fy);
  addPixel(image, left + 1, top + 1, color, amount * fx * fy);
}

export function addGlow(
  image: RgbaImage,
  x: number,
  y: number,
  color: Color,
  amount: number,
  radius: number,
): void {
  if (amount <= 0 || radius <= 0) {
    return;
  }
  for (let py = Math.floor(y - radius); py <= y + radius; py++) {
    for (let px = Math.floor(x - radius); px <= x + radius; px++) {
      const distance = Math.hypot(px + 0.5 - x, py + 0.5 - y) / radius;
      if (distance < 1) {
        addPixel(image, px, py, color, amount * (1 - distance) ** 2);
      }
    }
  }
}

export function addLine(
  image: RgbaImage,
  [ax, ay]: Point,
  [bx, by]: Point,
  color: Color,
  amount: number,
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    addDot(image, ax + (bx - ax) * t, ay + (by - ay) * t, color, amount * 0.5);
  }
}

export type Outline = Placement & {
  color: Color;
  amount?: number;
  width?: number;
  getAmount?: (position: number) => number;
};

export function addHeartOutline(
  image: RgbaImage,
  { color, amount = 1, width = 1, getAmount = () => 1, ...placement }: Outline,
): void {
  if (amount <= 0 || placement.size <= 0) {
    return;
  }
  for (let ring = 0; ring < width; ring++) {
    const ringPlacement = { ...placement, size: placement.size - ring * 2 };
    const steps = Math.ceil(HEART_CURVE_LENGTH * ringPlacement.size * 2);
    for (let step = 0; step < steps; step++) {
      const position = step / steps;
      const level = amount * getAmount(position) * 0.5;
      if (level > 0) {
        const [x, y] = getPlacedPoint(getHeartPoint(position), ringPlacement);
        addDot(image, x, y, color, level);
      }
    }
  }
}

const scratch = createRgbaImage();

export function addHeart(image: RgbaImage, heart: Heart): void {
  scratch.fill(0);
  drawHeart(scratch, heart);
  for (let offset = 0; offset < scratch.length; offset += 4) {
    const alpha = (scratch[offset + 3] ?? 0) / 255;
    if (alpha > 0) {
      image[offset] = (image[offset] ?? 0) + (scratch[offset] ?? 0) * alpha;
      image[offset + 1] = (image[offset + 1] ?? 0) + (scratch[offset + 1] ?? 0) * alpha;
      image[offset + 2] = (image[offset + 2] ?? 0) + (scratch[offset + 2] ?? 0) * alpha;
      image[offset + 3] = 255;
    }
  }
}

export function getHeartMask(mask: Float32Array, heart: Omit<Heart, "color">): Float32Array {
  scratch.fill(0);
  drawHeart(scratch, { ...heart, color: [255, 255, 255] });
  for (let pixel = 0; pixel < mask.length; pixel++) {
    mask[pixel] = (scratch[pixel * 4 + 3] ?? 0) / 255;
  }
  return mask;
}

export function sampleMask(mask: Float32Array, x: number, y: number): number {
  const left = Math.floor(x - 0.5);
  const top = Math.floor(y - 0.5);
  const fx = x - 0.5 - left;
  const fy = y - 0.5 - top;
  const get = (px: number, py: number): number =>
    px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT ? 0 : (mask[py * WIDTH + px] ?? 0);
  return (
    get(left, top) * (1 - fx) * (1 - fy) +
    get(left + 1, top) * fx * (1 - fy) +
    get(left, top + 1) * (1 - fx) * fy +
    get(left + 1, top + 1) * fx * fy
  );
}

const homeCache = new Map<number, readonly Point[]>();

const EDGE_GROWTH = 1.1;

function isOnEdge(u: number, v: number): boolean {
  return getHeartCoverage(0.5 + (u - 0.5) * EDGE_GROWTH, 0.5 + (v - 0.5) * EDGE_GROWTH) === 0;
}

export function getHeartHomes(count: number, seed: number, edge = 0): readonly Point[] {
  const key = hashSeed(seed, count, Math.round(edge * 100));
  const cached = homeCache.get(key);
  if (cached) {
    return cached;
  }
  const random = createRandom(key);
  const homes: Point[] = [];
  const edgeCount = Math.round(count * edge);
  while (homes.length < count) {
    const [u, v] = [random(), random()];
    const isEdgeHome = homes.length < edgeCount;
    if (getHeartCoverage(u, v) > 0 && (!isEdgeHome || isOnEdge(u, v))) {
      homes.push([u - 0.5, (v - 0.5) * HEART_ASPECT]);
    }
  }
  homeCache.set(key, homes);
  return homes;
}

export function addSprite(
  image: RgbaImage,
  sprite: readonly string[],
  [x, y]: Point,
  color: Color,
  amount: number,
): void {
  const left = Math.round(x - (sprite[0]?.length ?? 0) / 2);
  const top = Math.round(y - sprite.length / 2);
  for (const [row, line] of sprite.entries()) {
    for (let column = 0; column < line.length; column++) {
      if (line[column] === "#") {
        addPixel(image, left + column, top + row, color, amount);
      }
    }
  }
}

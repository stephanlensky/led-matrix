import { z } from "zod";
import { parseColor } from "../../color.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../../frame.ts";
import { easings } from "../../keyframes.ts";
import { type Random, createRandom, hashSeed } from "../../random.ts";
import { TAU, clamp } from "../cat-duo.ts";
import { getCycle } from "../cat-dance.ts";
import { mix } from "../cat-model.ts";

export { TAU, clamp, getCycle, mix };

export type Ink = Float32Array;

export type Point = readonly [x: number, y: number];

export const paperSchema = z
  .string()
  .regex(/^(none|#[0-9a-f]{6})$/i, "Expected a #rrggbb color or none")
  .meta({ format: "color" });

export const speedSchema = z.number().min(0.25).max(4).default(1);

export function createInk(): Ink {
  return new Float32Array(WIDTH * HEIGHT);
}

export function addInk(ink: Ink, x: number, y: number, amount = 1): void {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT || amount <= 0) {
    return;
  }
  const index = py * WIDTH + px;
  ink[index] = Math.max(ink[index] ?? 0, Math.min(1, amount));
}

export function addInkLine(ink: Ink, [ax, ay]: Point, [bx, by]: Point, amount = 1): void {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    addInk(ink, ax + (bx - ax) * t, ay + (by - ay) * t, amount);
  }
}

export function addInkPath(ink: Ink, points: readonly Point[], amount = 1): void {
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    if (from && to) {
      addInkLine(ink, from, to, amount);
    }
  }
}

export function addInkDot(ink: Ink, [x, y]: Point, radius: number, amount = 1): void {
  const reach = Math.ceil(radius);
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const distance = Math.hypot(dx, dy);
      if (distance <= radius + 0.25) {
        addInk(ink, x + dx, y + dy, amount * clamp(1.25 - distance / (radius + 0.5)));
      }
    }
  }
}

export function setPixel(image: RgbaImage, x: number, y: number, color: Color): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    return;
  }
  const offset = (Math.floor(y) * WIDTH + Math.floor(x)) * 4;
  image[offset] = color[0];
  image[offset + 1] = color[1];
  image[offset + 2] = color[2];
  image[offset + 3] = 255;
}

export function getPixel(image: RgbaImage, x: number, y: number): Color {
  const offset = (y * WIDTH + x) * 4;
  return [image[offset] ?? 0, image[offset + 1] ?? 0, image[offset + 2] ?? 0];
}

export function addLight(image: RgbaImage, x: number, y: number, color: Color, amount = 1): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || amount <= 0) {
    return;
  }
  const offset = (Math.floor(y) * WIDTH + Math.floor(x)) * 4;
  const weight = Math.min(1, amount);
  for (let channel = 0; channel < 3; channel++) {
    image[offset + channel] = (image[offset + channel] ?? 0) + (color[channel] ?? 0) * weight;
  }
  image[offset + 3] = 255;
}

export function drawInk(image: RgbaImage, ink: Ink, inkColor: string, paper: string): void {
  const color = parseColor(inkColor);
  const background = paper === "none" ? undefined : parseColor(paper);
  for (let index = 0; index < ink.length; index++) {
    const amount = ink[index] ?? 0;
    if (amount <= 0 && !background) {
      continue;
    }
    const pixel = background ? mix(background, color, amount) : color;
    const offset = index * 4;
    image[offset] = pixel[0] ?? 0;
    image[offset + 1] = pixel[1] ?? 0;
    image[offset + 2] = pixel[2] ?? 0;
    image[offset + 3] = background ? 255 : 255 * amount;
  }
}

export function blendInk(image: RgbaImage, ink: Ink, color: Color): void {
  for (let index = 0; index < ink.length; index++) {
    const amount = ink[index] ?? 0;
    if (amount <= 0) {
      continue;
    }
    const offset = index * 4;
    const alpha = (image[offset + 3] ?? 0) / 255;
    for (let channel = 0; channel < 3; channel++) {
      const below = (image[offset + channel] ?? 0) * alpha;
      image[offset + channel] = below + ((color[channel] ?? 0) - below) * amount;
    }
    image[offset + 3] = 255;
  }
}

export function getDrivenBeat(beat: number, drive: number): number {
  const whole = Math.floor(beat);
  const phase = beat - whole;
  return whole + phase + drive * (easings.easeOutCubic(phase) - phase);
}

export type Scribble = { x: Harmonic[]; y: Harmonic[]; centerX: number; centerY: number };

type Harmonic = { frequency: number; amplitude: number; phase: number };

function getHarmonics(random: Random, count: number, reach: number): Harmonic[] {
  const harmonics = Array.from({ length: count }, (_, index) => ({
    frequency: 2 + index * 2 + Math.floor(random() * 3),
    amplitude: (0.4 + random()) / (index + 1) ** 0.55,
    phase: random() * TAU,
  }));
  const total = harmonics.reduce((sum, harmonic) => sum + harmonic.amplitude, 0);
  for (const harmonic of harmonics) {
    harmonic.amplitude = (harmonic.amplitude / total) * reach;
  }
  return harmonics;
}

export function createScribble(
  seed: number,
  box: { x: number; y: number; width: number; height: number },
  complexity: number,
): Scribble {
  const random = createRandom(hashSeed(seed));
  return {
    centerX: box.x + box.width / 2,
    centerY: box.y + box.height / 2,
    x: getHarmonics(random, complexity, (box.width / 2) * 1.6),
    y: getHarmonics(random, complexity, (box.height / 2) * 1.6),
  };
}

function getHarmonicSum(harmonics: readonly Harmonic[], turn: number): number {
  let sum = 0;
  for (const { frequency, amplitude, phase } of harmonics) {
    sum += amplitude * Math.sin(frequency * turn * TAU + phase);
  }
  return sum;
}

export function getScribblePoint(scribble: Scribble, turn: number): Point {
  return [
    scribble.centerX + getHarmonicSum(scribble.x, turn),
    scribble.centerY + getHarmonicSum(scribble.y, turn),
  ];
}

export function getScribblePoints(
  scribble: Scribble,
  from: number,
  to: number,
  step: number,
  jitter = 0,
  seed = 0,
): Point[] {
  const points: Point[] = [];
  const first = Math.ceil(from / step);
  const last = Math.floor(to / step);
  const getPoint = (turn: number, index: number): Point => {
    const [x, y] = getScribblePoint(scribble, turn);
    if (jitter <= 0) {
      return [x, y];
    }
    const random = createRandom(hashSeed(seed, index));
    return [x + (random() - 0.5) * 2 * jitter, y + (random() - 0.5) * 2 * jitter];
  };
  points.push(getScribblePoint(scribble, from));
  for (let index = first; index <= last; index++) {
    points.push(getPoint(index * step, index));
  }
  points.push(getScribblePoint(scribble, to));
  return points;
}

export function getNoise(x: number, y: number, seed: number, periodX = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const getLattice = (lx: number, ly: number) => {
    const wrapped = periodX > 0 ? ((lx % periodX) + periodX) % periodX : lx;
    return createRandom(hashSeed(seed, wrapped, ly))();
  };
  const top = getLattice(x0, y0) + (getLattice(x0 + 1, y0) - getLattice(x0, y0)) * sx;
  const bottom =
    getLattice(x0, y0 + 1) + (getLattice(x0 + 1, y0 + 1) - getLattice(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

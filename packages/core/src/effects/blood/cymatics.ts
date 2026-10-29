import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  type Point,
  drawDot,
  getEnvelope,
  getMixedColor,
  getModulo,
  getScaledColor,
} from "./shared.ts";

const DROPLET_SEED = 0xb11d0;
const MORPH = 0.5;
const JUMP = 0.5;
const PATTERNS: readonly (readonly [n: number, m: number])[] = [
  [2, 5],
  [3, 7],
  [1, 6],
  [4, 7],
  [2, 7],
  [5, 8],
  [3, 6],
  [1, 8],
];

function getPatternValue([n, m]: readonly [number, number], x: number, y: number): number {
  const u = ((x + 0.5) / WIDTH) * Math.PI;
  const v = ((y + 0.5) / HEIGHT) * Math.PI;
  return (Math.cos(n * u) * Math.cos(m * v) - Math.cos(m * u) * Math.cos(n * v)) / 2;
}

const antinodeCache = new Map<number, readonly Point[]>();

function getAntinodes(index: number): readonly Point[] {
  const cached = antinodeCache.get(index);
  if (cached) {
    return cached;
  }
  const pattern = PATTERNS[index] ?? [2, 5];
  const points: Point[] = [];
  for (let y = 2; y < HEIGHT - 2; y += 2) {
    for (let x = 2; x < WIDTH - 2; x += 2) {
      if (Math.abs(getPatternValue(pattern, x, y)) > 0.8) {
        points.push([x, y]);
      }
    }
  }
  antinodeCache.set(index, points);
  return points;
}

export const bloodCymatics = defineEffect({
  id: "blood-cymatics",
  name: "Blood cymatics",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    barBeats: z.number().min(1).max(16).default(4),
    droplets: z.number().int().min(0).max(32).default(10),
    period: z.number().int().min(1).max(256).default(32),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const bar = Math.floor(beat / params.barBeats);
    const barsPerPeriod = Math.max(1, Math.round(params.period / params.barBeats));
    const current = getModulo(bar, barsPerPeriod) % PATTERNS.length;
    const previous = getModulo(bar - 1, barsPerPeriod) % PATTERNS.length;
    const sinceBar = beat - bar * params.barBeats;
    const morph = Math.min(1, sinceBar / MORPH);
    const blend = morph * morph * (3 - 2 * morph);
    const kick = getEnvelope(beat, 4);
    const vibration = Math.cos(beat * Math.PI * 4);
    const currentPattern = PATTERNS[current] ?? [2, 5];
    const previousPattern = PATTERNS[previous] ?? [2, 5];

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const value =
          getPatternValue(previousPattern, x, y) * (1 - blend) +
          getPatternValue(currentPattern, x, y) * blend;
        const amplitude = Math.abs(value);
        let shade = 0.3 + amplitude * (0.55 + 0.35 * kick) + 0.12 * value * vibration * kick;
        if (amplitude < 0.05) {
          shade = 0.12;
        }
        const base = getMixedColor(DRIED_COLOR, color, Math.min(1, amplitude * 1.6));
        setRgbaPixel(image, x, y, getScaledColor(base, shade));
      }
    }

    const sinceBeat = beat - Math.floor(beat);
    if (sinceBeat >= JUMP) {
      return;
    }
    const antinodes = getAntinodes(current);
    const random = createRandom(hashSeed(DROPLET_SEED, getModulo(Math.floor(beat), params.period)));
    const height = Math.sin((Math.PI * sinceBeat) / JUMP);
    for (let index = 0; index < params.droplets && antinodes.length > 0; index++) {
      const [x, y] = antinodes[Math.floor(random() * antinodes.length)] ?? [0, 0];
      const size = height > 0.4 ? 3 : 2;
      const top: Point = [x - size / 2 - height, y - size / 2 - height * 5];
      drawDot(image, [x, y], 2, [0, 0, 0]);
      drawDot(image, top, size, getScaledColor(color, 1.6 + height));
      drawDot(image, top, 1, getMixedColor(getScaledColor(color, 2), [255, 255, 255], 0.3));
    }
  },
});

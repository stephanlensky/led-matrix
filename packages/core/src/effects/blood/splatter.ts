import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { type Color, type RgbaImage, HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { type Random, createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  getMixedColor,
  getModulo,
  getNoise,
  getScaledColor,
} from "./shared.ts";

const SPLATTER_SEED = 0xb1020;
const TEXTURE_SEED = 0xb1021;
const IMPACT_SPEED = 14;
const RUN_DELAY = 0.2;

export const splatterOrigins = ["random", "center"] as const;

export type Splat = {
  x: number;
  y: number;
  radius: number;
  growth: number;
  age: number;
  runs: number;
  runSpeed: number;
  color: Color;
};

function getEdgeRadius(random: Random): (angle: number) => number {
  const harmonics = [3, 5, 8].map((frequency, index) => ({
    frequency,
    amount: [0.22, 0.14, 0.08][index] ?? 0,
    phase: random() * Math.PI * 2,
  }));
  return (angle) =>
    1 +
    harmonics.reduce(
      (sum, { frequency, amount, phase }) => sum + amount * Math.sin(frequency * angle + phase),
      0,
    );
}

function drawRun(image: RgbaImage, x: number, top: number, length: number, color: Color): void {
  const end = Math.round(length);
  for (let y = 0; y <= end; y++) {
    setRgbaPixel(image, x, top + y, getScaledColor(color, 0.8 - (y / Math.max(1, end)) * 0.25));
  }
  if (end >= 2) {
    setRgbaPixel(image, x, top + end + 1, getScaledColor(color, 0.6));
  }
}

export function drawSplat(
  image: RgbaImage,
  random: Random,
  { x, y, radius, growth, age, runs, runSpeed, color }: Splat,
): void {
  const getEdge = getEdgeRadius(random);
  const current = radius * growth;
  const reach = Math.ceil(current * 1.5) + 1;
  for (let offsetY = -reach; offsetY <= reach; offsetY++) {
    for (let offsetX = -reach; offsetX <= reach; offsetX++) {
      const distance = Math.hypot(offsetX, offsetY);
      const edge = current * getEdge(Math.atan2(offsetY, offsetX));
      if (distance > edge) {
        continue;
      }
      const pixelX = Math.round(x) + offsetX;
      const pixelY = Math.round(y) + offsetY;
      const isRim = edge - distance < 1;
      const shade =
        (isRim ? 0.55 : 0.7) +
        0.3 * getNoise(TEXTURE_SEED, pixelX, pixelY) -
        (distance / edge) * 0.1;
      setRgbaPixel(image, pixelX, pixelY, getScaledColor(color, shade));
    }
  }
  const runAge = Math.max(0, age - RUN_DELAY);
  for (let index = 0; index < runs; index++) {
    const offsetX = Math.round(getRandomBetween(random, -0.7, 0.7) * current);
    const maxLength = getRandomBetween(random, 4, 22);
    const length = Math.min(maxLength, runAge * runSpeed * getRandomBetween(random, 0.5, 1.2));
    let bottom = 0;
    while (Math.hypot(offsetX, bottom) <= current * getEdge(Math.atan2(bottom, offsetX))) {
      bottom++;
    }
    if (length > 0.5 && bottom > 0) {
      drawRun(image, Math.round(x) + offsetX, Math.round(y) + bottom, length, color);
    }
  }
}

export const bloodSplatter = defineEffect({
  id: "blood-splatter",
  name: "Blood splatter",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    every: z.number().min(0.25).max(16).default(1),
    period: z.number().int().min(1).max(256).default(8),
    fade: z.number().min(0.5).max(32).default(4),
    size: z.number().min(1).max(16).default(8),
    droplets: z.number().int().min(0).max(64).default(32),
    runs: z.number().min(0).max(1).default(0.4),
    origin: z.enum(splatterOrigins).default("random"),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const burstsPerPeriod = Math.max(1, Math.round(params.period / params.every));
    const first = Math.floor((beat - params.fade) / params.every) + 1;
    const last = Math.floor(beat / params.every);
    for (let burst = first; burst <= last; burst++) {
      const age = beat - burst * params.every;
      const random = createRandom(hashSeed(SPLATTER_SEED, getModulo(burst, burstsPerPeriod)));
      const isCenter = params.origin === "center";
      const x = isCenter
        ? WIDTH / 2 + getRandomBetween(random, -5, 5)
        : getRandomBetween(random, 8, WIDTH - 8);
      const y = isCenter
        ? HEIGHT / 2 + getRandomBetween(random, -5, 5)
        : getRandomBetween(random, 6, HEIGHT - 14);
      const dryness = age / params.fade;
      const visibility = dryness > 0.7 ? 1 - (dryness - 0.7) / 0.3 : 1;
      const flash = age < 0.15 ? 1.3 - age * 2 : 1;
      const burstColor = getScaledColor(
        getMixedColor(color, DRIED_COLOR, Math.min(1, dryness * 1.2) ** 0.8),
        visibility * flash,
      );
      const growth = 1 - Math.exp(-age * IMPACT_SPEED);
      const radius = params.size * getRandomBetween(random, 0.7, 1.3);

      for (let index = 0; index < params.droplets; index++) {
        const angle = random() * Math.PI * 2;
        const distance = radius * getRandomBetween(random, 1.1, 3.6) * growth;
        const hasStreak = random() < 0.55;
        const headSize = random() < 0.3 ? 2 : 1;
        const isRunning = random() < params.runs * 0.5;
        const runLength = Math.min(
          getRandomBetween(random, 3, 14),
          Math.max(0, age - RUN_DELAY) * getRandomBetween(random, 3, 7),
        );
        const headX = x + Math.cos(angle) * distance;
        const headY = y + Math.sin(angle) * distance;
        if (hasStreak) {
          const start = radius * 0.8;
          for (let along = start; along < distance; along += 0.7) {
            const fade = 0.35 + 0.35 * ((along - start) / Math.max(1, distance - start));
            setRgbaPixel(
              image,
              Math.round(x + Math.cos(angle) * along),
              Math.round(y + Math.sin(angle) * along),
              getScaledColor(burstColor, fade),
            );
          }
        }
        for (let offsetY = 0; offsetY < headSize; offsetY++) {
          for (let offsetX = 0; offsetX < headSize; offsetX++) {
            setRgbaPixel(
              image,
              Math.round(headX) + offsetX,
              Math.round(headY) + offsetY,
              getScaledColor(burstColor, 0.85),
            );
          }
        }
        if (isRunning && runLength > 0.5) {
          drawRun(image, Math.round(headX), Math.round(headY) + headSize, runLength, burstColor);
        }
      }

      drawSplat(image, random, {
        x,
        y,
        radius,
        growth,
        age,
        runs: Math.round(params.runs * 6),
        runSpeed: 5,
        color: burstColor,
      });
    }
  },
});

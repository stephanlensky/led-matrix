import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import type { Color, RgbaImage } from "../../frame.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  type Point,
  getBuildTimes,
  getMixedColor,
  getModulo,
  getScaledColor,
  getSegmentDistance,
} from "./shared.ts";

const SLASH_SEED = 0xb1140;
const WHITE: Color = [255, 240, 235];
const CUT = 0.06;
const OPEN = 0.5;

const directions = ["diagonal", "down", "horizontal", "cross"] as const;

function getAngle(direction: (typeof directions)[number], index: number, random: () => number) {
  const sign = random() < 0.5 ? -1 : 1;
  switch (direction) {
    case "down":
      return getRandomBetween(random, 0.55, 0.95);
    case "horizontal":
      return getRandomBetween(random, -0.18, 0.18);
    case "cross":
      return (getModulo(index, 2) === 0 ? 1 : -1) * getRandomBetween(random, 0.6, 0.9);
    default:
      return sign * getRandomBetween(random, 0.45, 1);
  }
}

function drawSlash(
  image: RgbaImage,
  {
    start,
    end,
    age,
    life,
    width,
    color,
    seed,
  }: {
    start: Point;
    end: Point;
    age: number;
    life: number;
    width: number;
    color: Color;
    seed: number;
  },
): void {
  const cut = Math.min(1, age / CUT);
  const open = age < CUT ? 0 : 1 - (1 - Math.min(1, (age - CUT) / (OPEN - CUT))) ** 2;
  const whiteness = Math.max(0, 1 - age / 0.3);
  const fade = Math.min(1, Math.max(0, (life - age) / (life * 0.4)));
  const dryness = Math.min(1, age / life);
  const base = getMixedColor(color, DRIED_COLOR, dryness * 0.5);
  const reach = width + 2;
  const minX = Math.max(0, Math.floor(Math.min(start[0], end[0]) - reach));
  const maxX = Math.min(WIDTH - 1, Math.ceil(Math.max(start[0], end[0]) + reach));
  const minY = Math.max(0, Math.floor(Math.min(start[1], end[1]) - reach));
  const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(start[1], end[1]) + reach));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const { distance, along } = getSegmentDistance([x, y], start, end);
      if (along > cut) {
        continue;
      }
      const profile = Math.sin(Math.PI * along) ** 0.6;
      const halfWidth = (0.6 + open * width * profile) / 2;
      if (distance > halfWidth) {
        continue;
      }
      const inner = distance / halfWidth;
      const wound = getScaledColor(base, inner < 0.45 ? 1.3 : 0.6);
      setRgbaPixel(image, x, y, getScaledColor(getMixedColor(wound, WHITE, whiteness), fade));
    }
  }
  if (open <= 0) {
    return;
  }
  const random = createRandom(hashSeed(SLASH_SEED, seed, 7));
  const drips = Math.round(getRandomBetween(random, 2, 5));
  for (let index = 0; index < drips; index++) {
    const along = getRandomBetween(random, 0.2, 0.8);
    const profile = Math.sin(Math.PI * along) ** 0.6;
    const x = Math.round(start[0] + (end[0] - start[0]) * along);
    const y = start[1] + (end[1] - start[1]) * along + (width * profile) / 2;
    const length = Math.min(18, (age - CUT) * getRandomBetween(random, 2, 6));
    for (let offset = 0; offset < length; offset++) {
      setRgbaPixel(
        image,
        x,
        Math.round(y + offset),
        getScaledColor(base, fade * (0.9 - (offset / 18) * 0.4)),
      );
    }
  }
}

export const bloodSlash = defineEffect({
  id: "blood-slash",
  name: "Knife slashes",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    every: z.number().min(0.25).max(8).default(1),
    buildBeats: z.number().min(0).max(256).default(0),
    direction: z.enum(directions).default("diagonal"),
    width: z.number().min(1).max(8).default(4),
    life: z.number().min(1).max(32).default(6),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const slashes: { index: number; seed: number; age: number }[] = [];
    if (params.buildBeats > 0) {
      for (const [index, time] of getBuildTimes(params.buildBeats).entries()) {
        if (time <= beat && beat - time < params.life) {
          slashes.push({ index, seed: index, age: beat - time });
        }
      }
    } else {
      const perPeriod = Math.max(1, Math.round(params.period / params.every));
      const last = Math.floor(beat / params.every);
      for (let index = last - Math.ceil(params.life / params.every); index <= last; index++) {
        const age = beat - index * params.every;
        if (age >= 0 && age < params.life) {
          slashes.push({ index, seed: getModulo(index, perPeriod) + 1000, age });
        }
      }
    }
    for (const { index, seed, age } of slashes) {
      const random = createRandom(hashSeed(SLASH_SEED, seed));
      const angle = getAngle(params.direction, index, random);
      const center: Point = [getRandomBetween(random, 18, 46), getRandomBetween(random, 16, 44)];
      const half = getRandomBetween(random, 18, 30);
      const flip = random() < 0.5 ? -1 : 1;
      const deltaX = Math.cos(angle) * half * flip;
      const deltaY = Math.sin(angle) * half * flip;
      drawSlash(image, {
        start: [center[0] - deltaX, center[1] - deltaY],
        end: [center[0] + deltaX, center[1] + deltaY],
        age,
        life: params.life,
        width: params.width * getRandomBetween(random, 0.7, 1.2),
        color,
        seed,
      });
    }
  },
});

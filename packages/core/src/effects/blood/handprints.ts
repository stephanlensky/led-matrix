import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import type { RgbaImage } from "../../frame.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  type Point,
  drawDot,
  getBuildTimes,
  getEnvelope,
  getMixedColor,
  getModulo,
  getNoise,
  getScaledColor,
  getSegmentDistance,
} from "./shared.ts";

const PRINT_SEED = 0xb1120;
const TEXTURE_SEED = 0xb1121;
const LIFE = 12;
const FLASH = 0.3;

const FINGERS: readonly (readonly [base: Point, tip: Point])[] = [
  [
    [-3, -1],
    [-4.6, -7],
  ],
  [
    [-1, -1.5],
    [-1.4, -9],
  ],
  [
    [1, -1.5],
    [1.4, -8.6],
  ],
  [
    [3, -1],
    [4.4, -6.2],
  ],
  [
    [-3.6, 3.4],
    [-8, 0],
  ],
];

function isInsideHand(x: number, y: number): boolean {
  if ((x / 4.4) ** 2 + ((y - 2.6) / 5) ** 2 <= 1) {
    return true;
  }
  return FINGERS.some(([base, tip]) => getSegmentDistance([x, y], base, tip).distance <= 1.3);
}

type Print = {
  pixels: readonly Point[];
  outline: ReadonlySet<string>;
  bottoms: readonly Point[];
  x: number;
  y: number;
};

const printCache = new Map<number, Print>();

function getPrint(seed: number): Print {
  const cached = printCache.get(seed);
  if (cached) {
    return cached;
  }
  const random = createRandom(hashSeed(PRINT_SEED, seed));
  const angle = getRandomBetween(random, -0.6, 0.6);
  const scale = getRandomBetween(random, 1.2, 1.5);
  const mirror = random() < 0.5 ? -1 : 1;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const pixels: Point[] = [];
  const lowest = new Map<number, number>();
  for (let y = -18; y <= 18; y++) {
    for (let x = -18; x <= 18; x++) {
      const localX = ((x * cos + y * sin) / scale) * mirror;
      const localY = (-x * sin + y * cos) / scale;
      if (isInsideHand(localX, localY)) {
        pixels.push([x, y]);
        lowest.set(x, Math.max(lowest.get(x) ?? -99, y));
      }
    }
  }
  const keys = new Set(pixels.map(([x, y]) => `${x},${y}`));
  const outline = new Set(
    pixels
      .filter(([x, y]) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([offsetX = 0, offsetY = 0]) => !keys.has(`${x + offsetX},${y + offsetY}`)),
      )
      .map(([x, y]) => `${x},${y}`),
  );
  const bottoms = [...lowest.entries()]
    .filter(() => random() < 0.3)
    .map(([x, y]) => [x, y] as Point);
  const print = {
    pixels,
    outline,
    bottoms,
    x: getRandomBetween(random, 12, WIDTH - 12),
    y: getRandomBetween(random, 14, HEIGHT - 16),
  };
  printCache.set(seed, print);
  return print;
}

function drawPrint(
  image: RgbaImage,
  print: Print,
  seed: number,
  age: number,
  color: readonly [number, number, number],
  pulse: number,
): void {
  const flash = age < FLASH ? 1 - age / FLASH : 0;
  const dryness = Math.min(1, age / LIFE);
  const base = getMixedColor(color, DRIED_COLOR, dryness * 0.6);
  const shade = (1 - dryness * 0.3 + flash * 0.9) * (1 + pulse);
  const centerX = Math.round(print.x);
  const centerY = Math.round(print.y);
  for (const [x, y] of print.bottoms) {
    const random = createRandom(hashSeed(PRINT_SEED, seed, x));
    const length = Math.min(12, age * getRandomBetween(random, 0.6, 1.8));
    for (let offset = 1; offset <= length; offset++) {
      setRgbaPixel(
        image,
        centerX + x,
        centerY + y + offset,
        getScaledColor(base, shade * (0.8 - (offset / 12) * 0.4)),
      );
    }
  }
  for (const [x, y] of print.pixels) {
    const noise = getNoise(TEXTURE_SEED, seed, x, y);
    if (noise > 0.94 && flash === 0) {
      continue;
    }
    setRgbaPixel(
      image,
      centerX + x,
      centerY + y,
      getScaledColor(
        base,
        shade * (print.outline.has(`${x},${y}`) ? 0.45 : 1) * (0.7 + 0.3 * noise),
      ),
    );
  }
  if (flash > 0) {
    const random = createRandom(hashSeed(PRINT_SEED, seed, 999));
    for (let index = 0; index < 10; index++) {
      const angle = random() * Math.PI * 2;
      const distance = getRandomBetween(random, 10, 16) * (1.2 - flash * 0.4);
      drawDot(
        image,
        [centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance],
        1,
        getScaledColor(color, flash * 1.4),
      );
    }
  }
}

export const bloodHandprints = defineEffect({
  id: "blood-handprints",
  name: "Bloody handprints",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    buildBeats: z.number().min(0).max(256).default(0),
    hold: z.boolean().default(false),
    every: z.number().min(0.25).max(8).default(1),
    pulse: z.number().min(0).max(1).default(0.25),
    period: z.number().int().min(1).max(256).default(16),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    if (params.buildBeats > 0) {
      const times = getBuildTimes(params.buildBeats, [8, 4, 2, 1]);
      const now = params.hold ? params.buildBeats + LIFE : beat;
      const pulse = params.hold ? params.pulse * getEnvelope(beat, 5) : 0;
      for (const [index, time] of times.entries()) {
        if (time <= now) {
          drawPrint(image, getPrint(index), index, now - time, color, pulse);
        }
      }
      return;
    }
    const printsPerPeriod = Math.max(1, Math.round(params.period / params.every));
    const last = Math.floor(beat / params.every);
    const first = last - Math.ceil(LIFE / params.every) + 1;
    for (let index = first; index <= last; index++) {
      const age = beat - index * params.every;
      const seed = getModulo(index, printsPerPeriod);
      const fade = Math.max(0, 1 - age / LIFE);
      drawPrint(image, getPrint(seed + 1000), seed, age, getScaledColor(color, fade), 0);
    }
  },
});

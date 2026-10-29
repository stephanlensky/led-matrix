import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../../frame.ts";
import { easings } from "../../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import { scale } from "../cat-model.ts";
import { type Point, TAU, clamp, getCycle, getNoise, mix, setPixel } from "./shared.ts";

const BLADE_SEED = 0x6a55;
const FLOWER_SEED = 0xf10e;
const TEXTURE_SEED = 0x7e47;

export type Wind = { beat: number; strength: number; gust: number; every: number };

export const meadowParams = {
  grassTop: colorSchema.default("#8cf03c"),
  grassBottom: colorSchema.default("#169a0c"),
  flowerColor: colorSchema.default("#ffe600"),
  flowers: z.boolean().default(true),
  wind: z.number().min(0).max(1.5).default(0.6),
  gust: z.number().min(0).max(1.5).default(0.8),
  every: z.number().min(0.5).max(4).default(1),
};

type MeadowParams = { [K in keyof typeof meadowParams]: z.output<(typeof meadowParams)[K]> };

export function getLean(wind: Wind, x: number, y: number): number {
  const sway = Math.sin(x * 0.11 + y * 0.04 - (wind.beat / 4) * TAU) * 0.5 + 0.5;
  const pulse = wind.beat / wind.every;
  const phase = getCycle(pulse);
  const front = -16 + easings.easeOutQuad(phase) * (WIDTH + 32);
  const gust = Math.exp(-(((x - front) / 9) ** 2)) * (1 - phase * 0.6);
  return wind.strength * (0.25 + 0.75 * sway) + wind.gust * gust * 1.4;
}

function getGrassColor(params: MeadowParams, horizon: number, y: number): Color {
  const t = clamp((y - horizon) / (HEIGHT - horizon));
  return mix(parseColor(params.grassTop), parseColor(params.grassBottom), t ** 0.8);
}

function drawField(image: RgbaImage, params: MeadowParams, horizon: number, wind: Wind): void {
  for (let y = Math.floor(horizon); y < HEIGHT; y++) {
    const depth = clamp((y - horizon) / (HEIGHT - horizon));
    const base = getGrassColor(params, horizon, y);
    for (let x = 0; x < WIDTH; x++) {
      const lean = getLean(wind, x, y);
      const streak = getNoise(
        (x - (y - horizon) * lean * 0.6) * (0.9 - depth * 0.5),
        y * 0.35,
        TEXTURE_SEED,
      );
      setPixel(image, x, y, scale(base, 0.7 + 0.55 * streak));
    }
  }
}

function drawBlades(
  image: RgbaImage,
  params: MeadowParams,
  horizon: number,
  wind: Wind,
  count: number,
): void {
  const seeds = Array.from({ length: count }, (_, blade) => {
    const random = createRandom(hashSeed(BLADE_SEED, blade));
    return { random, depth: random() ** 1.6 };
  }).toSorted((a, b) => a.depth - b.depth);
  for (const { random, depth } of seeds) {
    const baseY = horizon + 1 + depth * (HEIGHT - horizon);
    const baseX = getRandomBetween(random, -4, WIDTH + 4);
    const height = (2 + random() * 3) * (1 + depth * 2.2);
    const lean = getLean(wind, baseX, baseY) * (0.6 + random() * 0.5);
    const tip: Point = [baseX + lean * height * 0.55, baseY - height];
    const color = mix(
      getGrassColor(params, horizon, baseY),
      parseColor(params.grassTop),
      0.35 + random() * 0.5,
    );
    const steps = Math.ceil(height * 2);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const bend = t * t;
      setPixel(
        image,
        baseX + (tip[0] - baseX) * bend,
        baseY + (tip[1] - baseY) * t,
        scale(color, 0.8 + 0.35 * t),
      );
    }
  }
}

function drawFlowers(image: RgbaImage, params: MeadowParams, horizon: number, wind: Wind): void {
  const color = parseColor(params.flowerColor);
  for (let flower = 0; flower < 14; flower++) {
    const random = createRandom(hashSeed(FLOWER_SEED, flower));
    const depth = random() ** 1.3;
    const y = horizon + 2 + depth * (HEIGHT - horizon - 3);
    const x = getRandomBetween(random, 2, WIDTH - 2) + getLean(wind, 0, y) * (1 + depth * 2);
    setPixel(image, x, y, color);
    if (depth > 0.55) {
      setPixel(image, x + 1, y, scale(color, 0.85));
      setPixel(image, x, y + 1, scale(color, 0.7));
      setPixel(image, x + 1, y + 1, scale(color, 0.6));
    }
  }
}

export function drawMeadow(
  image: RgbaImage,
  params: MeadowParams,
  horizon: number,
  beat: number,
  blades = 220,
): void {
  const wind: Wind = { beat, strength: params.wind, gust: params.gust, every: params.every };
  drawField(image, params, horizon, wind);
  drawBlades(image, params, horizon, wind, blades);
  if (params.flowers) {
    drawFlowers(image, params, horizon, wind);
  }
}

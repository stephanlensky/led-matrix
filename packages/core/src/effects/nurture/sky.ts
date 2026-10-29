import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import { scale } from "../cat-model.ts";
import { type Wind, getLean } from "./meadow.ts";
import { type Point, clamp, getNoise, mix, setPixel, speedSchema } from "./shared.ts";

const LOOP_BEATS = 16;
const CLOUD_SEED = 0xc10d;
const STEM_SEED = 0x57e3;
const GROUND_SEED = 0x6d;
const CLOUD_PERIOD = 8;
const CLOUD_SCALE = 0.075;
const GROUND_Y = 54;

function getClouds(x: number, y: number, drift: number, isOpen: boolean): number {
  const u = x * CLOUD_SCALE + drift;
  const v = y * 0.2;
  const broad = getNoise(u, v, CLOUD_SEED, CLOUD_PERIOD);
  const fine = getNoise(u * 2 + drift, v * 2.2, CLOUD_SEED + 1, CLOUD_PERIOD * 2);
  const flecks = getNoise(u * 4 + drift * 2, v * 3, CLOUD_SEED + 2, CLOUD_PERIOD * 4);
  const bandCenter = 8 + x * 0.32;
  const band = Math.exp(-(((y - bandCenter) / 7) ** 2));
  const upper = Math.exp(-(((y - (4 + x * 0.12)) / 4) ** 2)) * 0.6;
  const lower = isOpen ? Math.exp(-(((y - (36 + x * 0.22)) / 6) ** 2)) * 0.85 : 0;
  const shape = broad * 0.65 + fine * 0.35;
  const wisps = clamp((shape * (band + upper + lower) - 0.3) * 2.6);
  const speckles = clamp((flecks - 0.62) * 3) * clamp((band + upper + lower) * 1.5) * 0.6;
  return Math.max(wisps, speckles);
}

function drawSky(
  image: RgbaImage,
  top: Color,
  bottom: Color,
  drift: number,
  isOpen: boolean,
): void {
  const horizon = isOpen ? HEIGHT : GROUND_Y + 4;
  for (let y = 0; y < horizon; y++) {
    const color = mix(top, bottom, clamp(y / horizon) ** 1.2);
    for (let x = 0; x < WIDTH; x++) {
      setPixel(image, x, y, mix(color, [255, 255, 255], getClouds(x, y, drift, isOpen)));
    }
  }
}

function drawGround(image: RgbaImage, ground: Color, wind: Wind): void {
  for (let x = 0; x < WIDTH; x++) {
    const lean = getLean(wind, x, GROUND_Y);
    const edge = GROUND_Y + getNoise((x - lean * 2) * 0.45, 0, GROUND_SEED) * 5 - 2;
    for (let y = Math.floor(edge); y < HEIGHT; y++) {
      const shade = getNoise((x - (y - edge) * lean) * 0.7, y * 0.5, GROUND_SEED + 1);
      setPixel(
        image,
        x,
        y,
        scale(ground, (0.75 + 0.4 * shade) * (1 - clamp((y - edge) / 14) * 0.25)),
      );
    }
  }
}

function drawStems(
  image: RgbaImage,
  stem: Color,
  seedHead: Color,
  wind: Wind,
  count: number,
): void {
  for (let index = 0; index < count; index++) {
    const random = createRandom(hashSeed(STEM_SEED, index));
    const baseX = getRandomBetween(random, -2, WIDTH + 2);
    const baseY = GROUND_Y + getRandomBetween(random, 2, 8);
    const height = getRandomBetween(random, 4, 13) * (random() < 0.3 ? 1.3 : 1);
    const lean =
      getLean(wind, baseX, baseY) * getRandomBetween(random, 0.5, 1.1) +
      getRandomBetween(random, -0.15, 0.25);
    const steps = Math.ceil(height * 1.5);
    let tip: Point = [baseX, baseY];
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      tip = [
        baseX + lean * height * 0.5 * t * t,
        baseY - height * t * (1 - 0.15 * lean * lean * t),
      ];
      setPixel(image, tip[0], tip[1], stem);
    }
    if (random() < 0.75) {
      const length = getRandomBetween(random, 1.5, 3);
      const angle = Math.atan(lean);
      for (let step = 0; step <= length * 2; step++) {
        const distance = step / 2;
        const x = tip[0] + Math.sin(angle) * distance;
        const y = tip[1] - Math.cos(angle) * distance;
        setPixel(image, x, y, seedHead);
        if (step > 1 && step < length * 2 - 1) {
          setPixel(image, x + 1, y, scale(seedHead, 0.7));
        }
      }
    }
  }
}

export const summerSky = defineEffect({
  id: "summer-sky",
  name: "Summer sky",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    speed: speedSchema,
    skyTop: colorSchema.default("#0636d8"),
    skyBottom: colorSchema.default("#4aa6ff"),
    ground: colorSchema.default("#40d020"),
    stem: colorSchema.default("#6cf030"),
    seedHead: colorSchema.default("#e0b060"),
    grass: z.boolean().default(true),
    stems: z.number().int().min(0).max(80).default(36),
    wind: z.number().min(0).max(1.5).default(0.5),
    gust: z.number().min(0).max(1.5).default(0.7),
    every: z.number().min(0.5).max(4).default(2),
  }),
  render(image, { params, beat: musicBeat }) {
    const beat = musicBeat * params.speed;
    const drift = (beat / LOOP_BEATS) * CLOUD_PERIOD;
    const wind: Wind = { beat, strength: params.wind, gust: params.gust, every: params.every };
    drawSky(image, parseColor(params.skyTop), parseColor(params.skyBottom), drift, !params.grass);
    if (params.grass) {
      drawGround(image, parseColor(params.ground), wind);
      drawStems(image, parseColor(params.stem), parseColor(params.seedHead), wind, params.stems);
    }
  },
});

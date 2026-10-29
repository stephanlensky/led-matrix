import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../../frame.ts";
import { easings } from "../../keyframes.ts";
import { type Random, createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  TAU,
  addLight,
  clamp,
  getCycle,
  mix,
  paperSchema,
  setPixel,
  speedSchema,
} from "./shared.ts";

const LOOP_BEATS = 16;
const CLUMP_SEED = 0x5a0;
const FLAKE_SEED = 0xf1a;
const CLUMP_LIFE = 6;
const FLAKE_COUNT = 34;

function getGaussian(random: Random): number {
  return (random() + random() + random() - 1.5) * 1.15;
}

function drawBackground(image: RgbaImage, top: Color, bottom: Color): void {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      setPixel(image, x, y, mix(top, bottom, clamp((y + (WIDTH - x) * 0.5) / (HEIGHT * 1.5))));
    }
  }
}

function drawClump(image: RgbaImage, snow: Color, age: number, variant: number): void {
  const random = createRandom(hashSeed(CLUMP_SEED, variant));
  const startX = getRandomBetween(random, 6, WIDTH - 6);
  const startY = getRandomBetween(random, -4, HEIGHT * 0.6);
  const axis = random() * TAU;
  const length = getRandomBetween(random, 5, 12);
  const width = getRandomBetween(random, 1.5, 3.5);
  const count = Math.round(getRandomBetween(random, 45, 90));
  const drift = getRandomBetween(random, 2.5, 4.5);
  const sway = getRandomBetween(random, 0.5, 2);
  const puff = 0.35 + 0.65 * easings.easeOutCubic(clamp(age / 0.6));
  const fade = clamp(age / 0.15) * (1 - clamp((age - CLUMP_LIFE * 0.6) / (CLUMP_LIFE * 0.4)));
  const centerX = startX + Math.sin(age * 0.8 + variant) * sway;
  const centerY = startY + age * drift;
  const cos = Math.cos(axis + age * 0.08);
  const sin = Math.sin(axis + age * 0.08);
  for (let particle = 0; particle < count; particle++) {
    const along = getGaussian(random) * length * puff;
    const across = getGaussian(random) * width * puff * (1 + Math.abs(along) * 0.08);
    const scatter = random() < 0.15 ? getRandomBetween(random, 1.5, 3) : 1;
    const x = centerX + (along * cos - across * sin) * scatter;
    const y = centerY + (along * sin + across * cos) * scatter + age * random() * 0.6;
    const brightness = (scatter > 1 ? 0.65 : 0.45) + random() * 0.45;
    addLight(image, x, y, snow, brightness * fade);
  }
}

function drawFlakes(image: RgbaImage, snow: Color, beat: number): void {
  for (let flake = 0; flake < FLAKE_COUNT; flake++) {
    const random = createRandom(hashSeed(FLAKE_SEED, flake));
    const speed = Math.round(getRandomBetween(random, 1, 3));
    const fall = getCycle(random() + (beat / LOOP_BEATS) * speed);
    const x =
      getRandomBetween(random, 0, WIDTH) + Math.sin((beat / 4) * TAU + random() * TAU) * 1.5;
    const y = -2 + fall * (HEIGHT + 4);
    const twinkle = Math.exp(-getCycle(beat + random() * 0.5) * 3);
    const brightness = getRandomBetween(random, 0.35, 0.7) + 0.4 * twinkle;
    addLight(image, x, y, snow, brightness);
  }
}

export const snowBurst = defineEffect({
  id: "snow-burst",
  name: "Snow burst",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    speed: speedSchema,
    skyTop: paperSchema.default("#0446e0"),
    skyBottom: colorSchema.default("#2a8cff"),
    snow: colorSchema.default("#ffffff"),
    every: z.number().min(0.5).max(4).default(1),
  }),
  render(image, { params, beat: musicBeat }) {
    const beat = musicBeat * params.speed;
    const snow = parseColor(params.snow);
    if (params.skyTop !== "none") {
      drawBackground(image, parseColor(params.skyTop), parseColor(params.skyBottom));
    }
    drawFlakes(image, snow, beat);
    const variants = Math.max(1, Math.round(LOOP_BEATS / params.every));
    const latest = Math.floor(beat / params.every);
    const oldest = Math.floor((beat - CLUMP_LIFE) / params.every);
    for (let spawn = oldest; spawn <= latest; spawn++) {
      const age = beat - spawn * params.every;
      if (age >= 0 && age < CLUMP_LIFE) {
        drawClump(image, snow, age, ((spawn % variants) + variants) % variants);
      }
    }
  },
});

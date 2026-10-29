import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH, fillRgbaImage } from "../frame.ts";
import { createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  drawDot,
  drawStreak,
  getBallisticPosition,
  getMixedColor,
  getScaledColor,
} from "./blood/shared.ts";
import { drawSplat } from "./blood/splatter.ts";
import {
  BLACK_TILT,
  CAT_SIZE,
  TABBY_TILT,
  type CatState,
  clamp,
  coatParams,
  getBounceState,
  getCoats,
  getSpan,
} from "./cat-duo.ts";
import { drawCat } from "./cat-model.ts";

const EXPLODE_SEED = 0xca7b;
const GRAVITY = 260;
const PULSES = 4;
const SWELL = 0.45;
const FLASH_LENGTH = 0.06;
const MAX_DRYNESS = 0.45;
const SPLATS = 7;

function getPulse(phase: number): number {
  return phase < 0.15 ? phase / 0.15 : Math.exp(-(phase - 0.15) * 5);
}

export const catExplode = defineEffect({
  id: "cat-explode",
  name: "Cat explode",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...coatParams,
    bloodColor: colorSchema.default(BLOOD_COLOR),
    burstAt: z.number().min(0.1).max(0.9).default(0.5),
    particles: z.number().int().min(0).max(200).default(90),
    splats: z.number().int().min(0).max(16).default(SPLATS),
    shake: z.number().min(0).max(4).default(1.2),
  }),
  render(image, { params, progress }) {
    const coats = getCoats(params);
    const blood = parseColor(params.bloodColor);
    const cats = getBounceState(0);
    const swell = getSpan(progress, 0, params.burstAt);
    const after = getSpan(progress, params.burstAt, 1);
    const isBurst = progress >= params.burstAt;
    const pulse = getPulse((swell * PULSES) % 1) * (swell < 1 ? 1 : 0);
    const shakeRandom = createRandom(hashSeed(EXPLODE_SEED, Math.floor(progress * 400)));
    const shake = params.shake * swell * swell;

    const raster = createRaster();
    const tilts = [TABBY_TILT, BLACK_TILT];
    for (const [index, cat] of cats.entries()) {
      if (isBurst) {
        continue;
      }
      const growth = SWELL * swell * swell + 0.08 * pulse;
      const jitter = shake;
      drawCat(
        raster,
        {
          x: cat.x + getRandomBetween(shakeRandom, -1, 1) * jitter,
          y: cat.y + getRandomBetween(shakeRandom, -1, 1) * jitter,
          size: CAT_SIZE * (1 + growth),
          rotate: getRotation(tilts[index]?.[0] ?? 0, cat.yaw, tilts[index]?.[1] ?? 0),
          flash: 0.65 * swell * swell + 0.25 * pulse,
          flashColor: [255, 30, 30],
        },
        index === 0 ? coats[0] : coats[1],
      );
    }

    if (isBurst && after < FLASH_LENGTH) {
      fillRgbaImage(image, getScaledColor(blood, 0.8 * (1 - after / FLASH_LENGTH) ** 2));
    }
    if (isBurst) {
      drawStains(image, after, cats, blood, params.splats);
      drawChunks(image, after, cats, blood, params.particles);
    }
    resolveRaster(raster, image);
  },
});

function drawStains(
  image: Uint8ClampedArray,
  after: number,
  cats: readonly CatState[],
  blood: Color,
  splats: number,
): void {
  const dryness = MAX_DRYNESS * clamp(after * 1.3);
  const stain = getMixedColor(blood, DRIED_COLOR, dryness);
  const time = after * 2.5;
  for (const [index, cat] of cats.entries()) {
    const splatRandom = createRandom(hashSeed(EXPLODE_SEED, index, 1));
    for (let splat = 0; splat < splats; splat++) {
      const delay = getRandomBetween(splatRandom, 0, 0.08);
      const x = cat.x + getRandomBetween(splatRandom, -22, 22);
      const y = cat.y + getRandomBetween(splatRandom, -26, 10);
      const radius = getRandomBetween(splatRandom, 2.5, 7);
      const runs = Math.round(getRandomBetween(splatRandom, 1, 4));
      const runSpeed = getRandomBetween(splatRandom, 4, 10);
      const age = time - delay;
      if (age < 0 || x < -4 || x > WIDTH + 4 || y < -4 || y > HEIGHT) {
        continue;
      }
      drawSplat(image, createRandom(hashSeed(EXPLODE_SEED, index, splat)), {
        x,
        y,
        radius,
        growth: 1 - Math.exp(-age * 20),
        age,
        runs,
        runSpeed,
        color: stain,
      });
    }
  }
}

function drawChunks(
  image: Uint8ClampedArray,
  after: number,
  cats: readonly CatState[],
  blood: Color,
  particles: number,
): void {
  const time = after * 2.5;
  for (const [index, cat] of cats.entries()) {
    const random = createRandom(hashSeed(EXPLODE_SEED, index, 2));
    for (let particle = 0; particle < particles; particle++) {
      const angle = random() * Math.PI * 2;
      const speed = getRandomBetween(random, 20, 110);
      const size = random() < 0.3 ? 2 : 1;
      const shade = getRandomBetween(random, 0.7, 1.2);
      const velocity = [Math.cos(angle) * speed, Math.sin(angle) * speed - 40] as const;
      const at = time * 0.6;
      const head = getBallisticPosition([cat.x, cat.y], velocity, GRAVITY, at);
      const tail = getBallisticPosition([cat.x, cat.y], velocity, GRAVITY, Math.max(0, at - 0.04));
      const color = getScaledColor(blood, shade);
      drawStreak(image, tail, head, color);
      drawDot(image, head, size, color);
    }
  }
}

const SPRAY_SEED = 0xca7c;
const SPRAY_STEP = 0.125;
const SPRAY_LIFE = 1.6;
const SPRAY_TRAIL = 0.035;
const SPRAY_GRAVITY = 70;

export const catBloodSpray = defineEffect({
  id: "cat-blood-spray",
  name: "Cat blood spray",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    perStep: z.number().int().min(0).max(64).default(14),
    beatBurst: z.number().int().min(0).max(128).default(24),
    power: z.number().min(0.3).max(1.5).default(0.8),
    intensity: z.number().min(0).max(1).default(1),
    stains: z.boolean().default(true),
    splats: z.number().int().min(0).max(16).default(SPLATS),
    puddle: z.number().min(0).max(12).default(6.5),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const cats = getBounceState(0);
    const origins = cats.map(({ x, y }) => [x, y] as const);
    if (params.stains) {
      drawStains(image, 1, cats, color, params.splats);
    }
    const phase = beat - Math.floor(beat);
    const swell =
      params.beatBurst > 0 ? Math.exp(-phase * 5) : 0.5 + 0.5 * Math.sin(beat * Math.PI);
    for (const [index, [x, y]] of params.intensity > 0 ? origins.entries() : []) {
      drawSplat(image, createRandom(hashSeed(SPRAY_SEED, index, 1)), {
        x,
        y,
        radius: (params.puddle + 1.5 * swell) * params.intensity,
        growth: 1,
        age: 8,
        runs: 4,
        runSpeed: 6,
        color: getScaledColor(color, 1.1 + 0.25 * swell),
      });
    }
    const stepsPerPeriod = Math.max(1, Math.round(params.period / SPRAY_STEP));
    const stepsPerBeat = Math.round(1 / SPRAY_STEP);
    const first = Math.floor((beat - SPRAY_LIFE) / SPRAY_STEP) + 1;
    const last = Math.floor(beat / SPRAY_STEP);
    for (let step = first; step <= last; step++) {
      const age = beat - step * SPRAY_STEP;
      const wrapped = ((step % stepsPerPeriod) + stepsPerPeriod) % stepsPerPeriod;
      const isBeat = params.beatBurst > 0 && wrapped % stepsPerBeat === 0;
      const count = params.perStep + (isBeat ? params.beatBurst : 0);
      const random = createRandom(hashSeed(SPRAY_SEED, wrapped));
      for (let index = 0; index < count; index++) {
        const time = age - random() * SPRAY_STEP;
        const origin = origins[index % origins.length] ?? origins[0] ?? [0, 0];
        const angle = random() * Math.PI * 2;
        const speed = params.power * getRandomBetween(random, 12, 48) * (isBeat ? 1.3 : 1);
        const shade = getRandomBetween(random, 0.7, 1.25);
        const size = random() < 0.2 ? 2 : 1;
        if (time < 0 || random() > params.intensity) {
          continue;
        }
        const velocity = [Math.cos(angle) * speed, Math.sin(angle) * speed - 18] as const;
        const head = getBallisticPosition(origin, velocity, SPRAY_GRAVITY, time);
        if (head[1] > HEIGHT + 2) {
          continue;
        }
        const tail = getBallisticPosition(
          origin,
          velocity,
          SPRAY_GRAVITY,
          Math.max(0, time - SPRAY_TRAIL),
        );
        const particleColor = getScaledColor(color, shade);
        drawStreak(image, tail, head, particleColor);
        drawDot(image, head, size, particleColor);
      }
    }
  },
});

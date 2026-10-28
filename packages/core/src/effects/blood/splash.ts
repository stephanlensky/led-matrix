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
  drawDot,
  drawStreak,
  getBallisticPosition,
  getMixedColor,
  getModulo,
  getNoise,
  getScaledColor,
} from "./shared.ts";

const SPLASH_SEED = 0xb1160;
const TEXTURE_SEED = 0xb1161;
const FLOOR = 52;
const GRAVITY = 320;
const LIFE = 1.2;

type Splash = { x: number; time: number; scale: number; seed: number };

function drawFallingDrop(image: RgbaImage, x: number, y: number, scale: number, color: Color) {
  const length = Math.round(3 + 4 * scale);
  for (let offset = 0; offset < length; offset++) {
    const width = offset < 2 ? (scale > 0.7 ? 3 : 2) : 1;
    const shade = 1.4 - (offset / length) * 1;
    for (let column = 0; column < width; column++) {
      setRgbaPixel(
        image,
        Math.round(x) + column - Math.floor(width / 2),
        Math.round(y) - offset,
        getScaledColor(color, shade),
      );
    }
  }
}

function drawImpact(image: RgbaImage, splash: Splash, age: number, color: Color) {
  const random = createRandom(hashSeed(SPLASH_SEED, splash.seed, 1));
  const fade = Math.max(0, 1 - age / LIFE);
  const crownAge = Math.min(1, age / 0.45);
  const crownHeight = 11 * splash.scale * Math.sin(Math.PI * crownAge);
  const radius = (3 + age * 22) * splash.scale;
  const spikes = Math.round(14 * splash.scale + 4);
  for (let spike = 0; spike < spikes; spike++) {
    const angle = (spike / spikes) * Math.PI * 2 + random() * 0.3;
    const x = splash.x + Math.cos(angle) * radius;
    const base = FLOOR + Math.sin(angle) * radius * 0.25;
    const height = crownHeight * getRandomBetween(random, 0.5, 1) * (Math.sin(angle) < 0 ? 1 : 0.7);
    for (let offset = 0; offset < height; offset++) {
      setRgbaPixel(
        image,
        Math.round(x),
        Math.round(base - offset),
        getScaledColor(color, 0.7 + (offset / Math.max(1, height)) * 0.6),
      );
    }
    if (height > 1) {
      drawDot(image, [x, base - height - 1], 1, getScaledColor(color, 1.5));
    }
  }
  const particles = Math.round(28 * splash.scale);
  for (let index = 0; index < particles; index++) {
    const origin: Point = [splash.x + getRandomBetween(random, -2, 2), FLOOR];
    const velocity: Point = [
      getRandomBetween(random, -60, 60) * splash.scale,
      -getRandomBetween(random, 60, 130) * Math.sqrt(splash.scale),
    ];
    const head = getBallisticPosition(origin, velocity, GRAVITY, age);
    if (head[1] > FLOOR + 1) {
      continue;
    }
    const tail = getBallisticPosition(origin, velocity, GRAVITY, Math.max(0, age - 0.04));
    const particleColor = getScaledColor(color, getRandomBetween(random, 0.9, 1.4));
    drawStreak(image, tail, head, particleColor);
    drawDot(image, head, random() < 0.25 ? 2 : 1, particleColor);
  }
  const ripple = (4 + age * 40) * splash.scale;
  for (let x = 0; x < WIDTH; x++) {
    const offsetX = (x - splash.x) / ripple;
    if (Math.abs(offsetX) > 1) {
      continue;
    }
    const y = Math.round(FLOOR + 1 + Math.sqrt(1 - offsetX ** 2) * ripple * 0.18);
    setRgbaPixel(image, x, y, getScaledColor(color, 0.5 + fade));
  }
}

export const bloodSplash = defineEffect({
  id: "blood-splash",
  name: "Blood rain splash",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    every: z.number().min(0.25).max(4).default(1),
    offbeats: z.boolean().default(true),
    fallBeats: z.number().min(0.125).max(2).default(0.5),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    for (let y = FLOOR; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const depth = (y - FLOOR) / (HEIGHT - FLOOR);
        const shade = y === FLOOR ? 1 : 0.55 + 0.25 * getNoise(TEXTURE_SEED, x, y);
        setRgbaPixel(image, x, y, getScaledColor(getMixedColor(color, DRIED_COLOR, depth), shade));
      }
    }
    const step = params.offbeats ? params.every / 2 : params.every;
    const perPeriod = Math.max(1, Math.round(params.period / step));
    const last = Math.floor((beat + params.fallBeats) / step);
    const first = Math.floor((beat - LIFE) / step);
    for (let index = first; index <= last; index++) {
      const time = index * step;
      const isMain = !params.offbeats || getModulo(index, 2) === 0;
      const seed = getModulo(index, perPeriod);
      const random = createRandom(hashSeed(SPLASH_SEED, seed));
      const splash: Splash = {
        x: getRandomBetween(random, 10, WIDTH - 10),
        time,
        scale: isMain ? getRandomBetween(random, 0.9, 1.1) : getRandomBetween(random, 0.35, 0.5),
        seed,
      };
      const age = beat - time;
      if (age < 0) {
        const fall = Math.min(params.fallBeats, isMain ? params.fallBeats : params.fallBeats * 0.7);
        const progress = 1 + age / fall;
        if (progress >= 0) {
          drawFallingDrop(image, splash.x, -6 + (FLOOR + 6) * progress ** 2, splash.scale, color);
        }
      } else if (age < LIFE) {
        drawImpact(image, splash, age, color);
      }
    }
  },
});

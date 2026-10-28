import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, RGBA_CHANNELS, WIDTH, createRgbaImage, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  getMixedColor,
  getModulo,
  getNoise,
  getScaledColor,
  getSplatShape,
} from "./shared.ts";

const SLAM_SEED = 0xb11c0;
const SHAKE_SEED = 0xb11c1;
const TEXTURE_SEED = 0xb11c2;
const CENTER_X = WIDTH / 2 - 0.5;
const CENTER_Y = HEIGHT / 2 - 0.5;
const PUNCH_DECAY = 7;

export const bloodSlam = defineEffect({
  id: "blood-slam",
  name: "Wall slam",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    every: z.number().min(0.25).max(4).default(1),
    doubleHit: z.boolean().default(true),
    zoom: z.number().min(0).max(0.5).default(0.18),
    shake: z.number().min(0).max(6).default(2),
    keep: z.number().int().min(1).max(12).default(5),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const hitsPerPeriod = Math.max(1, Math.round(params.period / params.every));
    const last = Math.floor(beat / params.every);
    const hits: { time: number; seed: number }[] = [];
    for (let index = last - params.keep; index <= last; index++) {
      const time = index * params.every;
      const seed = getModulo(index, hitsPerPeriod);
      hits.push({ time, seed });
      if (params.doubleHit && getModulo(index, 4) === 3) {
        hits.push({ time: time + params.every / 2, seed: seed + 1000 });
      }
    }
    const visible = hits.filter((hit) => hit.time <= beat).slice(-params.keep);
    const lastHit = visible.at(-1);
    const since = lastHit ? beat - lastHit.time : 99;
    const punch = Math.exp(-since * PUNCH_DECAY);

    const wall = createRgbaImage();
    const lifetime = params.keep * params.every;
    for (const hit of visible) {
      const age = beat - hit.time;
      const random = createRandom(hashSeed(SLAM_SEED, hit.seed));
      const centerX = CENTER_X + getRandomBetween(random, -9, 9);
      const centerY = CENTER_Y + getRandomBetween(random, -9, 6);
      const shape = getSplatShape(random, getRandomBetween(random, 7, 11));
      const flash = Math.max(0, 1 - age / 0.2);
      const fade = Math.max(0.15, 1 - age / (lifetime + 0.5));
      const base = getMixedColor(color, DRIED_COLOR, 1 - fade);
      const brightness = fade * (1 + flash * 0.9);
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const offsetX = x - centerX;
          const offsetY = y - centerY;
          const distance = Math.hypot(offsetX, offsetY);
          const edge = shape(Math.atan2(offsetY, offsetX));
          if (distance <= edge) {
            const shade =
              brightness *
              (0.7 + 0.3 * getNoise(TEXTURE_SEED, x, y)) *
              (edge - distance < 1 ? 0.7 : 1);
            setRgbaPixel(wall, x, y, getScaledColor(base, shade));
          }
        }
      }
      const drips = Math.round(getRandomBetween(random, 3, 6));
      for (let index = 0; index < drips; index++) {
        const x = Math.round(centerX + getRandomBetween(random, -8, 8));
        const top = centerY + getRandomBetween(random, 4, 9);
        const length = Math.min(HEIGHT, age * getRandomBetween(random, 6, 14));
        for (let offset = 0; offset < length; offset++) {
          setRgbaPixel(
            wall,
            x,
            Math.round(top + offset),
            getScaledColor(base, brightness * (0.85 - offset * 0.01)),
          );
        }
      }
    }

    const scale = 1 + params.zoom * punch;
    const shakeRandom = createRandom(hashSeed(SHAKE_SEED, Math.floor(beat * 16)));
    const shakeX = getRandomBetween(shakeRandom, -1, 1) * params.shake * punch;
    const shakeY = getRandomBetween(shakeRandom, -1, 1) * params.shake * punch;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const sourceX = Math.round(CENTER_X + (x - CENTER_X) / scale + shakeX);
        const sourceY = Math.round(CENTER_Y + (y - CENTER_Y) / scale + shakeY);
        if (sourceX < 0 || sourceY < 0 || sourceX >= WIDTH || sourceY >= HEIGHT) {
          continue;
        }
        const source = (sourceY * WIDTH + sourceX) * RGBA_CHANNELS;
        if ((wall[source + 3] ?? 0) === 0) {
          continue;
        }
        setRgbaPixel(image, x, y, [
          wall[source] ?? 0,
          wall[source + 1] ?? 0,
          wall[source + 2] ?? 0,
        ]);
      }
    }
  },
});

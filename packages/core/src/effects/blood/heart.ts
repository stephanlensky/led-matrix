import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  type Point,
  drawDot,
  drawStreak,
  getBallisticPosition,
  getCycle,
  getEnvelope,
  getMixedColor,
  getModulo,
  getScaledColor,
  getSmoothNoise2d,
} from "./shared.ts";

const SPRAY_SEED = 0xb1170;
const VEIN_SEED = 0xb1171;
const CENTER: Point = [WIDTH / 2 - 0.5, 35];
const GRAVITY = 200;
const SPRAY_LIFE = 1.6;
const DUB = 0.25;

function getHeartValue(x: number, y: number): number {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y;
}

export const bloodHeart = defineEffect({
  id: "blood-heart",
  name: "Pumping heart",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    size: z.number().min(10).max(30).default(21),
    pump: z.number().min(0).max(0.5).default(0.18),
    sprayEvery: z.number().min(0.5).max(8).default(2),
    spray: z.number().int().min(0).max(96).default(40),
    flash: z.number().min(0).max(1).default(0.25),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const lub = getEnvelope(beat, 6);
    const dub = getCycle(beat) >= DUB ? getEnvelope(beat - DUB, 8) * 0.5 : 0;
    const beatPump = lub + dub;
    const scale = params.size * (1 + params.pump * beatPump);
    const background = params.flash * lub;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const localX = (x - CENTER[0]) / scale;
        const localY = -(y - CENTER[1]) / scale + 0.1;
        const value = getHeartValue(localX * 1.1, localY * 1.1);
        if (value > 0) {
          setRgbaPixel(image, x, y, getScaledColor(color, background * 0.5));
          continue;
        }
        const depth = Math.min(1, -value * 6);
        const highlight = Math.max(0, 1 - Math.hypot(localX + 0.4, localY - 0.45) / 0.35);
        const vein = getSmoothNoise2d(VEIN_SEED, localX * 6, localY * 6);
        const isVein = Math.abs(vein - 0.5) < 0.025 && depth > 0.3;
        let shade = 0.55 + 0.35 * depth + 0.8 * highlight ** 2 + beatPump * 0.35;
        if (depth < 0.12) {
          shade = 0.45 + beatPump * 0.2;
        }
        const base = isVein ? getMixedColor(color, DRIED_COLOR, 0.35) : color;
        setRgbaPixel(image, x, y, getScaledColor(base, shade));
      }
    }

    const top: Point = [CENTER[0] + scale * 0.15, CENTER[1] - scale * 0.95];
    for (let y = Math.round(top[1] - scale * 0.25); y <= top[1] + 2; y++) {
      for (let column = -1; column <= 1; column++) {
        setRgbaPixel(
          image,
          Math.round(top[0]) + column,
          y,
          getScaledColor(color, 0.75 + lub * 0.4),
        );
      }
    }
    const origin: Point = [top[0], top[1] - scale * 0.25];
    const perPeriod = Math.max(1, Math.round(params.period / params.sprayEvery));
    const last = Math.floor(beat / params.sprayEvery);
    for (let index = last - Math.ceil(SPRAY_LIFE / params.sprayEvery); index <= last; index++) {
      const age = beat - index * params.sprayEvery;
      if (age < 0 || age > SPRAY_LIFE) {
        continue;
      }
      const random = createRandom(hashSeed(SPRAY_SEED, getModulo(index, perPeriod)));
      for (let particle = 0; particle < params.spray; particle++) {
        const time = age - random() * 0.15;
        if (time < 0) {
          continue;
        }
        const angle = -Math.PI / 2 + getRandomBetween(random, -0.6, 0.6);
        const speed = getRandomBetween(random, 70, 140);
        const velocity: Point = [Math.cos(angle) * speed, Math.sin(angle) * speed];
        const head = getBallisticPosition(origin, velocity, GRAVITY, time);
        if (head[1] > HEIGHT + 2) {
          continue;
        }
        const tail = getBallisticPosition(origin, velocity, GRAVITY, Math.max(0, time - 0.04));
        const particleColor = getScaledColor(color, getRandomBetween(random, 1, 1.5));
        drawStreak(image, tail, head, particleColor);
        drawDot(image, head, random() < 0.2 ? 2 : 1, particleColor);
      }
    }
  },
});

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
  getMixedColor,
  getModulo,
  getScaledColor,
  getWrappedNoise2d,
} from "./shared.ts";

const BUBBLE_SEED = 0xb1190;
const LIQUID_SEED = 0xb1191;
const POP_LIFE = 0.8;
const GRAVITY = 90;
const WRAP = 8;

type Bubble = { x: number; y: number; radius: number; growth: number; age: number; seed: number };

export const bloodBubbles = defineEffect({
  id: "blood-bubbles",
  name: "Blood bubbles",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    every: z.number().min(0.25).max(4).default(1),
    swellBeats: z.number().min(0.5).max(8).default(3),
    size: z.number().min(4).max(20).default(11),
    droplets: z.number().int().min(0).max(64).default(26),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const perPeriod = Math.max(1, Math.round(params.period / params.every));
    const last = Math.floor((beat + params.swellBeats) / params.every);
    const first = Math.floor((beat - POP_LIFE) / params.every);
    const bubbles: Bubble[] = [];
    for (let index = first; index <= last; index++) {
      const seed = getModulo(index, perPeriod);
      const random = createRandom(hashSeed(BUBBLE_SEED, seed));
      const age = beat - index * params.every;
      const radius = params.size * getRandomBetween(random, 0.65, 1.15);
      bubbles.push({
        x: getRandomBetween(random, radius * 0.6, WIDTH - radius * 0.6),
        y: getRandomBetween(random, radius * 0.6, HEIGHT - radius * 0.6),
        radius,
        growth: Math.max(0, Math.min(1, 1 + age / params.swellBeats)),
        age,
        seed,
      });
    }
    const flow = (beat / params.period) * WRAP;
    const popFlash = bubbles.reduce(
      (sum, bubble) =>
        bubble.age >= 0 && bubble.age < 0.25 ? sum + (1 - bubble.age / 0.25) * 0.15 : sum,
      0,
    );

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const noise = getWrappedNoise2d(LIQUID_SEED, x / 8 + flow, y / 8, WRAP);
        let pixel = getScaledColor(getMixedColor(DRIED_COLOR, color, noise), 0.45 + popFlash);
        for (const bubble of bubbles) {
          if (bubble.age >= 0 || bubble.growth <= 0) {
            continue;
          }
          const shiver = bubble.age > -0.2 ? 0.08 * Math.sin(beat * 80) : 0;
          const offsetX = x - bubble.x;
          const offsetY = y - bubble.y;
          const angle = Math.atan2(offsetY, offsetX);
          const radius =
            bubble.radius *
            (1 - (1 - bubble.growth) ** 2) *
            (1 + 0.06 * Math.sin(3 * angle + beat * 4 + bubble.seed) + shiver);
          const distance = Math.hypot(offsetX, offsetY);
          if (distance > radius) {
            continue;
          }
          const highlight = Math.max(
            0,
            1 - Math.hypot(offsetX + radius * 0.4, offsetY + radius * 0.4) / (radius * 0.35),
          );
          const shade = radius - distance < 1.2 ? 1.25 : 0.6 + 0.3 * (distance / radius);
          pixel = getScaledColor(color, shade + highlight * 1.4);
        }
        setRgbaPixel(image, x, y, pixel);
      }
    }

    for (const bubble of bubbles) {
      if (bubble.age < 0 || bubble.age > POP_LIFE) {
        continue;
      }
      const fade = 1 - bubble.age / POP_LIFE;
      const ring = bubble.radius * (1 + bubble.age * 2.5);
      for (let step = 0; step < 48; step++) {
        const angle = (step / 48) * Math.PI * 2;
        setRgbaPixel(
          image,
          Math.round(bubble.x + Math.cos(angle) * ring),
          Math.round(bubble.y + Math.sin(angle) * ring),
          getScaledColor(color, fade * 0.9),
        );
      }
      const random = createRandom(hashSeed(BUBBLE_SEED, bubble.seed, 1));
      for (let index = 0; index < params.droplets; index++) {
        const angle = random() * Math.PI * 2;
        const speed = getRandomBetween(random, 40, 90);
        const origin: Point = [
          bubble.x + Math.cos(angle) * bubble.radius,
          bubble.y + Math.sin(angle) * bubble.radius,
        ];
        const velocity: Point = [Math.cos(angle) * speed, Math.sin(angle) * speed];
        const head = getBallisticPosition(origin, velocity, GRAVITY, bubble.age);
        const tail = getBallisticPosition(
          origin,
          velocity,
          GRAVITY,
          Math.max(0, bubble.age - 0.05),
        );
        const dropletColor = getScaledColor(
          color,
          (0.8 + 0.6 * fade) * getRandomBetween(random, 0.9, 1.3),
        );
        drawStreak(image, tail, head, dropletColor);
        drawDot(image, head, random() < 0.25 ? 2 : 1, dropletColor);
      }
    }
  },
});

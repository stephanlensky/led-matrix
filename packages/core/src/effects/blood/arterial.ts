import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import type { RgbaImage } from "../../frame.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  type Point,
  drawDot,
  drawStreak,
  getBallisticPosition,
  getEnvelope,
  getModulo,
  getScaledColor,
} from "./shared.ts";

const SPRAY_SEED = 0xb1180;
const STEP = 1 / 16;
const GRAVITY = 150;
const LIFE = 1.6;
const STAIN_LIFE = 3;
const ORIGIN: Point = [WIDTH / 2 - 0.5, HEIGHT + 1];

function getExitTime([x, y]: Point, [velocityX, velocityY]: Point): number {
  const times: number[] = [];
  if (velocityX < 0) {
    times.push(-x / velocityX);
  } else if (velocityX > 0) {
    times.push((WIDTH - 1 - x) / velocityX);
  }
  const discriminant = velocityY * velocityY - 2 * GRAVITY * y;
  if (discriminant >= 0) {
    const time = (-velocityY - Math.sqrt(discriminant)) / GRAVITY;
    if (time > 0) {
      times.push(time);
    }
  }
  return Math.min(...times, Number.POSITIVE_INFINITY);
}

function drawStain(
  image: RgbaImage,
  [x, y]: Point,
  age: number,
  color: readonly [number, number, number],
) {
  const fade = Math.max(0, 1 - age / STAIN_LIFE);
  const pixelX = Math.round(Math.max(0, Math.min(WIDTH - 1, x)));
  const pixelY = Math.round(Math.max(0, y));
  const length = Math.min(14, age * 6);
  for (let offset = 0; offset <= length; offset++) {
    setRgbaPixel(
      image,
      pixelX,
      pixelY + offset,
      getScaledColor(color, fade * (0.8 - offset * 0.03)),
    );
  }
}

export const bloodArterial = defineEffect({
  id: "blood-arterial",
  name: "Arterial spray",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    sweepBeats: z.number().min(1).max(16).default(4),
    sweep: z.number().min(0).max(1.4).default(0.9),
    pulseEvery: z.number().min(0.25).max(2).default(1),
    pulse: z.number().min(0).max(1).default(0.6),
    perStep: z.number().int().min(1).max(32).default(9),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const stepsPerPeriod = Math.max(1, Math.round(params.period / STEP));
    const first = Math.floor((beat - STAIN_LIFE) / STEP) + 1;
    const last = Math.floor(beat / STEP);
    for (let step = first; step <= last; step++) {
      const emitted = step * STEP;
      const age = beat - emitted;
      const strength = 1 + params.pulse * getEnvelope(emitted / params.pulseEvery, 5);
      const random = createRandom(hashSeed(SPRAY_SEED, getModulo(step, stepsPerPeriod)));
      const aim =
        -Math.PI / 2 + params.sweep * Math.sin((emitted / params.sweepBeats) * Math.PI * 2);
      const count = Math.round(params.perStep * strength);
      for (let index = 0; index < count; index++) {
        const time = age - random() * STEP;
        const angle = aim + getRandomBetween(random, -0.06, 0.06) * strength;
        const speed = getRandomBetween(random, 95, 120) * (0.7 + 0.35 * strength);
        const velocity: Point = [Math.cos(angle) * speed, Math.sin(angle) * speed];
        if (time < 0) {
          continue;
        }
        const exit = getExitTime(ORIGIN, velocity);
        if (time > exit) {
          if (index % 3 === 0) {
            drawStain(
              image,
              getBallisticPosition(ORIGIN, velocity, GRAVITY, exit),
              time - exit,
              color,
            );
          }
          continue;
        }
        if (time > LIFE) {
          continue;
        }
        const head = getBallisticPosition(ORIGIN, velocity, GRAVITY, time);
        const tail = getBallisticPosition(ORIGIN, velocity, GRAVITY, Math.max(0, time - 0.03));
        const particleColor = getScaledColor(
          color,
          getRandomBetween(random, 0.9, 1.3) * Math.min(1.3, strength),
        );
        drawStreak(image, tail, head, particleColor);
        drawDot(image, head, strength > 1.3 && random() < 0.3 ? 2 : 1, particleColor);
      }
    }
  },
});

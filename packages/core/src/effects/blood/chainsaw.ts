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
} from "./shared.ts";

const SPRAY_SEED = 0xb11e0;
const JITTER_SEED = 0xb11e1;
const CENTER_Y = HEIGHT / 2 - 0.5;
const TOOTH = 6;
const TOOTHS_PER_BEAT = 4;
const STEP = 1 / 16;
const GRAVITY = 220;
const LIFE = 0.9;

export const bloodChainsaw = defineEffect({
  id: "blood-chainsaw",
  name: "Chainsaw",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    rate: z.number().int().min(1).max(8).default(2),
    thickness: z.number().min(2).max(16).default(6),
    perStep: z.number().int().min(0).max(32).default(6),
    pulseBurst: z.number().int().min(0).max(64).default(14),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const pulse = getEnvelope(beat * params.rate, 6);
    const pulseIndex = Math.floor(beat * params.rate);
    const jitterRandom = createRandom(
      hashSeed(JITTER_SEED, getModulo(pulseIndex, params.period * params.rate)),
    );
    const centerY = CENTER_Y + getRandomBetween(jitterRandom, -1.5, 1.5) * pulse;
    const halfThickness = params.thickness / 2 + pulse * 1.5;
    const shift = beat * TOOTH * TOOTHS_PER_BEAT;
    const flash = pulse * 0.12;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const tooth = getCycle((x + shift) / TOOTH);
        const reach = halfThickness + 2.5 * tooth;
        const distance = Math.abs(y - centerY);
        if (distance > reach) {
          if (flash > 0.01) {
            setRgbaPixel(image, x, y, getScaledColor(color, flash));
          }
          continue;
        }
        const link = getCycle((x - shift * 0.5) / 4) < 0.5 ? 0.85 : 0.6;
        const isEdge = reach - distance < 1;
        const base = distance < 1 ? getMixedColor(color, [255, 220, 210], 0.25) : color;
        const shade = isEdge ? 1.3 + pulse * 0.4 : link + pulse * 0.4;
        setRgbaPixel(
          image,
          x,
          y,
          getScaledColor(getMixedColor(base, DRIED_COLOR, isEdge ? 0 : 0.2), shade),
        );
      }
    }

    const stepsPerPeriod = Math.max(1, Math.round(params.period / STEP));
    const first = Math.floor((beat - LIFE) / STEP) + 1;
    const last = Math.floor(beat / STEP);
    for (let step = first; step <= last; step++) {
      const emitted = step * STEP;
      const strength = getEnvelope(emitted * params.rate, 6);
      const count = params.perStep + Math.round(params.pulseBurst * strength);
      const random = createRandom(hashSeed(SPRAY_SEED, getModulo(step, stepsPerPeriod)));
      for (let index = 0; index < count; index++) {
        const time = beat - emitted - random() * STEP;
        const side = random() < 0.5 ? -1 : 1;
        const origin: Point = [
          getRandomBetween(random, 0, WIDTH),
          CENTER_Y + side * (params.thickness / 2 + 1),
        ];
        const velocity: Point = [
          -getRandomBetween(random, 20, 90),
          side * getRandomBetween(random, 50, 130) * (1 + strength * 0.6),
        ];
        if (time < 0 || time > LIFE) {
          continue;
        }
        const head = getBallisticPosition(origin, velocity, GRAVITY, time);
        const tail = getBallisticPosition(origin, velocity, GRAVITY, Math.max(0, time - 0.035));
        const particleColor = getScaledColor(
          color,
          getRandomBetween(random, 0.9, 1.4) * (1 - (time / LIFE) * 0.5),
        );
        drawStreak(image, tail, head, particleColor);
        drawDot(image, head, random() < 0.15 ? 2 : 1, particleColor);
      }
    }
  },
});

import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  getCycle,
  getEnvelope,
  getMixedColor,
  getModulo,
  getScaledColor,
  getSmoothNoise2d,
} from "./shared.ts";

const TEXTURE_SEED = 0xb1130;
const BUBBLE_SEED = 0xb1131;
const RIPPLE_SEED = 0xb1132;
const BUBBLE_BEATS = 4;

export const bloodTide = defineEffect({
  id: "blood-tide",
  name: "Rising tide",
  kind: "pixel",
  isBeatOnly: true,
  isFirstCycleDistinct: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    from: z.number().min(0).max(1).default(0.1),
    to: z.number().min(0).max(1).default(0.85),
    buildBeats: z.number().min(0).max(256).default(0),
    stepBeats: z.number().min(0.25).max(16).default(4),
    waves: z.number().min(0).max(4).default(1),
    bubbles: z.number().int().min(0).max(32).default(10),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat, cycle }) {
    const color = parseColor(params.color);
    let amount = 1;
    if (params.buildBeats > 0 && cycle === 0) {
      const step = Math.floor(beat / params.stepBeats);
      const since = beat - step * params.stepBeats;
      const steps = params.buildBeats / params.stepBeats;
      const ease = 1 - (1 - Math.min(1, since / 0.5)) ** 3;
      amount = Math.min(1, (step + ease) / steps);
    }
    const level = params.from + (params.to - params.from) * amount;
    const surface = HEIGHT * (1 - level);
    const kick = getEnvelope(beat, 3) * params.waves;
    const phase = (beat / params.period) * Math.PI * 2;
    const beatIndex = getModulo(Math.floor(beat), params.period);
    const rippleRandom = createRandom(hashSeed(RIPPLE_SEED, beatIndex));
    const rippleX = getRandomBetween(rippleRandom, 10, WIDTH - 10);
    const rippleAge = getCycle(beat);
    const getSurface = (x: number) =>
      surface +
      params.waves * (1.2 * Math.sin(x * 0.18 + phase * 2) + 0.7 * Math.sin(x * 0.41 - phase * 3)) -
      kick *
        3 *
        Math.cos((x - rippleX) * 0.25) *
        Math.exp(-(((x - rippleX) / (6 + rippleAge * 30)) ** 2));

    for (let x = 0; x < WIDTH; x++) {
      const top = getSurface(x);
      for (let y = Math.max(0, Math.floor(top)); y < HEIGHT; y++) {
        const depth = (y - top) / Math.max(1, HEIGHT - top);
        const texture = getSmoothNoise2d(TEXTURE_SEED, x / 6 + Math.sin(phase) * 0.4, y / 4);
        const base = getMixedColor(color, DRIED_COLOR, depth * 0.7);
        let shade = 0.65 + 0.35 * texture;
        if (y - top < 1) {
          shade = 1.5 + kick * 0.4;
        } else if (y - top < 2.5) {
          shade += 0.25;
        }
        setRgbaPixel(image, x, y, getScaledColor(base, shade));
      }
    }

    const cycles = Math.max(1, Math.round(params.period / BUBBLE_BEATS));
    for (let index = 0; index < params.bubbles; index++) {
      const random = createRandom(hashSeed(BUBBLE_SEED, index));
      const offset = random();
      const bubbleCycle = beat / BUBBLE_BEATS + offset;
      const round = getModulo(Math.floor(bubbleCycle), cycles);
      const roundRandom = createRandom(hashSeed(BUBBLE_SEED, index, round));
      const x = getRandomBetween(roundRandom, 2, WIDTH - 2);
      const rise = getCycle(bubbleCycle);
      const bottom = HEIGHT + 2;
      const y = bottom - rise * (bottom - getSurface(x));
      const wobbleX = x + Math.sin(rise * 12 + offset * 10) * 0.8;
      if (y < getSurface(wobbleX) + 1) {
        continue;
      }
      const size = roundRandom() < 0.3 ? 2 : 1;
      for (let offsetY = 0; offsetY < size; offsetY++) {
        for (let offsetX = 0; offsetX < size; offsetX++) {
          setRgbaPixel(
            image,
            Math.round(wobbleX) + offsetX,
            Math.round(y) + offsetY,
            getScaledColor(color, 1.6),
          );
        }
      }
    }
  },
});

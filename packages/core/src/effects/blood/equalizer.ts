import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
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
  getNoise,
  getScaledColor,
} from "./shared.ts";

const JITTER_SEED = 0xb10a0;
const TEXTURE_SEED = 0xb10a1;
const SPRAY_SEED = 0xb10a2;
const PEAK_GRAVITY = 260;
const PEAK_SAMPLES = 32;
const SPRAY_GRAVITY = 260;
const SPRAY_LIFE = 1;

export const equalizerStyles = ["bottom", "center"] as const;

function getLevel(band: number, beat: number): number {
  const kick = getEnvelope(beat, 6);
  const snare = getEnvelope((beat - 1) / 2, 3.5);
  const isRoll = getModulo(Math.floor(beat), 4) === 3;
  const hat = getEnvelope(beat * (isRoll ? 8 : 4), 1.5) * (isRoll ? 1 : 0.8);
  const jitter = 0.15 * getNoise(JITTER_SEED, Math.round(band * 100), Math.floor(beat * 4));
  const level =
    (1 - band) ** 2 * kick + 4 * band * (1 - band) * snare * 0.9 + band ** 2 * hat * 0.7 + jitter;
  return Math.min(1, level);
}

export const bloodEqualizer = defineEffect({
  id: "blood-equalizer",
  name: "Blood equalizer",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    bars: z.number().int().min(4).max(16).default(8),
    style: z.enum(equalizerStyles).default("bottom"),
    spray: z.number().int().min(0).max(16).default(4),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const barWidth = WIDTH / params.bars;
    const maxHeight = params.style === "center" ? HEIGHT : HEIGHT - 6;
    const getHeight = (bar: number, at: number) =>
      Math.round(2 + getLevel(bar / (params.bars - 1), at) * (maxHeight - 2));

    for (let bar = 0; bar < params.bars; bar++) {
      const left = Math.round(bar * barWidth);
      const right = Math.round((bar + 1) * barWidth) - 2;
      const height = getHeight(bar, beat);
      const top = params.style === "center" ? Math.round((HEIGHT - height) / 2) : HEIGHT - height;
      for (let y = top; y < top + height; y++) {
        const edge = Math.min(y - top, top + height - 1 - y);
        const isCap = params.style === "center" ? edge < 1 : y === top;
        for (let x = left; x <= right; x++) {
          const shade = isCap ? 1.15 : 0.5 + 0.25 * getNoise(TEXTURE_SEED, x, y);
          setRgbaPixel(image, x, y, getScaledColor(color, shade));
        }
      }
      if (params.style === "bottom") {
        let peak = height;
        for (let sample = 1; sample <= PEAK_SAMPLES; sample++) {
          const ago = sample / PEAK_SAMPLES;
          peak = Math.max(peak, getHeight(bar, beat - ago) - 0.5 * PEAK_GRAVITY * ago ** 2);
        }
        const peakY = HEIGHT - Math.round(peak) - 2;
        for (let x = left; x <= right; x++) {
          setRgbaPixel(image, x, peakY, getScaledColor(color, 0.95));
        }
      }
    }

    const sprayBars = Math.ceil(params.bars / 2);
    for (let hit = Math.floor(beat - SPRAY_LIFE) + 1; hit <= Math.floor(beat); hit++) {
      const age = beat - hit;
      const random = createRandom(hashSeed(SPRAY_SEED, getModulo(hit, 16)));
      for (let bar = 0; bar < sprayBars; bar++) {
        const height = getHeight(bar, hit);
        const originY = params.style === "center" ? (HEIGHT - height) / 2 : HEIGHT - height;
        for (let index = 0; index < params.spray; index++) {
          const origin: Point = [(bar + random()) * barWidth, originY];
          const velocity: Point = [
            getRandomBetween(random, -25, 25),
            -getRandomBetween(random, 40, 100),
          ];
          const head = getBallisticPosition(origin, velocity, SPRAY_GRAVITY, age);
          const tail = getBallisticPosition(
            origin,
            velocity,
            SPRAY_GRAVITY,
            Math.max(0, age - 0.04),
          );
          const particleColor = getScaledColor(
            color,
            getRandomBetween(random, 0.8, 1.2) * (1 - age),
          );
          drawStreak(image, tail, head, particleColor);
          drawDot(image, head, 1, particleColor);
        }
      }
    }
  },
});

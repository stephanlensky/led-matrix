import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { EYE_HALF_HEIGHT, EYE_HALF_WIDTH, EYE_OFFSET, getEyeColor } from "./cat.ts";

const EYES_SEED = 0xe7e5;
const SAMPLES = 3;
const LIFETIME = 8;
const HALF_SPAN = EYE_OFFSET + EYE_HALF_WIDTH;
const SLOTS = [
  [17, 15],
  [47, 22],
  [19, 45],
  [46, 50],
  [32, 32],
] as const;

type EyePair = {
  x: number;
  y: number;
  scale: number;
  blink: number;
  level: number;
  color: Color;
  highlight: Color;
};

function getCycle(value: number): number {
  return ((value % 1) + 1) % 1;
}

function getBlink(phase: number, width = 0.05): number {
  const distance = Math.abs(phase - 0.5) / width;
  return distance < 1 ? easings.easeInOutSine(1 - distance) : 0;
}

function getHighlight([r, g, b]: Color): Color {
  return [r + (255 - r) * 0.8, g + (255 - g) * 0.8, b + (255 - b) * 0.8];
}

function getEyePairs(
  count: number,
  period: number,
  beat: number,
  colors: readonly Color[],
  scale: number,
): EyePair[] {
  const generations = Math.max(1, Math.round(period / LIFETIME));
  return Array.from({ length: Math.min(count, SLOTS.length) }, (_, index) => {
    const offset = (index / count) * LIFETIME;
    const generation = Math.floor((beat + offset) / LIFETIME);
    const age = (beat + offset) / LIFETIME - generation;
    const random = createRandom(
      hashSeed(EYES_SEED, index, getCycle(generation / generations) * generations),
    );
    const [slotX, slotY] = SLOTS[index] ?? [WIDTH / 2, HEIGHT / 2];
    const color = colors[Math.floor(random() * colors.length)] ?? [0, 255, 0];
    const open = easings.easeOutCubic(Math.min(1, age * 10, (1 - age) * 10));
    return {
      x: slotX + getRandomBetween(random, -3, 3),
      y: slotY + getRandomBetween(random, -2, 2),
      scale: scale * getRandomBetween(random, 0.85, 1.1),
      blink: Math.max(1 - open, getBlink(getCycle(age * 2 + random() * 0.3), 0.08)),
      level: Math.min(1, age * 6, (1 - age) * 6),
      color,
      highlight: getHighlight(color),
    };
  });
}

function getPairColor(pair: EyePair, x: number, y: number): Color | undefined {
  const eyeX = WIDTH / 2 + (x - pair.x) / pair.scale;
  const eyeY = HEIGHT / 2 + (y - pair.y) / pair.scale;
  if (
    Math.abs(eyeX - WIDTH / 2) > HALF_SPAN ||
    Math.abs(eyeY - HEIGHT / 2) > EYE_HALF_HEIGHT * 1.6
  ) {
    return undefined;
  }
  return getEyeColor(eyeX, eyeY, pair.blink, pair.color, pair.highlight);
}

export const catEyes = defineEffect({
  id: "cat-eyes",
  name: "Cat eyes",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color1: colorSchema.default("#30e830"),
    color2: colorSchema.default("#f0b020"),
    count: z.number().int().min(1).max(5).default(3),
    scale: z.number().min(0.15).max(0.6).default(0.34),
    period: z.number().int().min(8).max(256).default(32),
    glow: z.number().min(0).max(1).default(0.25),
  }),
  render(image, { params, beat }) {
    const colors = [parseColor(params.color1), parseColor(params.color2)];
    const pairs = getEyePairs(params.count, params.period, beat, colors, params.scale);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        let [r, g, b, covered] = [0, 0, 0, 0];
        for (let sampleY = 0; sampleY < SAMPLES; sampleY++) {
          for (let sampleX = 0; sampleX < SAMPLES; sampleX++) {
            const pointX = x + (sampleX + 0.5) / SAMPLES;
            const pointY = y + (sampleY + 0.5) / SAMPLES;
            for (const pair of pairs) {
              const color = getPairColor(pair, pointX, pointY);
              if (!color) {
                continue;
              }
              r += color[0] * pair.level;
              g += color[1] * pair.level;
              b += color[2] * pair.level;
              covered++;
              break;
            }
          }
        }
        let glow = 0;
        let glowColor: Color = [0, 0, 0];
        for (const pair of pairs) {
          const reach = HALF_SPAN * pair.scale;
          const distance = Math.hypot(x + 0.5 - pair.x, (y + 0.5 - pair.y) * 2.2);
          const amount =
            params.glow * pair.level * (1 - pair.blink) * Math.max(0, 1 - distance / reach) ** 2;
          if (amount > glow) {
            glow = amount;
            glowColor = pair.color;
          }
        }
        const coverage = covered / (SAMPLES * SAMPLES);
        if (coverage === 0 && glow < 0.01) {
          continue;
        }
        const eye: Color = covered > 0 ? [r / covered, g / covered, b / covered] : glowColor;
        const alpha = coverage + glow * (1 - coverage);
        const amount = coverage / alpha;
        setRgbaPixel(
          image,
          x,
          y,
          [
            glowColor[0] + (eye[0] - glowColor[0]) * amount,
            glowColor[1] + (eye[1] - glowColor[1]) * amount,
            glowColor[2] + (eye[2] - glowColor[2]) * amount,
          ],
          alpha * 255,
        );
      }
    }
  },
});

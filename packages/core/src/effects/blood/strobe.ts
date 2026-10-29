import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  type Point,
  drawDot,
  getAngleDifference,
  getModulo,
  getNoise,
  getScaledColor,
} from "./shared.ts";

const SPLAT_SEED = 0xb10d0;
const TEXTURE_SEED = 0xb10d1;

export const bloodStrobe = defineEffect({
  id: "blood-strobe",
  name: "Blood strobe",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    every: z.number().min(0.125).max(4).default(0.5),
    decay: z.number().min(1).max(30).default(7),
    size: z.number().min(0.3).max(2).default(1),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const hit = Math.floor(beat / params.every);
    const age = beat - hit * params.every;
    const hitsPerPeriod = Math.max(1, Math.round(params.period / params.every));
    const random = createRandom(hashSeed(SPLAT_SEED, getModulo(hit, hitsPerPeriod)));
    const brightness = 1.35 * Math.exp(-age * params.decay);
    const centerX = getRandomBetween(random, 18, WIDTH - 18);
    const centerY = getRandomBetween(random, 18, HEIGHT - 18);
    const radius = getRandomBetween(random, 10, 18) * params.size;
    const phases = [random(), random(), random()].map((value) => value * Math.PI * 2);
    const rays = Array.from({ length: Math.round(getRandomBetween(random, 6, 12)) }, () => ({
      angle: random() * Math.PI * 2,
      width: getRandomBetween(random, 0.08, 0.2),
      length: radius * getRandomBetween(random, 0.6, 1.8),
    }));
    const getEdge = (angle: number) =>
      radius *
        (1 +
          0.22 * Math.sin(3 * angle + (phases[0] ?? 0)) +
          0.12 * Math.sin(7 * angle + (phases[1] ?? 0)) +
          0.06 * Math.sin(11 * angle + (phases[2] ?? 0))) +
      rays.reduce(
        (sum, ray) =>
          sum + ray.length * Math.max(0, 1 - getAngleDifference(angle, ray.angle) / ray.width) ** 2,
        0,
      );

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const offsetX = x - centerX;
        const offsetY = y - centerY;
        const distance = Math.hypot(offsetX, offsetY);
        const edge = getEdge(Math.atan2(offsetY, offsetX));
        if (distance <= edge) {
          const shade =
            brightness *
            (0.7 + 0.3 * getNoise(TEXTURE_SEED, x, y)) *
            (edge - distance < 1 ? 0.7 : 1);
          setRgbaPixel(image, x, y, getScaledColor(color, shade));
        }
      }
    }
    for (let index = 0; index < 24; index++) {
      const angle = random() * Math.PI * 2;
      const distance = radius * getRandomBetween(random, 1.2, 2.6);
      const point: Point = [
        centerX + Math.cos(angle) * distance,
        centerY + Math.sin(angle) * distance,
      ];
      drawDot(
        image,
        point,
        Math.round(getRandomBetween(random, 1, 3)),
        getScaledColor(color, brightness * 0.9),
      );
    }
  },
});

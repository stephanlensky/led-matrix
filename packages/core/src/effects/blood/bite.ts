import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import type { Color } from "../../frame.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  type Point,
  getCycle,
  getEnvelope,
  getMixedColor,
  getScaledColor,
  getSmoothNoise2d,
} from "./shared.ts";

const RIVULET_SEED = 0xb1150;
const BRUISE_SEED = 0xb1151;
const BRUISE_COLOR: Color = [46, 4, 18];
const HOLE_COLOR: Color = [12, 0, 0];
const HOLES: readonly Point[] = [
  [24.5, 20],
  [39.5, 20],
];
const DUB = 0.28;

export const bloodBite = defineEffect({
  id: "blood-bite",
  name: "Vampire bite",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    level: z.number().min(0).max(1).default(1),
    pulse: z.number().min(0).max(1).default(0.6),
    rivulets: z.number().int().min(1).max(4).default(3),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const heartbeat =
      params.pulse *
      (getEnvelope(beat, 7) + (getCycle(beat) >= DUB ? 0.6 * getEnvelope(beat - DUB, 7) : 0));
    const holeRadius = 2.2 + heartbeat * 0.5;
    const bruiseRadius = 5 + params.level * 4;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        for (const [holeX, holeY] of HOLES) {
          const distance = Math.hypot(x - holeX, y - holeY);
          if (distance > bruiseRadius + 2) {
            continue;
          }
          const noise = getSmoothNoise2d(BRUISE_SEED, x / 2, y / 2);
          if (distance <= holeRadius * 0.6) {
            setRgbaPixel(image, x, y, HOLE_COLOR);
          } else if (distance <= holeRadius + 0.8) {
            setRgbaPixel(image, x, y, getScaledColor(color, 1.2 + heartbeat * 0.6));
          } else {
            const bruise = Math.max(0, 1 - (distance - holeRadius) / (bruiseRadius + 2 * noise));
            if (bruise > 0) {
              setRgbaPixel(image, x, y, getScaledColor(BRUISE_COLOR, bruise * (0.6 + 0.6 * noise)));
            }
          }
        }
      }
    }

    for (const [holeIndex, [holeX, holeY]] of HOLES.entries()) {
      for (let index = 0; index < params.rivulets; index++) {
        const random = createRandom(hashSeed(RIVULET_SEED, holeIndex, index));
        const startX = holeX + (index - (params.rivulets - 1) / 2) * 1.5;
        const drift =
          (index - (params.rivulets - 1) / 2) * 0.25 + getRandomBetween(random, -0.1, 0.1);
        const wiggle = getRandomBetween(random, 0.8, 2);
        const phase = random() * Math.PI * 2;
        const delay = index * 0.15;
        const growth = Math.max(0, Math.min(1, (params.level - delay) / (1 - delay)));
        const length =
          growth * getRandomBetween(random, 22, HEIGHT - holeY - 2) + heartbeat * 2 * growth;
        const travel = getCycle(beat) * (length + 10);
        const getX = (along: number) =>
          startX + drift * along + wiggle * Math.sin(along * 0.22 + phase) * Math.min(1, along / 6);
        for (let along = 0; along < length; along++) {
          const x = getX(along);
          const y = holeY + holeRadius + along;
          const glow = params.pulse * 0.6 * Math.exp(-(((along - travel) / 3) ** 2));
          const shade = 0.9 - (along / HEIGHT) * 0.35 + glow;
          const width = along < length * 0.4 ? 2 : 1;
          for (let column = 0; column < width; column++) {
            setRgbaPixel(
              image,
              Math.round(x) + column,
              Math.round(y),
              getScaledColor(color, shade),
            );
          }
        }
        if (growth > 0.1) {
          const tipX = Math.round(getX(length));
          const tipY = Math.round(holeY + holeRadius + length);
          const tip = getMixedColor(getScaledColor(color, 1.1), [255, 255, 255], 0.08);
          for (const [offsetX, offsetY] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ] as const) {
            setRgbaPixel(image, tipX + offsetX, tipY + offsetY, tip);
          }
        }
      }
    }
  },
});

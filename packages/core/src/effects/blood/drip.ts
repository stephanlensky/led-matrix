import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  drawDrip,
  getCycle,
  getMixedColor,
  getNoise,
  getScaledColor,
  getSmoothNoise,
} from "./shared.ts";

const DRIP_SEED = 0xb100d;
const EDGE_SEED = 0xb100e;
const TEXTURE_SEED = 0xb100f;
const POOL_SEED = 0xb1010;

export const bloodDrip = defineEffect({
  id: "blood-drip",
  name: "Blood drip",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    count: z.number().int().min(0).max(48).default(14),
    beats: z.number().int().min(1).max(32).default(4),
    length: z.number().int().min(2).max(40).default(10),
    band: z.number().int().min(0).max(24).default(3),
    pool: z.number().int().min(0).max(16).default(2),
    trail: z.number().min(0).max(1).default(0.5),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const getBandBottom = (x: number) =>
      params.band === 0 ? 0 : params.band + Math.round(getSmoothNoise(EDGE_SEED, x / 5) * 3);

    for (let index = 0; index < params.count; index++) {
      const random = createRandom(hashSeed(DRIP_SEED, index));
      const x = Math.floor(((index + getRandomBetween(random, 0.1, 0.9)) / params.count) * WIDTH);
      const width = random() < 0.3 ? 2 : 1;
      const length = Math.round(params.length * getRandomBetween(random, 0.5, 1));
      const period = params.beats * (random() < 0.5 ? 1 : 2);
      drawDrip(image, {
        x,
        top: getBandBottom(x),
        width,
        length,
        cycle: getCycle(beat / period + random()),
        trail: params.trail,
        color,
      });
    }

    for (let x = 0; x < WIDTH; x++) {
      const bottom = getBandBottom(x);
      for (let y = 0; y < bottom; y++) {
        const dryness = 0.5 * (1 - y / bottom);
        const shade = 0.55 + 0.35 * getNoise(TEXTURE_SEED, x, y);
        setRgbaPixel(
          image,
          x,
          y,
          getScaledColor(getMixedColor(color, DRIED_COLOR, dryness), shade),
        );
      }
      if (params.pool === 0) {
        continue;
      }
      const ripple = Math.sin(x * 0.35 + beat * Math.PI * 0.5) * 0.6;
      const poolTop =
        HEIGHT - params.pool - Math.round(getSmoothNoise(POOL_SEED, x / 7) * 2 + ripple);
      for (let y = poolTop; y < HEIGHT; y++) {
        const shade = (y === poolTop ? 0.85 : 0.5) + 0.2 * getNoise(TEXTURE_SEED, x, y + 100);
        setRgbaPixel(image, x, y, getScaledColor(color, shade));
      }
    }
  },
});

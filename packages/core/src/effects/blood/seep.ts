import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  getEnvelope,
  getMixedColor,
  getNoise,
  getScaledColor,
  getSmoothNoise,
} from "./shared.ts";

const EDGE_SEED = 0xb1110;
const DETAIL_SEED = 0xb1111;
const TEXTURE_SEED = 0xb1112;
const DRIP_SEED = 0xb1113;
const MAX_DEPTH = 18;

export const bloodSeep = defineEffect({
  id: "blood-seep",
  name: "Seeping ceiling",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    level: z.number().min(0).max(1).default(1),
    drip: z.number().min(0).max(1).default(1),
    drips: z.number().int().min(0).max(24).default(11),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const wobble = (beat / params.period) * Math.PI * 2;
    const swell = getEnvelope(beat, 4) * params.drip;
    const edges = Array.from({ length: WIDTH }, (_, x) => {
      const depth =
        params.level *
        (MAX_DEPTH * (0.4 + 0.6 * getSmoothNoise(EDGE_SEED, x / 7)) +
          2 * getSmoothNoise(DETAIL_SEED, x / 2.5) +
          0.8 * Math.sin(wobble + x * 0.35));
      return Math.max(0, depth);
    });

    for (let x = 0; x < WIDTH; x++) {
      const edge = edges[x] ?? 0;
      for (let y = 0; y < Math.ceil(edge); y++) {
        const depth = y / Math.max(1, edge);
        const noise = getNoise(TEXTURE_SEED, x, y);
        const base = getMixedColor(DRIED_COLOR, color, 0.3 + 0.7 * depth);
        const isRim = edge - y < 1.5;
        const shade = isRim ? 1.25 : 0.65 + 0.3 * noise;
        setRgbaPixel(image, x, y, getScaledColor(base, shade));
      }
    }

    for (let index = 0; index < params.drips; index++) {
      const random = createRandom(hashSeed(DRIP_SEED, index));
      const x = Math.round(((index + getRandomBetween(random, 0.2, 0.8)) / params.drips) * WIDTH);
      const edge = edges[x] ?? 0;
      if (edge < 2) {
        continue;
      }
      const growth = Math.max(0, Math.min(1, params.drip * 1.3 - random() * 0.3));
      const length = growth * getRandomBetween(random, 4, 15) + swell * 1.5;
      const radius = (0.6 + 1.3 * growth) * (1 + 0.2 * swell);
      const tipY = edge + length;
      for (let y = Math.floor(edge); y < tipY; y++) {
        const shade = 0.85 - ((y - edge) / Math.max(1, length)) * 0.2;
        setRgbaPixel(image, x, y, getScaledColor(color, shade));
      }
      if (growth <= 0.05) {
        continue;
      }
      const reach = Math.ceil(radius);
      for (let offsetY = -reach; offsetY <= reach; offsetY++) {
        for (let offsetX = -reach; offsetX <= reach; offsetX++) {
          const distance = Math.hypot(offsetX, offsetY * 0.85);
          if (distance <= radius) {
            const isHighlight = offsetX === -1 && offsetY === -1 && radius > 1.4;
            setRgbaPixel(
              image,
              x + offsetX,
              Math.round(tipY + offsetY),
              isHighlight ? getScaledColor(color, 2) : getScaledColor(color, 1.05 - distance * 0.1),
            );
          }
        }
      }
    }
  },
});

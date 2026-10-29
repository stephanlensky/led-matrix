import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  getMixedColor,
  getModulo,
  getNoise,
  getScaledColor,
  getSmoothNoise2d,
} from "./shared.ts";

const RING_SEED = 0xb11a0;
const TEXTURE_SEED = 0xb11a1;
const MIN_RADIUS = 1.5;
const MAX_RADIUS = 50;

export const bloodTunnel = defineEffect({
  id: "blood-tunnel",
  name: "Splatter tunnel",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    every: z.number().min(0.25).max(4).default(1),
    wallEvery: z.number().int().min(0).max(16).default(4),
    travelBeats: z.number().min(0.5).max(8).default(4),
    sway: z.number().min(0).max(12).default(5),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const swayPhase = (beat / params.period) * Math.PI * 2;
    const centerX = WIDTH / 2 - 0.5 + params.sway * Math.sin(swayPhase);
    const centerY = HEIGHT / 2 - 0.5 + params.sway * 0.6 * Math.sin(swayPhase * 2);
    const perPeriod = Math.max(1, Math.round(params.period / params.every));
    const ringsPerWall =
      params.wallEvery > 0 ? Math.max(1, Math.round(params.wallEvery / params.every)) : 0;
    const last = Math.floor(beat / params.every);
    const rings: { radius: number; isWall: boolean; seed: number; shade: number }[] = [];
    for (
      let index = last;
      index > last - 2 * Math.ceil(params.travelBeats / params.every) - 2;
      index--
    ) {
      const age = beat - index * params.every;
      const radius = MIN_RADIUS * (MAX_RADIUS / MIN_RADIUS) ** (age / params.travelBeats);
      if (radius > MAX_RADIUS) {
        break;
      }
      rings.push({
        radius,
        isWall: ringsPerWall > 0 && getModulo(index, ringsPerWall) === 0,
        seed: hashSeed(RING_SEED, getModulo(index, perPeriod)),
        shade: Math.min(1.4, 0.45 + radius / 25),
      });
    }
    rings.reverse();

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const offsetX = x - centerX;
        const offsetY = y - centerY;
        const distance = Math.hypot(offsetX, offsetY);
        const cos = offsetX / (distance || 1);
        const sin = offsetY / (distance || 1);
        for (const ring of rings) {
          const noise = getSmoothNoise2d(ring.seed, cos * 3 + 10, sin * 3 + 10);
          const fine = getSmoothNoise2d(ring.seed + 1, cos * 9 + 10, sin * 9 + 10);
          const thickness = ring.radius * (ring.isWall ? 0.3 : 0.1 + 0.25 * noise ** 2) + 1;
          const outer = ring.radius + thickness * (0.5 + 0.5 * fine);
          const inner = ring.radius - (ring.isWall ? thickness : thickness * 0.3);
          if (distance < inner || distance > outer || (!ring.isWall && noise < 0.25)) {
            continue;
          }
          const texture = 0.7 + 0.3 * getNoise(TEXTURE_SEED, x, y);
          const edge = outer - distance < 1 ? 0.6 : 1;
          const base = ring.isWall ? color : getMixedColor(color, DRIED_COLOR, 0.25);
          setRgbaPixel(
            image,
            x,
            y,
            getScaledColor(base, ring.shade * texture * edge * (ring.isWall ? 1.3 : 1)),
          );
          break;
        }
      }
    }
  },
});

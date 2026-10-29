import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { type Color, HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { type Random, createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import { getCycle, getMixedColor, getNoise, getScaledColor } from "./shared.ts";

const VEIN_SEED = 0xb1060;
const TEXTURE_SEED = 0xb1061;
const MAX_DISTANCE = 56;
const BRANCH_CHANCE = 0.07;
const DUB_OFFSET = 0.28;
const DRAIN_FRONT = 3;
const WHITE: Color = [255, 255, 255];

type VeinPixel = { x: number; y: number; distance: number; isTrunk: boolean };

const veinCache = new Map<number, readonly VeinPixel[]>();

function addBranch(
  pixels: Map<string, VeinPixel>,
  random: Random,
  start: { x: number; y: number; angle: number; distance: number; depth: number; length: number },
): void {
  let { x, y, angle, distance } = start;
  for (let step = 0; step < start.length; step++) {
    x += Math.cos(angle);
    y += Math.sin(angle);
    distance++;
    angle += getRandomBetween(random, -0.35, 0.35);
    const pixelX = Math.round(x);
    const pixelY = Math.round(y);
    const key = `${pixelX},${pixelY}`;
    if (pixelX < 0 || pixelY < 0 || pixelX >= WIDTH || pixelY >= HEIGHT || pixels.has(key)) {
      continue;
    }
    pixels.set(key, {
      x: pixelX,
      y: pixelY,
      distance,
      isTrunk: start.depth === 0 && step < start.length * 0.4,
    });
    if (start.depth < 2 && random() < BRANCH_CHANCE) {
      addBranch(pixels, random, {
        x,
        y,
        angle: angle + (random() < 0.5 ? -1 : 1) * getRandomBetween(random, 0.5, 1.1),
        distance,
        depth: start.depth + 1,
        length: Math.round((start.length - step) * getRandomBetween(random, 0.4, 0.8)),
      });
    }
  }
}

function getVeins(count: number): readonly VeinPixel[] {
  const cached = veinCache.get(count);
  if (cached) {
    return cached;
  }
  const pixels = new Map<string, VeinPixel>();
  for (let index = 0; index < count; index++) {
    const random = createRandom(hashSeed(VEIN_SEED, index));
    const side = index % 4;
    const along = getRandomBetween(random, 0.1, 0.9) * WIDTH;
    const [x, y, angle] =
      side === 0
        ? [along, -1, Math.PI / 2]
        : side === 1
          ? [WIDTH, along, Math.PI]
          : side === 2
            ? [along, HEIGHT, -Math.PI / 2]
            : [-1, along, 0];
    addBranch(pixels, random, {
      x,
      y,
      angle: angle + getRandomBetween(random, -0.5, 0.5),
      distance: 0,
      depth: 0,
      length: Math.round(getRandomBetween(random, 18, 40)),
    });
  }
  const veins = [...pixels.values()];
  veinCache.set(count, veins);
  return veins;
}

function getHeartbeat(beat: number, hasDub: boolean): number {
  const lub = Math.exp(-getCycle(beat) * 9);
  const dub = hasDub ? 0.6 * Math.exp(-getCycle(beat - DUB_OFFSET) * 11) : 0;
  return Math.min(1, lub + dub);
}

export const bloodVeins = defineEffect({
  id: "blood-veins",
  name: "Veins",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#7a0614"),
    count: z.number().int().min(1).max(24).default(10),
    growth: z.number().min(0).max(1).default(1),
    drain: z.number().min(0).max(1).default(0),
    pulse: z.number().min(0).max(1).default(0.7),
    speed: z.number().min(4).max(200).default(48),
    heartbeat: z.boolean().default(true),
    vignette: z.number().min(0).max(1).default(0.3),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    if (params.vignette > 0) {
      const strength =
        params.vignette * (1 - params.drain) * (0.25 + 0.75 * getHeartbeat(beat, params.heartbeat));
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const edge =
            Math.max(Math.abs(x - WIDTH / 2 + 0.5), Math.abs(y - HEIGHT / 2 + 0.5)) / (WIDTH / 2);
          const glow = Math.max(0, (edge - 0.55) / 0.45) ** 2 * strength * 0.35;
          if (glow > 0.01) {
            setRgbaPixel(image, x, y, getScaledColor(color, glow));
          }
        }
      }
    }
    const reach = params.growth * MAX_DISTANCE;
    const drained = params.drain * MAX_DISTANCE;
    for (const { x, y, distance, isTrunk } of getVeins(params.count)) {
      if (distance > reach || (params.drain > 0 && distance < drained)) {
        continue;
      }
      if (params.drain > 0 && distance - drained < DRAIN_FRONT) {
        const heat = 1 - (distance - drained) / DRAIN_FRONT;
        setRgbaPixel(image, x, y, getMixedColor(color, WHITE, 0.2 + 0.5 * heat));
        continue;
      }
      const wave = getHeartbeat(beat - distance / params.speed, params.heartbeat);
      const isFront = reach - distance < 2 && params.growth < 1;
      const shade =
        0.4 +
        0.15 * getNoise(TEXTURE_SEED, x, y) +
        (isTrunk ? 0.1 : 0) +
        params.pulse * wave * 0.8 +
        (isFront ? 0.3 : 0);
      setRgbaPixel(image, x, y, getScaledColor(color, shade));
    }
  },
});

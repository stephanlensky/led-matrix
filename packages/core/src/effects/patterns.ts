import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH, fillRgbaImage, setRgbaPixel } from "../frame.ts";
import { createRandom, hashSeed } from "../random.ts";
import { getPalette, getPaletteColor, mixColors, paletteParams } from "./palette.ts";

const stripeAngles = ["vertical", "horizontal", "diagonal", "anti-diagonal"] as const;
const ringShapes = ["circle", "square", "diamond"] as const;

type StripeAngle = (typeof stripeAngles)[number];
type RingShape = (typeof ringShapes)[number];

function getStripePosition(angle: StripeAngle, x: number, y: number): number {
  if (angle === "vertical") {
    return x;
  }
  if (angle === "horizontal") {
    return y;
  }
  return angle === "diagonal" ? x + y : x - y + WIDTH;
}

function getRingDistance(shape: RingShape, x: number, y: number): number {
  const dx = Math.abs(x + 0.5 - WIDTH / 2);
  const dy = Math.abs(y + 0.5 - HEIGHT / 2);
  if (shape === "square") {
    return Math.max(dx, dy);
  }
  return shape === "diamond" ? (dx + dy) / Math.SQRT2 : Math.hypot(dx, dy);
}

export const checker = defineEffect({
  id: "checker",
  name: "Checker",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...paletteParams,
    size: z.number().int().min(1).max(32).default(8),
    swapsPerBeat: z.number().min(0).max(16).default(1),
  }),
  render(image, { params, beat }) {
    const palette = getPalette(params);
    const swap = Math.floor(beat * params.swapsPerBeat);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const parity = (Math.floor(x / params.size) + Math.floor(y / params.size)) % 2;
        setRgbaPixel(image, x, y, getPaletteColor(palette, parity + swap));
      }
    }
  },
});

export const stripes = defineEffect({
  id: "stripes",
  name: "Stripes",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...paletteParams,
    width: z.number().int().min(1).max(32).default(6),
    angle: z.enum(stripeAngles).default("diagonal"),
    cycles: z.number().int().min(-32).max(32).default(1),
  }),
  render(image, { params, progress }) {
    const palette = getPalette(params);
    const offset = progress * params.cycles * params.width * palette.length;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const position = getStripePosition(params.angle, x, y) - offset;
        setRgbaPixel(image, x, y, getPaletteColor(palette, position / params.width));
      }
    }
  },
});

export const rings = defineEffect({
  id: "rings",
  name: "Rings",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...paletteParams,
    width: z.number().int().min(1).max(32).default(5),
    shape: z.enum(ringShapes).default("circle"),
    cycles: z.number().int().min(-32).max(32).default(1),
  }),
  render(image, { params, progress }) {
    const palette = getPalette(params);
    const offset = progress * params.cycles * params.width * palette.length;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const distance = getRingDistance(params.shape, x, y) - offset;
        setRgbaPixel(image, x, y, getPaletteColor(palette, distance / params.width));
      }
    }
  },
});

export const twinkle = defineEffect({
  id: "twinkle",
  name: "Twinkle",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...paletteParams,
    perBeat: z.number().int().min(1).max(512).default(48),
    decay: z.number().min(0.05).max(4).default(0.75),
    size: z.number().int().min(1).max(4).default(1),
    period: z.number().int().min(1).max(256).default(4),
    background: colorSchema.optional(),
  }),
  render(image, { params, beat }) {
    const palette = getPalette(params);
    const background = params.background === undefined ? undefined : parseColor(params.background);
    if (background) {
      fillRgbaImage(image, background);
    }
    const brightness = new Float32Array(WIDTH * HEIGHT);
    const colors: Color[] = Array.from({ length: WIDTH * HEIGHT });
    const firstBeat = Math.floor(beat - params.decay);
    for (let spawnBeat = firstBeat; spawnBeat <= Math.floor(beat); spawnBeat++) {
      const seed = ((spawnBeat % params.period) + params.period) % params.period;
      const random = createRandom(hashSeed(seed, params.perBeat));
      for (let index = 0; index < params.perBeat; index++) {
        const left = Math.floor(random() * (WIDTH - params.size + 1));
        const top = Math.floor(random() * (HEIGHT - params.size + 1));
        const age = beat - spawnBeat - random();
        const color = getPaletteColor(palette, random() * palette.length);
        if (age < 0 || age >= params.decay) {
          continue;
        }
        const value = 1 - age / params.decay;
        for (let y = top; y < top + params.size; y++) {
          for (let x = left; x < left + params.size; x++) {
            const pixel = y * WIDTH + x;
            if (value > (brightness[pixel] ?? 0)) {
              brightness[pixel] = value;
              colors[pixel] = color;
            }
          }
        }
      }
    }
    for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
      const color = colors[pixel];
      const value = brightness[pixel] ?? 0;
      if (!color) {
        continue;
      }
      const x = pixel % WIDTH;
      const y = Math.floor(pixel / WIDTH);
      if (background) {
        setRgbaPixel(image, x, y, mixColors(background, color, value));
      } else {
        setRgbaPixel(image, x, y, color, value * 255);
      }
    }
  },
});

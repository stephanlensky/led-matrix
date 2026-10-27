import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH, fillRgbaImage, setRgbaPixel } from "../frame.ts";
import { createRandom, hashSeed } from "../random.ts";
import { getPalette, getPaletteColor, mixColors, paletteParams } from "./palette.ts";

const MAX_RADIUS = Math.hypot(WIDTH, HEIGHT) / 2 + 1;
const SAMPLE_STEP = 0.25;

export const hyperspace = defineEffect({
  id: "hyperspace",
  name: "Hyperspace",
  kind: "pixel",
  params: z.object({
    ...paletteParams,
    color1: colorSchema.default("#ffffff"),
    colorCount: z.number().int().min(1).max(4).default(1),
    perBeat: z.number().int().min(1).max(64).default(6),
    life: z.number().min(0.25).max(16).default(2),
    trail: z.number().min(0.02).max(1).default(0.3),
    startRadius: z.number().min(0).max(24).default(6),
    fadeIn: z.number().min(0).max(1).default(0.3),
    period: z.number().int().min(1).max(256).default(8),
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
    const getRadius = (age: number) => params.startRadius + age * (MAX_RADIUS - params.startRadius);
    const firstBeat = Math.floor(beat - params.life - params.trail * params.life);
    for (let spawnBeat = firstBeat; spawnBeat <= Math.floor(beat); spawnBeat++) {
      const seed = ((spawnBeat % params.period) + params.period) % params.period;
      const random = createRandom(hashSeed(seed, params.perBeat));
      for (let index = 0; index < params.perBeat; index++) {
        const angle = random() * Math.PI * 2;
        const age = (beat - spawnBeat - random()) / params.life;
        const color = getPaletteColor(palette, random() * palette.length);
        if (age < 0 || age - params.trail >= 1) {
          continue;
        }
        const head = getRadius(Math.min(age, 1));
        const tail = getRadius(Math.max(age - params.trail, 0));
        const level = params.fadeIn > 0 ? Math.min(age / params.fadeIn, 1) : 1;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        for (let radius = tail; radius <= head; radius += SAMPLE_STEP) {
          const x = Math.floor(WIDTH / 2 + dx * radius);
          const y = Math.floor(HEIGHT / 2 + dy * radius);
          if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
            continue;
          }
          const value = level * ((radius - tail) / Math.max(head - tail, SAMPLE_STEP)) ** 0.7;
          const pixel = y * WIDTH + x;
          if (value > (brightness[pixel] ?? 0)) {
            brightness[pixel] = value;
            colors[pixel] = color;
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

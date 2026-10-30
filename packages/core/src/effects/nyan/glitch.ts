import { z } from "zod";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, createRgbaImage } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  type NyanCatId,
  RAINBOW_COLORS,
  WHITE,
  drawNyan,
  drawRainbow,
  drawStars,
  fillBackground,
  getNyanFrame,
  nyanCatIds,
  nyanParams,
} from "./shared.ts";

const GLITCH_SEED = 0x9117;

export const nyanGlitch = defineEffect({
  id: "nyan-glitch",
  name: "Nyan glitch",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    intensity: z.number().min(0).max(1).default(0.7),
    every: z.number().min(0.25).max(4).default(1),
  }),
  render(image, { params, beat }) {
    const frame = getNyanFrame(beat, params.speed);
    const pulse = beat / params.every;
    const index = Math.floor(pulse);
    const since = (pulse - index) * params.every;
    const step = Math.floor(beat * 4);
    const random = createRandom(hashSeed(GLITCH_SEED, step));
    const big = Math.exp(-since * 5) * params.intensity;
    const small = params.intensity * (random() < 0.5 ? 0.4 : 0.1);
    const amount = Math.max(big, small);
    const clean = createRgbaImage();
    fillBackground(clean, [0, 0, 0]);
    drawStars(clean, frame, { count: 12 });
    const x = 15 + Math.round(getRandomBetween(random, -4, 4) * amount);
    const y = 21 + Math.round(getRandomBetween(random, -3, 3) * amount);
    drawRainbow(clean, x, y, frame);
    const cat: NyanCatId =
      amount > 0.5
        ? (nyanCatIds[Math.floor(random() * nyanCatIds.length)] ?? params.cat)
        : params.cat;
    if (amount > 0.35) {
      drawNyan(
        clean,
        params,
        x + Math.round(getRandomBetween(random, -16, 16)),
        y + Math.round(getRandomBetween(random, -18, 18)),
        frame + 3,
        { cat: nyanCatIds[(index + 1) % 3] ?? "black" },
      );
    }
    drawNyan(clean, params, x, y, frame, { cat });
    const split = Math.round(3 * amount);
    const slices = Array.from({ length: 16 }, () =>
      random() < 0.35 * amount * 2 ? Math.round(getRandomBetween(random, -14, 14) * amount) : 0,
    );
    const invert = amount > 0.6 && random() < 0.3;
    for (let row = 0; row < HEIGHT; row++) {
      const shift = slices[row >> 2] ?? 0;
      for (let column = 0; column < WIDTH; column++) {
        const offset = (row * WIDTH + column) * 4;
        const sample = (sx: number, channel: number): number => {
          const wrapped = ((sx % WIDTH) + WIDTH) % WIDTH;
          return clean[(row * WIDTH + wrapped) * 4 + channel] ?? 0;
        };
        const source = column - shift;
        let r = sample(source + split, 0);
        let g = sample(source, 1);
        let b = sample(source - split, 2);
        if (invert) {
          [r, g, b] = [255 - r, 255 - g, 255 - b];
        }
        image[offset] = r;
        image[offset + 1] = g;
        image[offset + 2] = b;
        image[offset + 3] = 255;
      }
    }
    const blocks = Math.round(amount * 6);
    for (let block = 0; block < blocks; block++) {
      const bx = Math.floor(random() * WIDTH);
      const by = Math.floor(random() * HEIGHT);
      const width = 2 + Math.floor(random() * 14);
      const height = 1 + Math.floor(random() * 4);
      const color = random() < 0.3 ? WHITE : (RAINBOW_COLORS[Math.floor(random() * 6)] ?? WHITE);
      for (let row = by; row < Math.min(HEIGHT, by + height); row++) {
        for (let column = bx; column < Math.min(WIDTH, bx + width); column++) {
          const offset = (row * WIDTH + column) * 4;
          image[offset] = color[0];
          image[offset + 1] = color[1];
          image[offset + 2] = color[2];
        }
      }
    }
  },
});

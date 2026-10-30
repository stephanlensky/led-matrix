import { z } from "zod";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH } from "../../frame.ts";
import { createRandom, hashSeed } from "../../random.ts";
import {
  MINI_HEIGHT,
  MINI_WIDTH,
  NYAN_HEIGHT,
  RAINBOW_COLORS,
  WHITE,
  drawMiniNyan,
  drawMiniRainbow,
  drawNyan,
  drawRainbow,
  drawStars,
  fillBackground,
  getNyanFrame,
  nyanCatIds,
  nyanParams,
  scaleColor,
} from "./shared.ts";

const SWARM_SEED = 0x7a3b;
const PASS_FRAMES = [12, 16, 24] as const;
const TRAIL = 22;

export const nyanStampede = defineEffect({
  id: "nyan-stampede",
  name: "Nyan stampede",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    count: z.number().int().min(4).max(40).default(14),
    mix: z.boolean().default(true),
    flash: z.number().min(0).max(1).default(0.8),
    every: z.number().min(0.5).max(8).default(4),
  }),
  render(image, { params, beat }) {
    const frame = getNyanFrame(beat, params.speed);
    const bar = beat / params.every;
    const since = (bar - Math.floor(bar)) * params.every;
    const color = RAINBOW_COLORS[Math.floor(bar) % RAINBOW_COLORS.length] ?? WHITE;
    fillBackground(image, scaleColor(color, since < 0.1 ? params.flash : 0));
    drawStars(image, frame, { count: 10 });
    const span = WIDTH + MINI_WIDTH + TRAIL;
    const cats = Array.from({ length: params.count }, (_, index) => {
      const random = createRandom(hashSeed(SWARM_SEED, index));
      const passFrames = PASS_FRAMES[Math.floor(random() * PASS_FRAMES.length)] ?? 16;
      const local = frame + Math.floor(random() * passFrames);
      const pass = Math.floor(local / passFrames);
      const passRandom = createRandom(hashSeed(SWARM_SEED, index, pass));
      const x = -MINI_WIDTH + ((local - pass * passFrames) / passFrames) * span;
      const y = Math.floor(passRandom() * (HEIGHT - MINI_HEIGHT + 4)) - 2;
      const cat = params.mix
        ? (nyanCatIds[Math.floor(passRandom() * nyanCatIds.length)] ?? "original")
        : params.cat;
      return { x: Math.round(x), y, cat, depth: passFrames, phase: index };
    }).toSorted((a, b) => b.depth - a.depth);
    for (const cat of cats) {
      drawMiniRainbow(image, cat.x, cat.y, frame + cat.phase, { length: TRAIL });
      drawMiniNyan(image, params, cat.x, cat.y, frame + cat.phase, { cat: cat.cat });
    }
    const leadX = Math.round(-34 + ((frame % 48) / 48) * (WIDTH + 34 + 40));
    const leadY = Math.round((HEIGHT - NYAN_HEIGHT) / 2);
    drawRainbow(image, leadX, leadY, frame, { length: 40 });
    drawNyan(image, params, leadX, leadY, frame);
  },
});

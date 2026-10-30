import { z } from "zod";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  NYAN_HEIGHT,
  RAINBOW_COLORS,
  WHITE,
  drawNyan,
  drawStar,
  drawStars,
  fillBackground,
  getNyanFrame,
  mixColor,
  nyanParams,
} from "./shared.ts";

const CAT_X = 28;
const BAND = 3;
const SPARK_SEED = 0x3a71;

export const nyanWave = defineEffect({
  id: "nyan-wave",
  name: "Nyan rainbow wave",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    every: z.number().min(0.25).max(4).default(1),
    amplitude: z.number().min(0).max(16).default(9),
    spread: z.number().min(0).max(4).default(2),
    waves: z.number().min(0.5).max(4).default(1.5),
  }),
  render(image, { params, beat }) {
    fillBackground(image, [0, 0, 0]);
    const frame = getNyanFrame(beat, params.speed);
    drawStars(image, frame, { count: 10 });
    const pulse = beat / params.every;
    const since = (pulse - Math.floor(pulse)) * params.every;
    const kick = Math.exp(-since * 6);
    const amplitude = 3 + params.amplitude * kick;
    const end = CAT_X + 14;
    const phase = beat * Math.PI;
    const center = HEIGHT / 2 - (BAND * RAINBOW_COLORS.length) / 2;
    const getTop = (x: number): number =>
      center +
      Math.sin(((end - x) / WIDTH) * params.waves * Math.PI * 2 + phase) *
        amplitude *
        ((end - x) / end);
    const spread = params.spread * kick;
    for (let x = 0; x < end; x++) {
      const top = getTop(x);
      for (const [band, color] of RAINBOW_COLORS.entries()) {
        const offset = (band - (RAINBOW_COLORS.length - 1) / 2) * spread;
        const bandTop = Math.round(top + band * BAND + offset);
        const lit = mixColor(color, WHITE, 0.5 * kick * (1 - x / end));
        for (let row = 0; row < BAND; row++) {
          setRgbaPixel(image, x, bandTop + row, lit);
        }
      }
    }
    const catY = Math.round(getTop(end - 1) - 1);
    drawNyan(image, params, CAT_X, catY, frame);
    for (let spark = 0; spark < 8; spark++) {
      const random = createRandom(hashSeed(SPARK_SEED, Math.floor(pulse), spark));
      const angle = getRandomBetween(random, -Math.PI, Math.PI);
      const distance = 6 + since * 40 * getRandomBetween(random, 0.6, 1);
      drawStar(
        image,
        CAT_X + 26 + Math.cos(angle) * distance,
        catY + NYAN_HEIGHT / 2 + Math.sin(angle) * distance,
        Math.min(6, Math.floor(since * 10)),
        RAINBOW_COLORS[spark % RAINBOW_COLORS.length] ?? WHITE,
      );
    }
  },
});

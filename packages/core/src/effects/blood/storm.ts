import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  type Point,
  drawDot,
  drawStreak,
  fillImage,
  getBallisticPosition,
  getCycle,
  getEnvelope,
  getScaledColor,
} from "./shared.ts";

const DROP_SEED = 0xb10b0;
const FALL_FRACTION = 0.75;
const SPLASH_GRAVITY = 500;
const FLASH_BEATS = 0.2;

export const bloodStorm = defineEffect({
  id: "blood-storm",
  name: "Blood storm",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    drops: z.number().int().min(0).max(200).default(70),
    fallBeats: z.number().min(0.125).max(4).default(0.5),
    slant: z.number().min(-1).max(1).default(0.3),
    length: z.number().int().min(1).max(20).default(8),
    splash: z.number().int().min(0).max(8).default(3),
    flash: z.number().min(0).max(1).default(0.3),
    flashEvery: z.number().int().min(1).max(32).default(4),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const sinceFlash = beat - Math.floor(beat / params.flashEvery) * params.flashEvery;
    if (sinceFlash < FLASH_BEATS && params.flash > 0) {
      fillImage(image, getScaledColor(color, params.flash * (1 - sinceFlash / FLASH_BEATS) ** 2));
    }
    const pulse = 0.7 + 0.5 * getEnvelope(beat, 5);
    const travel = HEIGHT + params.length;
    const extraWidth = Math.abs(params.slant) * HEIGHT;
    for (let index = 0; index < params.drops; index++) {
      const random = createRandom(hashSeed(DROP_SEED, index));
      const startX = random() * (WIDTH + extraWidth) - (params.slant > 0 ? extraWidth : 0);
      const period = params.fallBeats * (random() < 0.5 ? 1 : 2);
      const cycle = getCycle(beat / period + random());
      const shade = getRandomBetween(random, 0.6, 1.2) * pulse;
      const dropColor = getScaledColor(color, shade);
      const getPoint = (y: number): Point => [startX + y * params.slant, y];
      if (cycle < FALL_FRACTION) {
        const headY = (cycle / FALL_FRACTION) * travel;
        drawStreak(image, getPoint(headY - params.length), getPoint(headY), dropColor);
        continue;
      }
      const age = (cycle - FALL_FRACTION) * period;
      const landing = getPoint(HEIGHT - 1);
      for (let splash = 0; splash < params.splash; splash++) {
        const velocity: Point = [
          getRandomBetween(random, -45, 45),
          -getRandomBetween(random, 35, 80),
        ];
        const point = getBallisticPosition(landing, velocity, SPLASH_GRAVITY, age);
        if (point[1] <= HEIGHT - 1) {
          drawDot(image, point, 1, getScaledColor(dropColor, 0.8));
        }
      }
    }
  },
});

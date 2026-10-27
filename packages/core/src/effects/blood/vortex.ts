import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
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
  getModulo,
  getScaledColor,
} from "./shared.ts";

const SPIRAL_SEED = 0xb1090;
const BURST_SEED = 0xb1091;
const CENTER: Point = [WIDTH / 2, HEIGHT / 2];
const BURST_GRAVITY = 110;
const BURST_LIFE = 2;
const FADE_IN = 0.15;

export const bloodVortex = defineEffect({
  id: "blood-vortex",
  name: "Blood vortex",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    every: z.number().int().min(1).max(32).default(4),
    particles: z.number().int().min(0).max(128).default(56),
    burst: z.number().int().min(0).max(200).default(90),
    spin: z.number().min(0).max(4).default(1.5),
    flash: z.number().min(0).max(1).default(0.3),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const drop = Math.floor(beat / params.every);
    const cycle = getCycle(beat / params.every);
    const sinceDrop = beat - drop * params.every;

    if (sinceDrop < 0.15 && params.flash > 0) {
      fillImage(image, getScaledColor(color, params.flash * (1 - sinceDrop / 0.15) ** 2));
    }

    const intensity = Math.min(1, cycle / FADE_IN) * (0.5 + 0.6 * cycle);
    const passes = Math.max(1, Math.round(params.every / 2));
    const getSpiralPosition = (progress: number, radius: number, angle: number): Point => {
      const distance = radius * (1 - progress) ** 1.2;
      const turn = angle + params.spin * Math.PI * 2 * progress ** 1.5;
      return [CENTER[0] + Math.cos(turn) * distance, CENTER[1] + Math.sin(turn) * distance];
    };
    for (let index = 0; index < params.particles; index++) {
      const random = createRandom(hashSeed(SPIRAL_SEED, index));
      const offset = random();
      const radius = getRandomBetween(random, 30, 46);
      const angle = random() * Math.PI * 2;
      const progress = getCycle(cycle * passes + offset);
      const head = getSpiralPosition(progress, radius, angle);
      const tail = getSpiralPosition(Math.max(0, progress - 0.05), radius, angle);
      const particleColor = getScaledColor(color, intensity * (0.5 + 0.8 * progress));
      drawStreak(image, tail, head, particleColor);
      drawDot(image, head, 1, particleColor);
    }

    const pulse = getEnvelope(beat, 6);
    const coreRadius = 1.5 + cycle * 5 + pulse * cycle * 2;
    for (let y = -Math.ceil(coreRadius); y <= coreRadius; y++) {
      for (let x = -Math.ceil(coreRadius); x <= coreRadius; x++) {
        const distance = Math.hypot(x, y);
        if (distance <= coreRadius) {
          setRgbaPixel(
            image,
            CENTER[0] + x,
            CENTER[1] + y,
            getScaledColor(color, 0.6 + 0.4 * cycle + 0.3 * pulse - (distance / coreRadius) * 0.3),
          );
        }
      }
    }

    if (sinceDrop >= BURST_LIFE) {
      return;
    }
    const random = createRandom(hashSeed(BURST_SEED, getModulo(drop, 4)));
    const fade = 1 - sinceDrop / BURST_LIFE;
    for (let index = 0; index < params.burst; index++) {
      const angle = random() * Math.PI * 2;
      const speed = getRandomBetween(random, 50, 170);
      const velocity: Point = [Math.cos(angle) * speed, Math.sin(angle) * speed];
      const shade = getRandomBetween(random, 0.8, 1.4) * fade;
      const size = random() < 0.25 ? 2 : 1;
      const head = getBallisticPosition(CENTER, velocity, BURST_GRAVITY, sinceDrop);
      const tail = getBallisticPosition(
        CENTER,
        velocity,
        BURST_GRAVITY,
        Math.max(0, sinceDrop - 0.05),
      );
      const particleColor = getScaledColor(color, shade);
      drawStreak(image, tail, head, particleColor);
      drawDot(image, head, size, particleColor);
    }
  },
});

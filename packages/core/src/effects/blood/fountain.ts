import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  drawDot,
  drawStreak,
  getBallisticPosition,
  getEnvelope,
  getModulo,
  getScaledColor,
} from "./shared.ts";

const FOUNTAIN_SEED = 0xb1080;
const STEP = 0.125;
const STEPS_PER_BEAT = 1 / STEP;
const GRAVITY = 220;
const LIFE = 2;
const TRAIL = 0.04;

export const bloodFountain = defineEffect({
  id: "blood-fountain",
  name: "Blood fountain",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    emitters: z.number().int().min(1).max(4).default(1),
    perStep: z.number().int().min(0).max(64).default(18),
    beatBurst: z.number().int().min(0).max(128).default(0),
    power: z.number().min(0.4).max(1.5).default(1),
    spread: z.number().min(0).max(1).default(0.3),
    sway: z.number().min(0).max(1).default(0.25),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const stepsPerPeriod = Math.max(1, Math.round(params.period / STEP));
    const getEmitterX = (emitter: number) => ((emitter + 0.5) / params.emitters) * WIDTH;
    const first = Math.floor((beat - LIFE) / STEP) + 1;
    const last = Math.floor(beat / STEP);
    for (let step = first; step <= last; step++) {
      const age = beat - step * STEP;
      const isBeat = params.beatBurst > 0 && getModulo(step, STEPS_PER_BEAT) === 0;
      const count = params.perStep + (isBeat ? params.beatBurst : 0);
      const random = createRandom(hashSeed(FOUNTAIN_SEED, getModulo(step, stepsPerPeriod)));
      const aim = -Math.PI / 2 + params.sway * Math.sin(step * STEP * Math.PI * 0.5);
      for (let index = 0; index < count; index++) {
        const time = age - random() * STEP;
        if (time < 0) {
          continue;
        }
        const origin = [getEmitterX(Math.floor(random() * params.emitters)), HEIGHT] as const;
        const angle = aim + getRandomBetween(random, -1, 1) * params.spread;
        const speed = params.power * getRandomBetween(random, 100, 170) * (isBeat ? 1.1 : 1);
        const velocity = [Math.cos(angle) * speed, Math.sin(angle) * speed] as const;
        const shade = getRandomBetween(random, 0.75, 1.3);
        const size = random() < 0.2 ? 2 : 1;
        const head = getBallisticPosition(origin, velocity, GRAVITY, time);
        if (head[1] > HEIGHT + 2) {
          continue;
        }
        const tail = getBallisticPosition(origin, velocity, GRAVITY, Math.max(0, time - TRAIL));
        const particleColor = getScaledColor(color, shade);
        drawStreak(image, tail, head, particleColor);
        drawDot(image, head, size, particleColor);
      }
    }

    const swell =
      params.beatBurst > 0 ? getEnvelope(beat, 5) : 0.5 + 0.15 * Math.sin(beat * Math.PI * 4);
    for (let emitter = 0; emitter < params.emitters; emitter++) {
      const centerX = getEmitterX(emitter);
      const radius = 3 + swell * 4;
      for (let y = HEIGHT - Math.ceil(radius); y < HEIGHT; y++) {
        for (let x = Math.floor(centerX - radius * 1.6); x <= centerX + radius * 1.6; x++) {
          const distance = Math.hypot((x - centerX) / 1.6, y - HEIGHT);
          if (distance <= radius) {
            setRgbaPixel(
              image,
              x,
              y,
              getScaledColor(color, 0.6 + 0.5 * swell * (1 - distance / radius)),
            );
          }
        }
      }
    }
  },
});

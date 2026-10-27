import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import { BLOOD_COLOR, DRIED_COLOR, getMixedColor, getModulo, getScaledColor } from "./shared.ts";
import { drawSplat, splatterOrigins } from "./splatter.ts";

const EXPLOSION_SEED = 0xb1030;
const SPLAT_SEED = 0xb1031;
const GRAVITY = 90;
const FLASH_BEATS = 0.3;
const SPLAT_DELAY = 0.08;

export const bloodExplosion = defineEffect({
  id: "blood-explosion",
  name: "Blood explosion",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    every: z.number().min(0.5).max(32).default(4),
    period: z.number().int().min(1).max(256).default(16),
    particles: z.number().int().min(0).max(160).default(72),
    splats: z.number().int().min(0).max(12).default(5),
    flash: z.number().min(0).max(1).default(0.35),
    origin: z.enum(splatterOrigins).default("center"),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const burstsPerPeriod = Math.max(1, Math.round(params.period / params.every));
    const burst = Math.floor(beat / params.every);
    const age = beat - burst * params.every;
    const random = createRandom(hashSeed(EXPLOSION_SEED, getModulo(burst, burstsPerPeriod)));
    const isCenter = params.origin === "center";
    const originX = isCenter ? WIDTH / 2 : getRandomBetween(random, 14, WIDTH - 14);
    const originY = isCenter ? HEIGHT / 2 - 4 : getRandomBetween(random, 12, HEIGHT - 20);
    const life = Math.min(params.every, 8);
    const dryness = Math.min(1, age / life);
    const visibility = dryness > 0.75 ? 1 - (dryness - 0.75) / 0.25 : 1;

    if (age < FLASH_BEATS && params.flash > 0) {
      const flash = getScaledColor(color, params.flash * (1 - age / FLASH_BEATS) ** 2);
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          setRgbaPixel(image, x, y, flash);
        }
      }
    }

    const splatRandom = createRandom(hashSeed(SPLAT_SEED, getModulo(burst, burstsPerPeriod)));
    for (let index = 0; index < params.splats; index++) {
      const appear = SPLAT_DELAY + getRandomBetween(splatRandom, 0, 0.25);
      const x = getRandomBetween(splatRandom, 6, WIDTH - 6);
      const y = getRandomBetween(splatRandom, 4, HEIGHT - 16);
      const radius = getRandomBetween(splatRandom, 2.5, 7.5);
      const seed = hashSeed(SPLAT_SEED, getModulo(burst, burstsPerPeriod), index);
      const splatAge = age - appear;
      if (splatAge < 0) {
        continue;
      }
      drawSplat(image, createRandom(seed), {
        x,
        y,
        radius,
        growth: 1 - Math.exp(-splatAge * 20),
        age: splatAge,
        runs: Math.round(getRandomBetween(splatRandom, 1, 4)),
        runSpeed: getRandomBetween(splatRandom, 3, 8),
        color: getScaledColor(getMixedColor(color, DRIED_COLOR, dryness ** 1.5), visibility),
      });
    }

    if (age < 0.35) {
      const core = 3 + age * 30;
      const coreShade = 1.25 - age * 2;
      for (let y = -Math.ceil(core); y <= core; y++) {
        for (let x = -Math.ceil(core); x <= core; x++) {
          const distance = Math.hypot(x, y);
          if (distance <= core) {
            setRgbaPixel(
              image,
              Math.round(originX) + x,
              Math.round(originY) + y,
              getScaledColor(
                color,
                coreShade * (1 - (distance / core) * 0.5) * (distance > core - 2 ? 1 : 0.5),
              ),
            );
          }
        }
      }
    }

    for (let index = 0; index < params.particles; index++) {
      const angle = random() * Math.PI * 2;
      const speed = getRandomBetween(random, 25, 120);
      const size = random() < 0.25 ? 2 : 1;
      const shade = getRandomBetween(random, 0.7, 1.15);
      const delay = random() * 0.05;
      const time = age - delay;
      if (time < 0) {
        continue;
      }
      const getPosition = (at: number) => [
        originX + Math.cos(angle) * speed * at,
        originY + Math.sin(angle) * speed * at - 30 * at + 0.5 * GRAVITY * at ** 2,
      ];
      const [headX = 0, headY = 0] = getPosition(time);
      const [tailX = 0, tailY = 0] = getPosition(Math.max(0, time - 0.06));
      const particleColor = getScaledColor(color, shade * Math.max(0.3, 1 - time * 0.4));
      const samples = Math.max(1, Math.ceil(Math.hypot(headX - tailX, headY - tailY)));
      for (let sample = 0; sample <= samples; sample++) {
        const along = sample / samples;
        setRgbaPixel(
          image,
          Math.round(tailX + (headX - tailX) * along),
          Math.round(tailY + (headY - tailY) * along),
          getScaledColor(particleColor, 0.35 + 0.65 * along),
        );
      }
      for (let offsetY = 0; offsetY < size; offsetY++) {
        for (let offsetX = 0; offsetX < size; offsetX++) {
          setRgbaPixel(
            image,
            Math.round(headX) + offsetX,
            Math.round(headY) + offsetY,
            particleColor,
          );
        }
      }
    }
  },
});

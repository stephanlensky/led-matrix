import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import type { Color } from "../../frame.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  getEnvelope,
  getMixedColor,
  getNoise,
  getScaledColor,
  getSmoothNoise2d,
  getWrappedNoise2d,
} from "./shared.ts";

const TEXTURE_SEED = 0xb1100;
const CRATER_SEED = 0xb1101;
const DRIP_SEED = 0xb1102;
const STAR_SEED = 0xb1103;
const CLOUD_SEED = 0xb1104;
const PALE_COLOR: Color = [210, 180, 150];
const CLOUD_COLOR: Color = [22, 6, 8];
const CLOUD_WRAP = 8;
const HALO = 7;

export const bloodMoon = defineEffect({
  id: "blood-moon",
  name: "Blood moon",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    level: z.number().min(0).max(1).default(1),
    pulse: z.number().min(0).max(1).default(0.3),
    clouds: z.number().min(0).max(1).default(0.35),
    drips: z.number().int().min(0).max(12).default(6),
    period: z.number().int().min(1).max(256).default(16),
  }),
  render(image, { params, beat }) {
    const blood = parseColor(params.color);
    const level = params.level;
    const rise = 1 - (1 - level) ** 2;
    const radius = 9 + 12 * level;
    const centerX = WIDTH / 2 - 0.5;
    const centerY = HEIGHT + radius + 2 + (27 - HEIGHT - radius - 2) * rise;
    const moonColor = getMixedColor(
      PALE_COLOR,
      getScaledColor(blood, 1.9),
      Math.min(1, level ** 1.3),
    );
    const brightness = 1 + params.pulse * level * getEnvelope(beat, 5);
    const craterRandom = createRandom(CRATER_SEED);
    const craters = Array.from({ length: 5 }, () => ({
      x: getRandomBetween(craterRandom, -0.6, 0.6),
      y: getRandomBetween(craterRandom, -0.6, 0.6),
      size: getRandomBetween(craterRandom, 0.12, 0.25),
    }));
    const drips = Array.from({ length: params.drips }, (_, index) => {
      const random = createRandom(hashSeed(DRIP_SEED, index));
      return {
        offset: getRandomBetween(random, -0.7, 0.7),
        length: getRandomBetween(random, 0.5, 1.5) * radius * Math.max(0, level - 0.3) * 1.4,
        width: random() < 0.4 ? 2 : 1,
      };
    });
    const cloudShift = (beat / params.period) * CLOUD_WRAP;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const offsetX = x - centerX;
        const offsetY = y - centerY;
        const distance = Math.hypot(offsetX, offsetY);
        let pixel: Color = [0, 0, 0];
        const starRandom = getNoise(STAR_SEED, x, y);
        if (starRandom > 0.985) {
          const twinkle = 0.5 + 0.5 * Math.sin(beat * 2 + starRandom * 500);
          pixel = getScaledColor([180, 170, 190], (1 - level) * twinkle * 0.6);
        }
        if (distance < radius + HALO) {
          const halo = Math.max(0, 1 - (distance - radius) / HALO) ** 2;
          pixel = getMixedColor(pixel, getScaledColor(moonColor, 0.35 * brightness), halo);
        }
        if (distance <= radius) {
          const localX = offsetX / radius;
          const localY = offsetY / radius;
          let shade = 0.6 + 0.4 * getSmoothNoise2d(TEXTURE_SEED, localX * 4, localY * 4);
          for (const crater of craters) {
            const craterDistance = Math.hypot(localX - crater.x, localY - crater.y);
            if (craterDistance < crater.size) {
              shade *= craterDistance > crater.size * 0.75 ? 1.05 : 0.65;
            }
          }
          shade *= 0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - (distance / radius) ** 2));
          pixel = getScaledColor(moonColor, shade * brightness);
        }
        for (const drip of drips) {
          const dripX = Math.round(centerX + drip.offset * radius);
          if (x < dripX || x >= dripX + drip.width) {
            continue;
          }
          const top = centerY - radius * Math.sqrt(1 - drip.offset ** 2);
          const along = y - top;
          if (along >= 0 && along < drip.length && distance <= radius + 1) {
            pixel = getScaledColor(blood, (0.75 - (along / drip.length) * 0.25) * brightness);
          } else if (along >= drip.length && along < drip.length + 2 && drip.length > 2) {
            pixel = getScaledColor(blood, 0.9 * brightness);
          }
        }
        const band = getSmoothNoise2d(CLOUD_SEED + 1, 0, y / 6);
        const cloud =
          getWrappedNoise2d(CLOUD_SEED, x / 8 + cloudShift, y / 5, CLOUD_WRAP) * (0.4 + band);
        const threshold = 1 - params.clouds * 0.75;
        if (cloud > threshold) {
          const amount = Math.min(0.85, (cloud - threshold) * 3);
          const rim = cloud - threshold < 0.04 && distance < radius + HALO ? 0.4 : 0;
          pixel = getMixedColor(
            pixel,
            getMixedColor(CLOUD_COLOR, getScaledColor(moonColor, 0.5), rim),
            amount,
          );
        }
        setRgbaPixel(image, x, y, pixel);
      }
    }
  },
});

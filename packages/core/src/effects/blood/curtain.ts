import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  getMixedColor,
  getNoise,
  getScaledColor,
  getSmoothNoise,
} from "./shared.ts";

const FRONT_SEED = 0xb1070;
const BACK_SEED = 0xb1071;
const FINGER_SEED = 0xb1072;
const TEXTURE_SEED = 0xb1073;
const STREAK_SEED = 0xb1074;
const EDGE_MARGIN = 16;
const TRAVEL = HEIGHT + EDGE_MARGIN * 2;

export const bloodCurtain = defineEffect({
  id: "blood-curtain",
  name: "Blood curtain",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    level: z.number().min(0).max(2).default(0.7),
    fingers: z.number().int().min(0).max(32).default(10),
    stains: z.number().min(0).max(1).default(0.35),
  }),
  render(image, { params }) {
    const color = parseColor(params.color);
    const fingerLeads = new Map<number, { lead: number; width: number }>();
    for (let index = 0; index < params.fingers; index++) {
      const random = createRandom(hashSeed(FINGER_SEED, index));
      const x = Math.floor(random() * WIDTH);
      const lead = getRandomBetween(random, 3, 14) * Math.min(1, params.level * 3);
      const width = random() < 0.4 ? 2 : 1;
      for (let column = 0; column < width; column++) {
        fingerLeads.set(x + column, {
          lead: Math.max(lead, fingerLeads.get(x + column)?.lead ?? 0),
          width,
        });
      }
    }
    const flow = params.level * 40;
    const drainLevel = Math.max(0, params.level - 1);

    for (let x = 0; x < WIDTH; x++) {
      const finger = fingerLeads.get(x);
      const front =
        Math.min(1, params.level) * (TRAVEL + 14) -
        EDGE_MARGIN -
        getSmoothNoise(FRONT_SEED, x / 6) * 8 +
        (finger?.lead ?? 0);
      const back = drainLevel * (TRAVEL + 14) - EDGE_MARGIN - getSmoothNoise(BACK_SEED, x / 5) * 10;
      const streak = getSmoothNoise(STREAK_SEED, x / 2);
      const bottom = Math.round(front);
      for (let y = 0; y <= Math.min(HEIGHT - 1, bottom); y++) {
        if (drainLevel > 0 && y < back) {
          const stain = params.stains * Math.max(0, streak - 0.35) * 1.6;
          const isStained = getNoise(TEXTURE_SEED, x, Math.floor(y / 5)) < 0.6;
          if (stain > 0.05 && isStained) {
            setRgbaPixel(
              image,
              x,
              y,
              getScaledColor(getMixedColor(color, DRIED_COLOR, 0.6), stain),
            );
          }
          continue;
        }
        const texture = getNoise(TEXTURE_SEED, x, Math.floor(y - flow));
        let shade = 0.5 + 0.22 * streak + 0.12 * texture;
        if (bottom - y < 2) {
          shade = finger ? 0.95 : 0.85;
        }
        if (drainLevel > 0 && y - back < 2) {
          shade = 0.4;
        }
        setRgbaPixel(image, x, y, getScaledColor(color, shade));
      }
      if (finger && bottom >= -1 && bottom < HEIGHT - 1) {
        setRgbaPixel(image, x - 1, bottom, getScaledColor(color, 0.4));
        setRgbaPixel(image, x + finger.width, bottom, getScaledColor(color, 0.4));
      }
    }
  },
});

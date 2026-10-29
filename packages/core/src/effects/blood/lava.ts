import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import { BLOOD_COLOR, DRIED_COLOR, getEnvelope, getMixedColor, getScaledColor } from "./shared.ts";

const BLOB_SEED = 0xb11b0;
const CENTER_X = WIDTH / 2 - 0.5;
const CENTER_Y = HEIGHT / 2 - 0.5;

export const bloodLava = defineEffect({
  id: "blood-lava",
  name: "Blood lava lamp",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    blobs: z.number().int().min(1).max(12).default(7),
    kickEvery: z.number().min(0.5).max(8).default(1),
    split: z.number().min(0).max(1).default(0.7),
    period: z.number().int().min(1).max(256).default(16),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const kick = params.split * getEnvelope(beat / params.kickEvery, 4);
    const phase = (beat / params.period) * Math.PI * 2;
    const blobs = Array.from({ length: params.blobs }, (_, index) => {
      const random = createRandom(hashSeed(BLOB_SEED, index));
      const frequencyX = 1 + Math.floor(random() * 2);
      const frequencyY = 1 + Math.floor(random() * 2);
      const pathX =
        CENTER_X + getRandomBetween(random, 10, 20) * Math.sin(phase * frequencyX + random() * 6.3);
      const pathY =
        CENTER_Y + getRandomBetween(random, 10, 22) * Math.cos(phase * frequencyY + random() * 6.3);
      const angle = Math.atan2(pathY - CENTER_Y, pathX - CENTER_X);
      return {
        x: pathX + Math.cos(angle) * 12 * kick,
        y: pathY + Math.sin(angle) * 12 * kick,
        radiusSquared: getRandomBetween(random, 6, 10) ** 2,
      };
    });
    const threshold = 1 + 0.8 * kick;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        let field = 0;
        for (const blob of blobs) {
          field += blob.radiusSquared / ((x - blob.x) ** 2 + (y - blob.y) ** 2 + 1);
        }
        const glow = (y / HEIGHT) ** 2 * 0.25;
        if (field < threshold) {
          const halo = Math.max(0, (field / threshold - 0.6) / 0.4) ** 2 * 0.35;
          setRgbaPixel(
            image,
            x,
            y,
            getScaledColor(getMixedColor(DRIED_COLOR, color, halo), glow + halo),
          );
          continue;
        }
        const inside = (field - threshold) / threshold;
        const shade =
          inside < 0.18 ? 1.35 + kick * 0.4 : 0.6 + 0.4 * Math.min(1, inside / 2) + kick * 0.2;
        setRgbaPixel(image, x, y, getScaledColor(color, shade));
      }
    }
  },
});

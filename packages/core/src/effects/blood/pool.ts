import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import { BLOOD_COLOR, getModulo, getScaledColor, getSmoothNoise2d } from "./shared.ts";

const TEXTURE_SEED = 0xb1040;
const RIPPLE_SEED = 0xb1041;
const MAX_RADIUS = 50;
const RIPPLE_SPEED = 16;
const WOBBLE_BEATS = 16;

export const bloodPool = defineEffect({
  id: "blood-pool",
  name: "Blood pool",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    level: z.number().min(0).max(1).default(0.6),
    ripples: z.number().int().min(0).max(4).default(1),
    period: z.number().int().min(1).max(256).default(16),
    offsetX: z.number().int().min(-WIDTH).max(WIDTH).default(0),
    offsetY: z.number().int().min(-HEIGHT).max(HEIGHT).default(0),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const centerX = WIDTH / 2 + params.offsetX;
    const centerY = HEIGHT / 2 + params.offsetY;
    const radius = params.level * MAX_RADIUS;
    if (radius <= 0) {
      return;
    }
    const wobble = (beat / WOBBLE_BEATS) * Math.PI * 2;
    const getEdge = (angle: number) =>
      radius *
      (1 +
        0.13 * Math.sin(3 * angle + 0.4) +
        0.08 * Math.sin(5 * angle + 1.3) +
        0.05 * Math.sin(9 * angle + 2.1) +
        0.025 * Math.sin(4 * angle + wobble));
    const highlightX = centerX - radius * 0.35;
    const highlightY = centerY - radius * 0.4;
    const highlightRadius = Math.max(2, radius * 0.25);
    const beatIndex = Math.floor(beat);
    const rippleAge = beat - beatIndex;
    const ripples = Array.from({ length: params.ripples }, (_, index) => {
      const random = createRandom(
        hashSeed(RIPPLE_SEED, getModulo(beatIndex, params.period), index),
      );
      const angle = random() * Math.PI * 2;
      const distance = random() * radius * 0.6;
      return {
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
        size: rippleAge * RIPPLE_SPEED * getRandomBetween(random, 0.7, 1.1),
      };
    });

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const distance = Math.hypot(x - centerX, y - centerY);
        const edge = getEdge(Math.atan2(y - centerY, x - centerX));
        if (distance > edge) {
          continue;
        }
        const texture = getSmoothNoise2d(TEXTURE_SEED, x / 5 + Math.sin(wobble) * 0.5, y / 5);
        let shade = 0.5 + 0.25 * texture;
        if (edge - distance < 1.5) {
          shade = 0.32;
        } else if (edge - distance < 3) {
          shade += 0.12;
        }
        const highlight = 1 - Math.hypot(x - highlightX, y - highlightY) / highlightRadius;
        if (highlight > 0) {
          shade += 0.3 * highlight ** 2;
        }
        for (const ripple of ripples) {
          const ring = Math.abs(Math.hypot(x - ripple.x, y - ripple.y) - ripple.size);
          if (ring < 1) {
            shade += 0.3 * (1 - ring) * (1 - rippleAge);
          }
        }
        setRgbaPixel(image, x, y, getScaledColor(color, shade));
      }
    }
  },
});

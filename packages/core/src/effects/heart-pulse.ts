import { z } from "zod";
import { colorSchema, getBackgroundColor, getShiftedHue, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { getCycle } from "./cat-dance.ts";
import { mix, scale } from "./cat-model.ts";
import { drawHeart, getHeartSize } from "./heart.ts";
import { drawFloatingHearts, drawSparkles } from "./heart-particles.ts";

const WHITE: Color = [255, 255, 255];

export function getBeatKick(beat: number, every: number): { pulse: number; kick: number } {
  const pulse = beat / every;
  return { pulse, kick: Math.exp(-getCycle(pulse) * every * 6) };
}

export const heartPulse = defineEffect({
  id: "heart-pulse",
  name: "Heart pulse",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    background: z.boolean().default(false),
    backgroundColor: colorSchema.default("#2a0418"),
    every: z.number().min(0.25).max(4).default(1),
    size: z.number().min(0).max(60).default(30),
    spacing: z.number().min(4).max(30).default(12),
    rings: z.number().min(0).max(1).default(0.45),
    glow: z.number().min(0).max(1).default(1),
    y: z.number().min(0).max(64).default(32),
    sparkles: z.boolean().default(true),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const background = getBackgroundColor({
      background: params.background,
      color: params.backgroundColor,
    });
    const { pulse, kick } = getBeatKick(beat, params.every);
    const push = Math.floor(pulse) + easings.easeOutCubic(getCycle(pulse));
    const ring = mix(background, color, params.rings);
    const brightness = 1 + 0.6 * kick;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const size = getHeartSize(x + 0.5 - WIDTH / 2, y + 0.5 - params.y);
        const wave = getCycle(size / params.spacing - push);
        const edge = Math.min(1, Math.max(0, (Math.abs(wave - 0.5) - 0.22) * 6));
        setRgbaPixel(image, x, y, scale(mix(background, ring, edge), brightness));
      }
    }
    if (params.sparkles) {
      drawSparkles(image, pulse, [mix(color, WHITE, 0.4)], 0.8, { bottom: HEIGHT - 4 });
    }
    if (params.size > 0) {
      const size = params.size * (1 + 0.1 * kick);
      const fill = scale(mix(color, WHITE, 0.25 * kick), 0.85 + 0.15 * kick);
      drawHeart(image, {
        x: WIDTH / 2,
        y: params.y,
        size,
        color: mix(background, fill, params.glow),
        outline: mix(background, mix(color, WHITE, 0.55), params.glow),
      });
      if (params.glow < 0.6) {
        return;
      }
      drawHeart(image, {
        x: WIDTH / 2 - size * 0.24,
        y: params.y - size * 0.22,
        size: size * 0.16,
        color: mix(background, mix(color, WHITE, 0.7), params.glow),
        angle: -0.5,
      });
    }
  },
});

export const heartFloat = defineEffect({
  id: "heart-float",
  name: "Floating hearts",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.25).max(4).default(1),
    count: z.number().int().min(1).max(6).default(2),
    y: z.number().min(0).max(80).default(70),
    rise: z.number().min(0).max(90).default(64),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    drawFloatingHearts(
      image,
      beat / params.every,
      [WIDTH / 2, params.y],
      [color, mix(color, WHITE, 0.5), getShiftedHue(color, 0.04)],
      WIDTH / 2,
      { count: params.count, lifetime: 3, rise: params.rise, gap: 0, sizes: [4, 8] },
    );
  },
});

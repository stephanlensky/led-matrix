import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { fontNames, fonts, drawText, getLineHeight, measureText } from "../../fonts/index.ts";
import type { RgbaImage } from "../../frame.ts";
import { HEIGHT, RGBA_CHANNELS, WIDTH, createRgbaImage, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  drawDrip,
  getCycle,
  getMixedColor,
  getNoise,
  getScaledColor,
} from "./shared.ts";

const DRIP_SEED = 0xb1050;
const SHAKE_SEED = 0xb1051;
const TEXTURE_SEED = 0xb1052;
const MASK_COLOR = [255, 255, 255] as const;

function isMasked(mask: Uint8ClampedArray, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    return false;
  }
  return (mask[(y * WIDTH + x) * RGBA_CHANNELS + 3] ?? 0) > 0;
}

const bloodTextParams = z.object({
  text: z.string().max(64).meta({ multiline: true }).default("RUN"),
  font: z.enum(fontNames).default("spleen-16x32"),
  color: colorSchema.default(BLOOD_COLOR),
  drips: z.number().int().min(0).max(32).default(8),
  dripBeats: z.number().int().min(1).max(32).default(4),
  dripLength: z.number().int().min(2).max(40).default(8),
  shake: z.number().int().min(0).max(4).default(0),
  weight: z.number().int().min(0).max(3).default(0),
  offsetY: z.number().int().min(-HEIGHT).max(HEIGHT).default(-8),
});

export type BloodTextParams = z.output<typeof bloodTextParams>;

export function drawBloodText(image: RgbaImage, params: BloodTextParams, beat: number): void {
  const color = parseColor(params.color);
  const font = fonts[params.font];
  const lines = params.text.split("\n");
  const lineHeight = getLineHeight(font) + 1;
  const top = Math.floor((HEIGHT - lines.length * lineHeight + 1) / 2) + params.offsetY;
  const shakeRandom = createRandom(hashSeed(SHAKE_SEED, Math.floor(beat * 8)));
  const shakeAmount = getCycle(beat) < 0.25 ? params.shake : 0;
  const shakeX = Math.round(getRandomBetween(shakeRandom, -shakeAmount, shakeAmount));
  const shakeY = Math.round(getRandomBetween(shakeRandom, -shakeAmount, shakeAmount));
  const mask = createRgbaImage();
  for (const [index, line] of lines.entries()) {
    const left = Math.floor((WIDTH - measureText(font, line) - params.weight) / 2);
    for (let bold = 0; bold <= params.weight; bold++) {
      drawText(
        mask,
        font,
        line,
        left + shakeX + bold,
        top + index * lineHeight + shakeY,
        MASK_COLOR,
      );
    }
  }

  const edges: [x: number, y: number][] = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (isMasked(mask, x, y) && !isMasked(mask, x, y + 1)) {
        edges.push([x, y]);
      }
    }
  }

  const usedColumns = new Set<number>();
  for (let index = 0; index < params.drips && edges.length > 0; index++) {
    const random = createRandom(hashSeed(DRIP_SEED, index));
    const [x = 0, y = 0] = edges[Math.floor(random() * edges.length)] ?? [];
    if (usedColumns.has(x - shakeX)) {
      continue;
    }
    usedColumns.add(x - shakeX);
    const period = params.dripBeats * (random() < 0.5 ? 1 : 2);
    drawDrip(image, {
      x,
      top: y + 1,
      width: 1,
      length: Math.round(params.dripLength * getRandomBetween(random, 0.4, 1)),
      cycle: getCycle(beat / period + random()),
      trail: 0.4,
      color,
    });
  }

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (!isMasked(mask, x, y)) {
        continue;
      }
      const isTop = !isMasked(mask, x, y - 1);
      const isBottom = !isMasked(mask, x, y + 1);
      const noise = getNoise(TEXTURE_SEED, x - shakeX, y - shakeY);
      const shade = isBottom ? 0.95 : isTop ? 0.45 : 0.55 + 0.3 * noise;
      const pixelColor = noise > 0.85 && !isBottom ? getMixedColor(color, DRIED_COLOR, 0.6) : color;
      setRgbaPixel(image, x, y, getScaledColor(pixelColor, shade));
    }
  }
}

export const bloodText = defineEffect({
  id: "blood-text",
  name: "Bleeding text",
  kind: "pixel",
  params: bloodTextParams,
  render(image, { params, beat }) {
    drawBloodText(image, params, beat);
  },
});

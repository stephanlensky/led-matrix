import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { type RgbaImage, WIDTH } from "../../frame.ts";
import { easings } from "../../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import { drawMeadow, meadowParams } from "./meadow.ts";
import {
  type Point,
  addInkDot,
  addInkPath,
  blendInk,
  clamp,
  createInk,
  getCycle,
  mix,
  paperSchema,
  setPixel,
  speedSchema,
} from "./shared.ts";

const HORIZON = 38;
const LINE_SEED = 0x11e;
const LINE_VARIANTS = 4;

function getLinePath(index: number): Point[] {
  const random = createRandom(hashSeed(LINE_SEED, index));
  const startY = getRandomBetween(random, 2, 12);
  const endY = startY + getRandomBetween(random, 8, 18);
  const segments = 9;
  const kink = 3 + Math.floor(random() * 5);
  const points: Point[] = [];
  for (let segment = 0; segment <= segments; segment++) {
    const t = segment / segments;
    const x = -3 + t * (WIDTH + 6);
    const y = startY + (endY - startY) * t + getRandomBetween(random, -1.2, 1.2);
    points.push([x, y]);
    if (segment === kink) {
      points.push([x + getRandomBetween(random, 3, 6), y + getRandomBetween(random, -7, -4)]);
      points.push([x + getRandomBetween(random, 1, 3), y + getRandomBetween(random, 1, 3)]);
    }
  }
  return points;
}

function getPartialPath(points: readonly Point[], progress: number): Point[] {
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index] ?? point;
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  });
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * progress;
  const partial: Point[] = points.slice(0, 1);
  for (const [index, length] of lengths.entries()) {
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) {
      break;
    }
    if (remaining >= length) {
      partial.push(to);
      remaining -= length;
      continue;
    }
    const t = remaining / length;
    partial.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    break;
  }
  return partial;
}

function drawSky(image: RgbaImage, top: string, bottom: string): void {
  const topColor = parseColor(top);
  const bottomColor = parseColor(bottom);
  for (let y = 0; y < HORIZON; y++) {
    const color = mix(topColor, bottomColor, (y / HORIZON) ** 0.8);
    for (let x = 0; x < WIDTH; x++) {
      setPixel(image, x, y, color);
    }
  }
}

function drawLine(image: RgbaImage, color: string, beat: number, every: number): void {
  const index = Math.floor(beat / every);
  const elapsed = getCycle(beat / every) * every;
  const drawn = easings.easeOutCubic(clamp(elapsed / Math.min(1, every / 2)));
  const fade = 1 - clamp(elapsed - (every - 1));
  const path = getPartialPath(
    getLinePath(((index % LINE_VARIANTS) + LINE_VARIANTS) % LINE_VARIANTS),
    drawn,
  );
  const ink = createInk();
  addInkPath(ink, path, fade);
  const head = path.at(-1);
  if (head && drawn < 1) {
    addInkDot(ink, head, 0.9);
  }
  blendInk(image, ink, parseColor(color));
}

export const nurtureField = defineEffect({
  id: "nurture-field",
  name: "Nurture field",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    speed: speedSchema,
    ...meadowParams,
    skyTop: colorSchema.default("#d4e0e8"),
    skyBottom: colorSchema.default("#ffffff"),
    line: paperSchema.default("#000000"),
    lineEvery: z.number().min(1).max(16).default(4),
  }),
  render(image, { params, beat: musicBeat }) {
    const beat = musicBeat * params.speed;
    drawSky(image, params.skyTop, params.skyBottom);
    if (params.line !== "none") {
      drawLine(image, params.line, beat, params.lineEvery);
    }
    drawMeadow(image, params, HORIZON, beat);
  },
});

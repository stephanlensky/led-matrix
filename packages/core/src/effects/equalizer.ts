import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, setRgbaPixel } from "../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import {
  type Point,
  drawDot,
  drawStreak,
  getBallisticPosition,
  getEnvelope,
  getModulo,
  getNoise,
  getScaledColor,
} from "./blood/shared.ts";
import { mix } from "./cat-model.ts";
import { drawSparkle, drawSparkles } from "./heart-particles.ts";
import { getPalette, getPaletteColor, paletteParams } from "./palette.ts";

const JITTER_SEED = 0xb10a0;
const TEXTURE_SEED = 0xb10a1;
const SPRAY_SEED = 0xb10a2;
const PEAK_GRAVITY = 260;
const PEAK_SAMPLES = 32;
const SPRAY_GRAVITY = 260;
const SPRAY_LIFE = 1;
const SPARKLE_SEED = 0xb10a3;
const BURST_LIFE = 0.7;
const WHITE: Color = [255, 255, 255];

export const equalizerStyles = ["bottom", "center"] as const;

export type EqualizerStyle = (typeof equalizerStyles)[number];

export function getEqualizerLevel(band: number, beat: number): number {
  const kick = getEnvelope(beat, 6);
  const snare = getEnvelope((beat - 1) / 2, 3.5);
  const isRoll = getModulo(Math.floor(beat), 4) === 3;
  const hat = getEnvelope(beat * (isRoll ? 8 : 4), 1.5) * (isRoll ? 1 : 0.8);
  const jitter = 0.15 * getNoise(JITTER_SEED, Math.round(band * 100), Math.floor(beat * 4));
  const level =
    (1 - band) ** 2 * kick + 4 * band * (1 - band) * snare * 0.9 + band ** 2 * hat * 0.7 + jitter;
  return Math.min(1, level);
}

export type Equalizer = {
  bars: number;
  style: EqualizerStyle;
  texture: number;
  getColor: (bar: number) => Color;
  getCapColor?: (bar: number) => Color;
};

export function getBarHeight(
  bars: number,
  style: EqualizerStyle,
  bar: number,
  beat: number,
): number {
  const maxHeight = style === "center" ? HEIGHT : HEIGHT - 6;
  return Math.round(2 + getEqualizerLevel(bar / (bars - 1), beat) * (maxHeight - 2));
}

function getPeakY(bars: number, bar: number, beat: number): number {
  let peak = getBarHeight(bars, "bottom", bar, beat);
  for (let sample = 1; sample <= PEAK_SAMPLES; sample++) {
    const ago = sample / PEAK_SAMPLES;
    peak = Math.max(
      peak,
      getBarHeight(bars, "bottom", bar, beat - ago) - 0.5 * PEAK_GRAVITY * ago ** 2,
    );
  }
  return HEIGHT - Math.round(peak) - 2;
}

export function getBarTop(style: EqualizerStyle, height: number): number {
  return style === "center" ? (HEIGHT - height) / 2 : HEIGHT - height;
}

export function drawEqualizer(
  image: RgbaImage,
  beat: number,
  { bars, style, texture, getColor, getCapColor }: Equalizer,
): void {
  const barWidth = WIDTH / bars;
  for (let bar = 0; bar < bars; bar++) {
    const color = getColor(bar);
    const capColor = getCapColor?.(bar) ?? getScaledColor(color, 1.15);
    const left = Math.round(bar * barWidth);
    const right = Math.round((bar + 1) * barWidth) - 2;
    const height = getBarHeight(bars, style, bar, beat);
    const top = style === "center" ? Math.round((HEIGHT - height) / 2) : HEIGHT - height;
    for (let y = top; y < top + height; y++) {
      const edge = Math.min(y - top, top + height - 1 - y);
      const isCap = style === "center" ? edge < 1 : y === top;
      for (let x = left; x <= right; x++) {
        const shade = 0.75 - texture * (0.25 - 0.25 * getNoise(TEXTURE_SEED, x, y));
        setRgbaPixel(image, x, y, isCap ? capColor : getScaledColor(color, shade));
      }
    }
    if (style === "bottom") {
      const peakY = getPeakY(bars, bar, beat);
      for (let x = left; x <= right; x++) {
        setRgbaPixel(image, x, peakY, getScaledColor(color, 0.95));
      }
    }
  }
}

export function drawEqualizerSpray(
  image: RgbaImage,
  beat: number,
  spray: number,
  { bars, style, getColor }: Equalizer,
): void {
  const barWidth = WIDTH / bars;
  const sprayBars = Math.ceil(bars / 2);
  for (let hit = Math.floor(beat - SPRAY_LIFE) + 1; hit <= Math.floor(beat); hit++) {
    const age = beat - hit;
    const random = createRandom(hashSeed(SPRAY_SEED, getModulo(hit, 16)));
    for (let bar = 0; bar < sprayBars; bar++) {
      const color = getColor(bar);
      const originY = getBarTop(style, getBarHeight(bars, style, bar, hit));
      for (let index = 0; index < spray; index++) {
        const origin: Point = [(bar + random()) * barWidth, originY];
        const velocity: Point = [
          getRandomBetween(random, -25, 25),
          -getRandomBetween(random, 40, 100),
        ];
        const head = getBallisticPosition(origin, velocity, SPRAY_GRAVITY, age);
        const tail = getBallisticPosition(origin, velocity, SPRAY_GRAVITY, Math.max(0, age - 0.04));
        const particleColor = getScaledColor(color, getRandomBetween(random, 0.8, 1.2) * (1 - age));
        drawStreak(image, tail, head, particleColor);
        drawDot(image, head, 1, particleColor);
      }
    }
  }
}

function isBehindBar(
  bars: number,
  style: EqualizerStyle,
  x: number,
  y: number,
  beat: number,
): boolean {
  const bar = Math.min(bars - 1, Math.floor((x * bars) / WIDTH));
  const height = getBarHeight(bars, style, bar, beat);
  const top = getBarTop(style, height);
  return y >= top - 1 && y <= top + height;
}

function drawEqualizerSparkles(
  image: RgbaImage,
  beat: number,
  sparkles: number,
  colors: readonly Color[],
  { bars, style }: Equalizer,
): void {
  const isVisible = (x: number, y: number): boolean => !isBehindBar(bars, style, x, y, beat);
  drawSparkles(image, beat, colors, 0.4 + 0.6 * getEnvelope(beat, 4), {
    count: sparkles,
    bottom: HEIGHT - 4,
    seed: [SPARKLE_SEED, 1],
    isVisible,
  });
  for (let hit = Math.floor(beat - BURST_LIFE) + 1; hit <= Math.floor(beat); hit++) {
    const life = (beat - hit) / BURST_LIFE;
    const random = createRandom(hashSeed(SPARKLE_SEED, getModulo(hit, 16)));
    for (let index = 0; index < Math.ceil(sparkles / 4); index++) {
      const x = Math.round(getRandomBetween(random, 3, WIDTH - 3));
      const y = Math.round(getRandomBetween(random, 3, HEIGHT - 4));
      const color = colors[Math.floor(random() * colors.length)] ?? WHITE;
      if (!isVisible(x, y)) {
        continue;
      }
      drawSparkle(image, [x, y], color, (1 - life) ** 1.5, life < 0.4 ? 2 : 1);
    }
  }
}

export const equalizer = defineEffect({
  id: "equalizer",
  name: "Equalizer",
  kind: "pixel",
  params: z.object({
    ...paletteParams,
    colorCount: z.number().int().min(1).max(4).default(1),
    bars: z.number().int().min(4).max(16).default(8),
    style: z.enum(equalizerStyles).default("bottom"),
    sparkles: z.number().int().min(0).max(32).default(14),
  }),
  render(image, { params, beat }) {
    const palette = getPalette(params);
    const colors = Array.from({ length: params.bars }, (_, bar) => getPaletteColor(palette, bar));
    const options: Equalizer = {
      bars: params.bars,
      style: params.style,
      texture: 0,
      getColor: (bar) => colors[bar] ?? WHITE,
    };
    const sparkleColors = colors.map((color) => mix(color, WHITE, 0.45));
    drawEqualizerSparkles(image, beat, params.sparkles, sparkleColors, options);
    drawEqualizer(image, beat, options);
  },
});

import { z } from "zod";
import { colorSchema, getHsvColor, getShiftedHue, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type BitmapFont, drawText, fonts, getLineHeight, measureText } from "../fonts/index.ts";
import { type Color, HEIGHT, WIDTH, fillRgbaImage } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { clamp, getSpan } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { mix, scale } from "./cat-model.ts";
import { getOvershoot } from "./cat-wands.ts";
import { drawHeart } from "./heart.ts";
import { addGlow, getHitSeed } from "./heart-curve.ts";
import { HEART_SEED, drawFloatingHearts } from "./heart-particles.ts";
import { getBeatKick } from "./heart-pulse.ts";

const WHITE: Color = [255, 255, 255];
const BLACK: Color = [0, 0, 0];
const FACE_SEED = hashSeed(HEART_SEED, 0xc1);
const POP_SEED = hashSeed(HEART_SEED, 0xc2);

const FACES = ["^_^", "^o^", "^3^", ">w<", "^w^", "UwU", "OwO", "*_*", "^.^", "o3o", "°o°", "^-^"];

function getBlinkFace(face: string): string {
  const [left = "", mouth = "", right = ""] = face.split("");
  return /[\^*°UOo>]/.test(left) && left === right ? `-${mouth}-` : face;
}

function getFace(beat: number, beats: number): string {
  const change = Math.floor(beat / beats);
  const random = createRandom(getHitSeed(FACE_SEED, change * beats));
  const previous = createRandom(getHitSeed(FACE_SEED, (change - 1) * beats));
  const lastIndex = Math.floor(previous() * FACES.length);
  const index = Math.floor(random() * (FACES.length - 1));
  return FACES[index >= lastIndex ? index + 1 : index] ?? FACES[0] ?? "^_^";
}

function drawCenteredText(
  image: Uint8ClampedArray,
  font: BitmapFont,
  text: string,
  [x, y]: readonly [number, number],
  color: Color,
): void {
  drawText(
    image,
    font,
    text,
    Math.round(x - measureText(font, text) / 2),
    Math.round(y - getLineHeight(font) / 2),
    color,
  );
}

export const heartFace = defineEffect({
  id: "heart-face",
  name: "Heart face",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    beats: z.number().min(1).max(16).default(4),
    every: z.number().min(0.25).max(4).default(1),
    bounce: z.number().min(0).max(1).default(0.5),
    size: z.number().min(30).max(62).default(52),
    y: z.number().min(0).max(64).default(34),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const { kick } = getBeatKick(beat, params.every);
    const hop = Math.sin(Math.PI * getCycle(beat / params.every)) * params.bounce * 4;
    const y = params.y - hop;
    const size = params.size * (1 + 0.08 * params.bounce * kick);
    const face = getFace(beat, params.beats);
    const barBeat = getCycle(beat / 4) * 4;
    const isBlinking = barBeat >= 3.5 && barBeat < 3.7;
    const isKiss = face.includes("3");
    if (isKiss) {
      drawFloatingHearts(
        image,
        beat * 2,
        [WIDTH / 2 + 16, y - 8],
        [color, mix(color, WHITE, 0.5)],
        6,
        { count: 1, lifetime: 2, rise: 18, gap: 0, sizes: [4, 7] },
      );
    }
    drawHeart(image, { x: WIDTH / 2, y, size, color, outline: mix(color, WHITE, 0.5) });
    const font = fonts["spleen-8x16"];
    const text = isBlinking ? getBlinkFace(face) : face;
    const center: [number, number] = [WIDTH / 2, y - size * 0.04];
    const blush = mix(color, WHITE, 0.55);
    const halfWidth = measureText(font, text) / 2;
    addGlow(image, center[0] - halfWidth - 2, center[1] + 4, blush, 0.7, 2.6);
    addGlow(image, center[0] + halfWidth + 2, center[1] + 4, blush, 0.7, 2.6);
    drawCenteredText(image, font, text, center, BLACK);
  },
});

const KAOMOJI = [
  "(^3^)",
  "<3",
  "(>w<)",
  "uwu",
  "^_^",
  "xoxo",
  "(^.^)",
  "<3 <3",
  "owo",
  "(°o°)",
  ":3",
  "(*^_^*)",
];
const POP_HITS = 1.5;

export const kaomojiPop = defineEffect({
  id: "kaomoji-pop",
  name: "Kaomoji pop",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    rate: z.number().min(0.5).max(4).default(1),
    downbeat: z.boolean().default(true),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const accents = [color, mix(color, WHITE, 0.5), getShiftedHue(color, 0.08), WHITE];
    if (params.downbeat) {
      const age = getCycle(beat / 4) * 4;
      const amount = Math.exp(-age * 12);
      if (amount > 0.15) {
        drawHeart(image, {
          x: WIDTH / 2,
          y: HEIGHT / 2,
          size: 58,
          color: scale(mix(color, WHITE, 0.4 * amount), amount * 0.9),
        });
      }
    }
    const newest = Math.floor(beat * params.rate);
    for (let index = newest - Math.ceil(POP_HITS); index <= newest; index++) {
      const hits = beat * params.rate - index;
      if (hits < 0 || hits >= POP_HITS) {
        continue;
      }
      const random = createRandom(getHitSeed(POP_SEED, index / params.rate));
      const text = KAOMOJI[Math.floor(random() * KAOMOJI.length)] ?? "<3";
      const isBig = text.length <= 3 && random() < 0.5;
      const font = isBig
        ? fonts["spleen-12x24"]
        : text.length <= 5
          ? fonts["spleen-8x16"]
          : fonts["spleen-6x12"];
      const width = measureText(font, text);
      const height = getLineHeight(font);
      const x = getRandomBetween(random, 1, Math.max(1, WIDTH - width - 1));
      const y = getRandomBetween(random, 1, Math.max(1, HEIGHT - height - 1));
      const drop = (1 - easings.easeOutCubic(clamp(hits * 6))) * 4;
      const amount = hits < 0.5 ? 1 : Math.exp(-(hits - 0.5) * 7);
      if (amount < 0.05) {
        continue;
      }
      const tone = accents[Math.floor(random() * accents.length)] ?? color;
      const flash = mix(tone, WHITE, 0.6 * Math.exp(-hits * 8));
      drawHeart(image, {
        x: x + width + 3,
        y: y + 2,
        size: 6 * getOvershoot(clamp(hits * 5)),
        color: scale(mix(color, WHITE, 0.3), amount),
      });
      drawText(image, font, text, Math.round(x), Math.round(y - drop), scale(flash, amount));
    }
  },
});

export const kaomojiKiss = defineEffect({
  id: "kaomoji-kiss",
  name: "Kaomoji kiss",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    beats: z.number().min(4).max(32).default(8),
    y: z.number().min(0).max(64).default(40),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const phase = getCycle(beat / params.beats);
    const font = fonts["spleen-6x12"];
    const faceWidth = measureText(font, "(^_^)");
    const approach = easings.easeOutCubic(getSpan(phase, 0, 0.3));
    const leave = easings.easeInCubic(getSpan(phase, 0.86, 1));
    const reach = (WIDTH / 2 + faceWidth) * (1 - approach + leave);
    const isWalking = approach < 1 || leave > 0;
    const hop = isWalking ? Math.abs(Math.sin(beat * Math.PI * 2)) * 2 : 0;
    const isKissing = phase >= 0.3 && phase < 0.55;
    const isAfter = phase >= 0.55;
    const faces = isKissing
      ? ["(^3^)", "(^3^)"]
      : isAfter
        ? ["(^w^)", "(>w<)"]
        : ["(^_^)", "(^_^)"];
    const blush = isAfter ? clamp((phase - 0.55) * 8) : 0;
    const tone = mix(WHITE, mix(color, WHITE, 0.25), blush);
    const { kick } = getBeatKick(beat, 1);
    const heartIn = getSpan(phase, 0.3, 0.38);
    const heartOut = getSpan(phase, 0.8, 0.9);
    if (heartIn > 0 && heartOut < 1) {
      drawHeart(image, {
        x: WIDTH / 2,
        y: params.y - 19,
        size: 22 * getOvershoot(heartIn) * (1 + 0.12 * kick) * (1 - heartOut),
        color: mix(color, WHITE, 0.25 * kick),
        outline: mix(color, WHITE, 0.55),
      });
    }
    if (phase >= 0.3 && phase < 0.86) {
      drawFloatingHearts(
        image,
        beat * 2,
        [WIDTH / 2, params.y - 4],
        [color, mix(color, WHITE, 0.5), getShiftedHue(color, 0.06)],
        26,
        { count: 1, lifetime: 2.4, rise: 30, gap: 0.3, sizes: [4, 7] },
      );
    }
    for (const [side, face] of faces.entries()) {
      const direction = side === 0 ? -1 : 1;
      const x = WIDTH / 2 + direction * (faceWidth / 2 + reach);
      drawCenteredText(image, font, face, [x, params.y - hop], tone);
    }
  },
});

const STREAM_SEED = hashSeed(HEART_SEED, 0xc3);
const STREAM_SIZES = {
  mixed: ["spleen-5x8", "spleen-5x8", "spleen-6x12", "spleen-6x12", "spleen-8x16", "spleen-12x24"],
  small: ["spleen-5x8", "spleen-6x12"],
  big: ["spleen-8x16", "spleen-12x24"],
} as const;
const streamDirections = ["left", "right", "both"] as const;
const streamColors = ["mixed", "solid", "rainbow"] as const;
const STREAM_MIN_SPEED = 10;
const STREAM_MAX_SPEED = 34;

function getStreamColor(
  color: Color,
  mode: (typeof streamColors)[number],
  random: () => number,
): Color {
  if (mode === "solid") {
    return color;
  }
  if (mode === "rainbow") {
    return getHsvColor(random(), getRandomBetween(random, 0.6, 1), 1);
  }
  const accents = [
    color,
    mix(color, WHITE, 0.5),
    getShiftedHue(color, 0.07),
    getShiftedHue(color, -0.07),
    WHITE,
  ];
  return accents[Math.floor(random() * accents.length)] ?? color;
}

export const heartStream = defineEffect({
  id: "heart-stream",
  name: "<3 stream",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    colors: z.enum(streamColors).default("mixed"),
    text: z.string().max(12).default("<3"),
    count: z.number().min(0.5).max(16).default(4),
    sizes: z.enum(["mixed", "small", "big"]).default("mixed"),
    direction: z.enum(streamDirections).default("left"),
    speed: z.number().min(0.25).max(4).default(1),
    flash: z.number().min(0).max(1).default(0.5),
  }),
  render(image, { params, beat }) {
    fillRgbaImage(image, BLACK);
    const color = parseColor(params.color);
    const { kick } = getBeatKick(beat, 1);
    const sizeFonts = STREAM_SIZES[params.sizes];
    const longest = (WIDTH + 80) / (STREAM_MIN_SPEED * params.speed);
    const newest = Math.floor(beat * params.count);
    const hearts = [];
    for (let slot = newest - Math.ceil(longest * params.count); slot <= newest; slot++) {
      const random = createRandom(getHitSeed(STREAM_SEED, slot / params.count));
      const copies = random() < 0.25 ? 0 : random() < 0.75 ? 1 : 2;
      for (let copy = 0; copy < copies; copy++) {
        const start = (slot + random()) / params.count;
        const age = beat - start;
        if (start > beat || age < 0) {
          continue;
        }
        const font = fonts[sizeFonts[Math.floor(random() * sizeFonts.length)] ?? "spleen-5x8"];
        const width = measureText(font, params.text);
        const height = getLineHeight(font);
        const isRight =
          params.direction === "right" || (params.direction === "both" && random() < 0.5);
        const speed =
          getRandomBetween(random, STREAM_MIN_SPEED, STREAM_MAX_SPEED) *
          params.speed *
          (0.6 + height / 40);
        const distance = age * speed;
        if (distance > WIDTH + width + 2) {
          continue;
        }
        const x = isRight ? -width - 1 + distance : WIDTH + 1 - distance;
        const y = getRandomBetween(random, -2, HEIGHT - height + 2);
        const tone = getStreamColor(color, params.colors, random);
        hearts.push({ font, x, y, height, tone, flash: random() < 0.5 ? params.flash : 0 });
      }
    }
    for (const { font, x, y, tone, flash } of hearts.toSorted((a, b) => a.height - b.height)) {
      drawText(
        image,
        font,
        params.text,
        Math.round(x),
        Math.round(y),
        mix(tone, WHITE, flash * kick),
      );
    }
  },
});

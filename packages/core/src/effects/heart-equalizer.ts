import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, clamp } from "./cat-duo.ts";
import { mix } from "./cat-model.ts";
import { drawEqualizer, getBarHeight, getBarTop } from "./equalizer.ts";
import { blendPixel } from "./heart.ts";
import { HEART_SEED } from "./heart-particles.ts";

const WHITE: Color = [255, 255, 255];
const BARS = 8;
const BUBBLE_SEED = hashSeed(HEART_SEED, 0xe1);
const BUBBLE_LIFE = 2.4;
const BUBBLE_RISE = 30;
const BUBBLE_RATE = 4;
const BURST_SEED = hashSeed(HEART_SEED, 0xe2);
const BURST_LIFE = 1.4;
const BURST_RISE = 26;
const MIN_TOP = 20;
const SMALL_HEART = [".#.#.", "#####", ".###.", "..#.."];
const LARGE_HEART = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];

function drawHeartSprite(
  image: RgbaImage,
  sprite: readonly string[],
  [x, y]: readonly [number, number],
  color: Color,
  amount: number,
): void {
  const left = Math.round(x - (sprite[0]?.length ?? 0) / 2);
  const top = Math.round(y - sprite.length / 2);
  for (const [row, line] of sprite.entries()) {
    for (let column = 0; column < line.length; column++) {
      if (line[column] === "#") {
        blendPixel(image, left + column, top + row, color, amount);
      }
    }
  }
}

function getTop(bar: number, beat: number): number {
  return getBarTop("bottom", getBarHeight(BARS, "bottom", bar, beat));
}

function getBarCenter(bar: number): number {
  return ((bar + 0.5) * WIDTH) / BARS - 1;
}

function getOpenBar(random: () => number, start: number): number | undefined {
  const bars = Array.from({ length: BARS }, (_, bar) => bar).filter(
    (bar) => getTop(bar, start) >= MIN_TOP,
  );
  return bars[Math.floor(random() * bars.length)];
}

function isCovered([x, y]: readonly [number, number], beat: number): boolean {
  const bar = Math.min(BARS - 1, Math.max(0, Math.floor(((x + 1) * BARS) / WIDTH)));
  return y + 3 >= getTop(bar, beat);
}

function drawRisingHeart(
  image: RgbaImage,
  beat: number,
  sprite: readonly string[],
  position: readonly [number, number],
  color: Color,
  amount: number,
): void {
  if (!isCovered(position, beat)) {
    drawHeartSprite(image, sprite, position, color, amount);
  }
}

function drawBubbles(image: RgbaImage, beat: number, color: Color): void {
  const newest = Math.floor(beat * BUBBLE_RATE);
  for (let index = newest - Math.ceil(BUBBLE_LIFE * BUBBLE_RATE); index <= newest; index++) {
    const start = index / BUBBLE_RATE;
    const age = beat - start;
    const random = createRandom(hashSeed(BUBBLE_SEED, index));
    const bar = getOpenBar(random, start);
    if (age < 0 || age >= BUBBLE_LIFE || bar === undefined) {
      continue;
    }
    const life = age / BUBBLE_LIFE;
    const drift = getRandomBetween(random, -5, 5) * life;
    const sway = Math.sin(age * 3 + random() * TAU) * 1.5;
    drawRisingHeart(
      image,
      beat,
      SMALL_HEART,
      [getBarCenter(bar) + drift + sway, getTop(bar, start) - 4 - BUBBLE_RISE * life],
      mix(color, WHITE, getRandomBetween(random, 0.2, 0.5)),
      clamp(age * 12) * clamp((1 - life) * 2.5),
    );
  }
}

function drawBursts(
  image: RgbaImage,
  beat: number,
  color: Color,
  every: number,
  pops: number,
): void {
  const pulse = beat / every;
  for (let hit = Math.floor(pulse - BURST_LIFE / every) + 1; hit <= Math.floor(pulse); hit++) {
    const start = hit * every;
    const age = beat - start;
    const life = age / BURST_LIFE;
    const random = createRandom(hashSeed(BURST_SEED, hit));
    for (let index = 0; index < pops; index++) {
      const bar = getOpenBar(random, start);
      const spread = getRandomBetween(random, -8, 8);
      const sway = Math.sin(age * 5 + random() * TAU) * 1.5;
      if (bar === undefined) {
        continue;
      }
      drawRisingHeart(
        image,
        beat,
        index % 2 === 0 ? LARGE_HEART : SMALL_HEART,
        [
          getBarCenter(bar) + spread * easings.easeOutQuad(clamp(age * 2)) + sway,
          getTop(bar, start) - 5 - BURST_RISE * easings.easeOutQuad(life),
        ],
        mix(color, WHITE, getRandomBetween(random, 0.35, 0.7)),
        clamp((1 - life) * 3),
      );
    }
  }
}

export const heartEqualizer = defineEffect({
  id: "heart-equalizer",
  name: "Heart equalizer",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.25).max(4).default(1),
    pops: z.number().int().min(0).max(8).default(3),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const capColor = mix(color, WHITE, 0.55);
    drawEqualizer(image, beat, {
      bars: BARS,
      style: "bottom",
      texture: 0,
      getColor: () => color,
      getCapColor: () => capColor,
    });
    drawBubbles(image, beat, color);
    drawBursts(image, beat, color, params.every, params.pops);
  },
});

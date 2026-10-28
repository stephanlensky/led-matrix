import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, clamp } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { getOvershoot } from "./cat-wands.ts";
import { blendPixel, drawHeart } from "./heart.ts";

export const HEART_SEED = 0x10fe;
const WHITE: Color = [255, 255, 255];

export type FloatingHearts = {
  count?: number;
  lifetime?: number;
  rise?: number;
  gap?: number;
  sizes?: readonly [number, number];
  seed?: number;
};

export function drawFloatingHearts(
  image: RgbaImage,
  beat: number,
  [x, y]: readonly [number, number],
  colors: readonly Color[],
  spread: number,
  {
    count = 2,
    lifetime = 2.4,
    rise = 30,
    gap = 0.35,
    sizes = [5, 9],
    seed = HEART_SEED,
  }: FloatingHearts = {},
): void {
  const newest = Math.floor(beat);
  for (let index = newest - Math.ceil(lifetime); index <= newest; index++) {
    const random = createRandom(hashSeed(seed, index));
    for (let heart = 0; heart < count; heart++) {
      const age = beat - index - heart / count;
      if (age < 0 || age >= lifetime) {
        continue;
      }
      const life = age / lifetime;
      const startX = x + (random() < 0.5 ? -1 : 1) * getRandomBetween(random, spread * gap, spread);
      const size = getRandomBetween(random, sizes[0], sizes[1]) * getOvershoot(clamp(age * 4));
      const sway = Math.sin(age * 4 + random() * TAU) * 2;
      drawHeart(image, {
        x: startX + sway,
        y: y - 4 - rise * easings.easeOutQuad(life),
        size,
        color: colors[Math.floor(random() * colors.length)] ?? WHITE,
        amount: clamp((1 - life) * 3),
        angle: sway * 0.08,
      });
    }
  }
}

export function drawSparkle(
  image: RgbaImage,
  [x, y]: readonly [number, number],
  color: Color,
  amount: number,
  arm: number,
): void {
  blendPixel(image, x, y, WHITE, amount);
  for (let step = 1; step <= arm; step++) {
    const fade = amount * (step === 1 ? 0.9 : 0.5);
    blendPixel(image, x + step, y, color, fade);
    blendPixel(image, x - step, y, color, fade);
    blendPixel(image, x, y + step, color, fade);
    blendPixel(image, x, y - step, color, fade);
  }
}

export type Sparkles = {
  count?: number;
  bottom?: number;
  seed?: readonly number[];
  isVisible?: (x: number, y: number) => boolean;
};

export function drawSparkles(
  image: RgbaImage,
  beat: number,
  colors: readonly Color[],
  amount: number,
  {
    count = 10,
    bottom = HEIGHT - 16,
    seed = [HEART_SEED, 0x5a],
    isVisible = () => true,
  }: Sparkles = {},
): void {
  for (let index = 0; index < count; index++) {
    const random = createRandom(hashSeed(...seed, index));
    const life = getCycle(beat / 2 + random());
    const twinkle = Math.sin(life * Math.PI);
    const x = Math.round(getRandomBetween(random, 3, WIDTH - 3));
    const y = Math.round(getRandomBetween(random, 3, bottom));
    const color = colors[index % colors.length] ?? WHITE;
    if (!isVisible(x, y)) {
      continue;
    }
    drawSparkle(image, [x, y], color, twinkle * amount, twinkle > 0.6 ? 2 : 1);
  }
}

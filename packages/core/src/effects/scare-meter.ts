import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { fonts, drawText, measureText } from "../fonts/index.ts";
import { type Color, type RgbaImage, HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";

const RAIN_SEED = 0x5ca7e;
const SHAKE_SEED = 0x5ca7f;
const SPRAY_SEED = 0x5ca80;
const TEXT_SEED = 0x5ca81;
const SPRAY_STEP = 0.25;
const SPRAY_LIFETIME = 2;
const SPRAY_GRAVITY = 160;
const SPRAY_TRAIL = 0.05;
const RAIN_SPEEDS = [0.25, 0.5, 0.75] as const;
const BAR_WIDTH = 54;
const BAR_HEIGHT = 12;
const BAR_CENTER_Y = 30;
const LABEL_TOP = 3;
const PERCENT_TOP = 44;
const TEXTURE_SEED = 0x5ca82;
const DRIP_SEED = 0x5ca83;
const DRIP_COUNT = 7;
const DRIP_BEATS = 2;
const DRIP_HANG = 0.7;
const TRACK_COLOR: Color = [14, 0, 0];

function getScaledColor([r, g, b]: Color, scale: number): Color {
  return [r * scale, g * scale, b * scale];
}

function getNoise(...values: readonly number[]): number {
  return hashSeed(TEXTURE_SEED, ...values) / 4_294_967_296;
}

type BarStyle = {
  left: number;
  top: number;
  width: number;
  height: number;
  filled: number;
  brightness: number;
  beat: number;
  color: Color;
};

function drawBar(
  image: RgbaImage,
  { left, top, width, height, filled, brightness, beat, color }: BarStyle,
): void {
  const right = width - 1;
  const bottom = height - 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const noise = getNoise(x, y);
      const isCorner = (x === 0 || x === right) && (y === 0 || y === bottom);
      const isBorder = x === 0 || y === 0 || x === right || y === bottom;
      if (isCorner) {
        continue;
      }
      if (isBorder) {
        if (noise < 0.18) {
          continue;
        }
        const crust = getScaledColor(color, 0.22 + 0.25 * noise);
        setRgbaPixel(image, left + x, top + y, crust);
        if (noise > 0.82 && (y === 0 || y === bottom)) {
          setRgbaPixel(image, left + x, top + (y === 0 ? -1 : height), crust);
        }
        continue;
      }
      const isGap = x === 1 || y === 1 || x === right - 1 || y === bottom - 1;
      const wave = filled > 0 ? Math.round(Math.sin(y * 0.8 + beat * Math.PI) * 1.5) : 0;
      const isFilled = !isGap && x - 2 < Math.min(width - 4, filled + wave);
      const pixel: Color = isGap
        ? [0, 0, 0]
        : isFilled
          ? getScaledColor(color, brightness * (0.65 + 0.35 * noise) * (1 - (y / height) * 0.45))
          : getScaledColor(TRACK_COLOR, 0.6 + 0.8 * noise);
      setRgbaPixel(image, left + x, top + y, pixel);
    }
  }
}

function drawDrips(
  image: RgbaImage,
  left: number,
  top: number,
  filled: number,
  beat: number,
  color: Color,
): void {
  for (let index = 0; index < DRIP_COUNT; index++) {
    const random = createRandom(hashSeed(DRIP_SEED, index));
    const offset = Math.floor(random() * BAR_WIDTH);
    if (offset >= filled) {
      continue;
    }
    const length = Math.round(getRandomBetween(random, 2, 5));
    const cycle = (((beat / DRIP_BEATS + random()) % 1) + 1) % 1;
    const hang = Math.min(1, cycle / DRIP_HANG);
    const hangLength = Math.round(hang * length);
    for (let y = 1; y <= hangLength; y++) {
      setRgbaPixel(image, left + offset, top + y, getScaledColor(color, 0.75 - (y / length) * 0.3));
    }
    if (cycle > DRIP_HANG) {
      const fall = (cycle - DRIP_HANG) / (1 - DRIP_HANG);
      const dropY = top + length + 1 + Math.round(fall ** 2 * 14);
      setRgbaPixel(image, left + offset, dropY, getScaledColor(color, 0.8));
    }
  }
}

type TextStyle = {
  jitter: number;
  flash: number;
  seed: number;
  colors: readonly [Color, Color];
};

function drawShakingText(
  image: RgbaImage,
  font: (typeof fonts)[keyof typeof fonts],
  text: string,
  top: number,
  { jitter, flash, seed, colors }: TextStyle,
): void {
  let left = Math.floor((WIDTH - measureText(font, text)) / 2);
  for (const [index, character] of text.split("").entries()) {
    const random = createRandom(hashSeed(seed, index));
    const offsetX = Math.round(getRandomBetween(random, -jitter, jitter) * 0.5);
    const offsetY = Math.round(getRandomBetween(random, -jitter, jitter));
    const color = random() < flash ? colors[1] : colors[0];
    drawText(image, font, character, left + offsetX, top + offsetY, color);
    left += measureText(font, character);
  }
}

function drawRain(
  image: RgbaImage,
  count: number,
  speed: number,
  beat: number,
  color: Color,
): void {
  for (let index = 0; index < count; index++) {
    const random = createRandom(hashSeed(RAIN_SEED, index));
    const x = Math.floor(random() * WIDTH);
    const dropSpeed = (RAIN_SPEEDS[Math.floor(random() * RAIN_SPEEDS.length)] ?? 0.5) * speed;
    const length = Math.round(getRandomBetween(random, 4, 11));
    const phase = random();
    const fall = (((beat * dropSpeed + phase) % 1) + 1) % 1;
    const head = Math.floor(fall * (HEIGHT + length));
    for (let offset = 0; offset < length; offset++) {
      const fade = offset === 0 ? 1.4 : (1 - offset / length) * 0.8;
      setRgbaPixel(image, x, head - offset, getScaledColor(color, fade));
    }
  }
}

function drawSpray(
  image: RgbaImage,
  count: number,
  period: number,
  beat: number,
  color: Color,
): void {
  const stepsPerPeriod = Math.round(period / SPRAY_STEP);
  const first = Math.floor((beat - SPRAY_LIFETIME) / SPRAY_STEP) + 1;
  const left = (WIDTH - BAR_WIDTH) / 2;
  const top = BAR_CENTER_Y - BAR_HEIGHT / 2;
  for (let step = first; step * SPRAY_STEP <= beat; step++) {
    const age = beat - step * SPRAY_STEP;
    const seedIndex = ((step % stepsPerPeriod) + stepsPerPeriod) % stepsPerPeriod;
    const burst = step % 4 === 0 ? count : Math.round(count / 4);
    for (let index = 0; index < burst; index++) {
      const random = createRandom(hashSeed(SPRAY_SEED, seedIndex, index));
      const x = left + random() * BAR_WIDTH;
      const isTop = random() < 0.7;
      const y = isTop ? top : top + BAR_HEIGHT;
      const vx = (x - WIDTH / 2) * 1.5 + getRandomBetween(random, -30, 30);
      const vy = isTop ? -getRandomBetween(random, 30, 90) : getRandomBetween(random, 0, 30);
      const shade = getRandomBetween(random, 0.7, 1.1) * (1 - (age / SPRAY_LIFETIME) * 0.5);
      const getPosition = (time: number) => [
        x + vx * time,
        y + vy * time + 0.5 * SPRAY_GRAVITY * time ** 2,
      ];
      const [headX = 0, headY = 0] = getPosition(age);
      const [tailX = 0, tailY = 0] = getPosition(Math.max(0, age - SPRAY_TRAIL));
      const samples = Math.max(1, Math.ceil(Math.hypot(headX - tailX, headY - tailY)));
      for (let sample = 0; sample <= samples; sample++) {
        const along = sample / samples;
        const fade = 0.4 + 0.6 * along;
        setRgbaPixel(
          image,
          Math.round(tailX + (headX - tailX) * along),
          Math.round(tailY + (headY - tailY) * along),
          getScaledColor(color, shade * fade),
        );
      }
      const headColor = getScaledColor(color, shade);
      for (const [offsetX, offsetY] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        setRgbaPixel(image, Math.round(headX) + offsetX, Math.round(headY) + offsetY, headColor);
      }
    }
  }
}

export const scareMeter = defineEffect({
  id: "scare-meter",
  name: "Scare meter",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    label: z.string().max(16).default("SCARE METER"),
    level: z.number().min(0).max(1).default(0.5),
    pulse: z.number().int().min(0).max(8).default(4),
    shake: z.number().int().min(0).max(3).default(1),
    textShake: z.number().int().min(0).max(4).default(1),
    rain: z.number().int().min(0).max(96).default(28),
    rainSpeed: z.number().int().min(1).max(4).default(1),
    explosion: z.number().int().min(0).max(64).default(0),
    explosionPeriod: z.number().int().min(1).max(256).default(16),
    color: colorSchema.default("#ff0000"),
    textColor: colorSchema.default("#ffffff"),
    rainColor: colorSchema.default("#7a0000"),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const textColor = parseColor(params.textColor);
    drawRain(image, params.rain, params.rainSpeed, beat, parseColor(params.rainColor));

    const level = params.level;
    const beatFraction = ((beat % 1) + 1) % 1;
    const envelope = (1 - beatFraction) ** 2;
    const grow = Math.round(params.pulse * level * envelope);
    const shakeRandom = createRandom(hashSeed(SHAKE_SEED, Math.floor(beat * 4)));
    const shakeAmount = level > 0.75 ? params.shake : 0;
    const shakeX = Math.round(getRandomBetween(shakeRandom, -shakeAmount, shakeAmount));
    const shakeY = Math.round(getRandomBetween(shakeRandom, -shakeAmount, shakeAmount));

    const width = BAR_WIDTH + grow * 2;
    const height = BAR_HEIGHT + grow * 2;
    const left = Math.floor((WIDTH - width) / 2) + shakeX;
    const top = BAR_CENTER_Y - Math.floor(height / 2) + shakeY;
    const innerWidth = width - 4;
    const filled = Math.round(innerWidth * level);
    const brightness = 0.55 + 0.45 * Math.max(level, envelope * level);

    drawDrips(image, left + 2, top + height - 1, filled, beat, color);
    drawBar(image, { left, top, width, height, filled, brightness, beat, color });

    drawSpray(image, params.explosion, params.explosionPeriod, beat, color);
    const isMaxed = level >= 1;
    const textSeed = hashSeed(TEXT_SEED, Math.floor(beat * (isMaxed ? 8 : 4)));
    const textJitter = level > 0.5 ? Math.round(params.textShake * (level - 0.5) * 2) : 0;
    const textFlash = isMaxed ? 0.5 : beatFraction < 0.12 ? level ** 2 : 0;
    const textColors = [textColor, color] as const;
    drawShakingText(image, fonts["spleen-5x8"], params.label, LABEL_TOP, {
      jitter: textJitter,
      flash: textFlash,
      seed: textSeed,
      colors: isMaxed && Math.floor(beat * 2) % 2 === 1 ? [color, textColor] : textColors,
    });
    const bounce = Math.round(envelope * level * 2);
    drawShakingText(
      image,
      fonts["spleen-8x16"],
      `${Math.floor(level * 100)}%`,
      PERCENT_TOP + shakeY + bounce,
      {
        jitter: textJitter,
        flash: isMaxed ? 0.5 : textFlash,
        seed: hashSeed(textSeed, 1),
        colors: isMaxed && beatFraction < 0.5 ? [color, textColor] : textColors,
      },
    );
  },
});

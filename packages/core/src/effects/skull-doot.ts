import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { fonts, drawText, measureText } from "../fonts/index.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import {
  type Raster,
  createRaster,
  fillRasterCircle,
  getRotation,
  resolveRaster,
} from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { type Palette, createSprite, drawSprite } from "../sprite.ts";
import { clamp, getSpan, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { scale } from "./cat-model.ts";
import { type SkullPlacement, drawSkull, getBellPoint } from "./skull-model.ts";

export const dootPatterns = ["doot-doot", "beat", "offbeat", "gallop"] as const;

type DootPattern = (typeof dootPatterns)[number];

type Doot = { age: number; index: number; isBig: boolean };

type Horn = { x: number; y: number; size: number; phase: number };

const BAR = 4;
const DOOT_LENGTH = 0.45;
const TEXT_LIFETIME = 0.9;
const WAVE_LIFETIME = 0.8;
const LUNGE_PERIOD = 16;

const DOOT_TIMES: Readonly<Record<DootPattern, readonly number[]>> = {
  "doot-doot": [0, 1],
  beat: [0, 1, 2, 3],
  offbeat: [0.5, 1.5, 2.5, 3.5],
  gallop: [0, 0.75, 1, 2, 2.75, 3],
};

const noteSprite = createSprite(["..##", "..#.", "..#.", "###.", "###."]);

function getDootTimes(pattern: DootPattern, bar: number, lunge: boolean): number[] {
  const times = DOOT_TIMES[pattern].map((time) => bar * BAR + time);
  const lungeTime = Math.floor((bar * BAR) / LUNGE_PERIOD) * LUNGE_PERIOD + LUNGE_PERIOD - 1;
  const isLungeBar = lunge && lungeTime >= bar * BAR && lungeTime < (bar + 1) * BAR;
  return isLungeBar ? [...times.filter((time) => time < lungeTime - 0.5), lungeTime] : times;
}

function getLatestDoot(beat: number, pattern: DootPattern, lunge: boolean): Doot {
  const bar = Math.floor(beat / BAR);
  let latest: Doot = { age: Infinity, index: 0, isBig: false };
  for (const barOffset of [0, -1]) {
    for (const time of getDootTimes(pattern, bar + barOffset, lunge)) {
      const age = beat - time;
      if (age >= 0 && age < latest.age) {
        const isBig = lunge && getCycle((time + 1) / LUNGE_PERIOD) === 0;
        latest = { age, index: Math.round(time * 4), isBig };
      }
    }
  }
  return latest;
}

function getBlow(age: number): number {
  if (age < 0.06) {
    return easings.easeOutCubic(age / 0.06);
  }
  return 1 - easings.easeInQuad(clamp((age - 0.06) / (DOOT_LENGTH - 0.06)));
}

function getLunge(beat: number): number {
  const cycle = getCycle(beat / LUNGE_PERIOD) * LUNGE_PERIOD;
  const approach = easings.easeInCubic(getSpan(cycle, LUNGE_PERIOD - 4, LUNGE_PERIOD - 1));
  const retreat = easings.easeInOutCubic(getSpan(cycle, LUNGE_PERIOD - 0.5, LUNGE_PERIOD));
  return approach * (1 - retreat);
}

function drawWaves(raster: Raster, placement: SkullPlacement, age: number, color: Color): void {
  if (age >= WAVE_LIFETIME) {
    return;
  }
  const [bellX, bellY] = getBellPoint(placement);
  const [aheadX, aheadY] = getBellPoint(placement, 1);
  const direction = Math.atan2(aheadY - bellY, aheadX - bellX);
  for (let wave = 0; wave < 3; wave++) {
    const waveAge = age - wave * 0.08;
    if (waveAge < 0) {
      continue;
    }
    const life = waveAge / WAVE_LIFETIME;
    const radius = 2 + placement.size * 1.6 * easings.easeOutCubic(life);
    const fade = (1 - life) ** 1.5;
    const dots = 9;
    for (let dot = 0; dot < dots; dot++) {
      const angle = direction + ((dot / (dots - 1)) * 2 - 1) * toRadians(55);
      fillRasterCircle(
        raster,
        bellX + Math.cos(angle) * radius,
        bellY + Math.sin(angle) * radius,
        0.45 + 0.3 * fade,
        scale(color, fade),
      );
    }
  }
}

function drawNotes(
  image: RgbaImage,
  placement: SkullPlacement,
  { age, index }: Doot,
  palette: Palette,
): void {
  if (age >= TEXT_LIFETIME) {
    return;
  }
  const [bellX, bellY] = getBellPoint(placement);
  const random = createRandom(hashSeed(0xd007, index));
  for (let note = 0; note < 2; note++) {
    const angle = getRandomBetween(random, -1.6, 0.2);
    const distance = 4 + age * getRandomBetween(random, 18, 30);
    const wobble = Math.sin(age * 12 + note * 2) * 1.5;
    drawSprite(
      image,
      noteSprite,
      bellX + Math.cos(angle) * distance + wobble - 2,
      bellY + Math.sin(angle) * distance - 2,
      palette,
    );
  }
}

function drawDoot(
  image: RgbaImage,
  placement: SkullPlacement,
  { age, index, isBig }: Doot,
  color: Color,
): void {
  if (age >= TEXT_LIFETIME) {
    return;
  }
  const font = isBig
    ? fonts["spleen-12x24"]
    : placement.size < 12
      ? fonts["spleen-5x8"]
      : fonts["spleen-8x16"];
  const text = isBig ? "DOOT" : "doot";
  const width = measureText(font, text);
  const height = font.ascent + font.descent;
  const [bellX, bellY] = getBellPoint(placement);
  const pop = easings.easeOutCubic(clamp(age / 0.15));
  const rise = age * (height / 2);
  const shake = age < 0.3 ? (hashSeed(0x7e, index, Math.floor(age * 30)) % 3) - 1 : 0;
  const x = isBig
    ? (WIDTH - width) / 2 + shake
    : Math.min(WIDTH - width, Math.max(0, bellX - width / 2 + 2 * pop)) + shake;
  const y = isBig ? HEIGHT - height - 2 : Math.max(0, bellY - height - 4 - 4 * pop - rise);
  const fade = 1 - easings.easeInQuad(getSpan(age, TEXT_LIFETIME * 0.5, TEXT_LIFETIME));
  drawText(image, font, text, x, y, scale(color, fade));
}

function getHorns(count: number, size: number): Horn[] {
  if (count === 1) {
    return [{ x: 20, y: 24, size, phase: 0 }];
  }
  const hornSize = size * (count === 2 ? 0.7 : 0.55);
  return Array.from({ length: count }, (_, index) => ({
    x: 12 + (index % 2) * 6,
    y: 8 + index * (count === 2 ? 30 : 19),
    size: hornSize,
    phase: index * 0.5,
  }));
}

export const skullDoot = defineEffect({
  id: "skull-doot",
  name: "Skull doot",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    pattern: z.enum(dootPatterns).default("doot-doot"),
    count: z.number().int().min(1).max(3).default(1),
    size: z.number().min(6).max(30).default(15),
    lunge: z.boolean().default(true),
    boneColor: colorSchema.default("#e8dca8"),
    brassColor: colorSchema.default("#e8a818"),
    eyeColor: colorSchema.default("#ff3010"),
    textColor: colorSchema.default("#ffffff"),
    waveColor: colorSchema.default("#ffd040"),
  }),
  render(image, { params, beat }) {
    const colors = {
      bone: parseColor(params.boneColor),
      brass: parseColor(params.brassColor),
      eye: parseColor(params.eyeColor),
    };
    const textColor = parseColor(params.textColor);
    const waveColor = parseColor(params.waveColor);
    const notePalette: Palette = { "#": waveColor };
    const lunge = params.lunge && params.count === 1 ? getLunge(beat) : 0;
    const raster = createRaster();
    const overlays: [placement: SkullPlacement, doot: Doot][] = [];
    for (const horn of getHorns(params.count, params.size)) {
      const doot = getLatestDoot(
        beat - horn.phase,
        params.pattern,
        params.lunge && params.count === 1,
      );
      const blow = getBlow(doot.age);
      const bob = Math.sin((beat - horn.phase) * Math.PI);
      const placement: SkullPlacement = {
        x: horn.x + (WIDTH / 2 - 10 - horn.x) * lunge - blow * 1.5,
        y: horn.y + bob * 1.2 + (HEIGHT / 2 - 10 - horn.y) * lunge - blow,
        size: horn.size * (1 + 0.08 * blow + 0.7 * lunge),
        rotate: getRotation(
          toRadians(8 - 12 * blow + 6 * bob - 8 * lunge),
          toRadians(62 - 45 * lunge),
          toRadians(-6 * blow + 4 * bob),
        ),
        jaw: 0.2 * blow,
        flare: 0.6 * blow * (1 - 0.5 * lunge),
        glow: blow,
        flash: doot.isBig ? 0.5 * blow : 0,
      };
      drawSkull(raster, placement, colors);
      drawWaves(raster, placement, doot.age, waveColor);
      overlays.push([placement, doot]);
    }
    resolveRaster(raster, image);
    for (const [placement, doot] of overlays) {
      drawNotes(image, placement, doot, notePalette);
      drawDoot(image, placement, doot, textColor);
    }
  },
});

import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { easings } from "../keyframes.ts";
import { type Color, type RgbaImage, WIDTH } from "../frame.ts";
import { createRaster, resolveRaster } from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import {
  type BalloonCat,
  drawBalloonCat,
  drawBalloonCatEyes,
  drawBalloons,
  drawStreaks,
  getBalloonCatPlacement,
  getBalloonColors,
} from "./cat-balloons.ts";
import { type CatId, TAU, catIds, furParams, getCoat, getSpan, toRadians } from "./cat-duo.ts";
import { eyeStyles } from "./cat-face.ts";
import { mix } from "./cat-model.ts";
import { drawHeart } from "./heart.ts";
import { getBeatKick } from "./heart-pulse.ts";

const WHITE: Color = [255, 255, 255];
const SOLO_X = WIDTH / 2 - 6;
const FIRST_X = 11;
const SECOND_X = 36;
const BASE_Y = 47;
const ENTRY: readonly [x: number, y: number] = [84, 84];
const BUMP_BEAT = 9;
const SETTLE_BEATS = 4;
const CONTACT_GAP = 3;
const HEART_COUNT = 6;
const HEART_LIFETIME = 4;
const NUZZLE_EVERY = 8;
const FIRST_SPREAD = -7;
const SECOND_SPREAD = 2;
const CENTER_SHIFT = 10;

export const meetPhases = ["meet", "together"] as const;

type Pair = { first: BalloonCat; second: BalloonCat; bump: number };

function getSecondCat(cat: CatId): CatId {
  return cat === "tabby" ? "black" : "tabby";
}

function getBumpWave(age: number): number {
  return age < 0 ? 0 : Math.exp(-1.6 * age) * Math.sin(age * Math.PI * 1.5);
}

function getMeetPair(beat: number, size: number, every: number): Pair {
  const { kick } = getBeatKick(beat, every);
  const glide = easings.easeInOutSine(getSpan(beat, 0, 8));
  const firstDrift = Math.sin((beat / 8) * TAU) * (1 - glide);
  const age = beat - BUMP_BEAT;
  const wave = getBumpWave(age);
  const approach = getSpan(beat, 0, BUMP_BEAT);
  const coast = (1 - (1 - approach) ** 2) * 0.65 + approach * 0.35;
  const contactX = SECOND_X - CONTACT_GAP;
  const rebound = age < 0 ? 0 : CONTACT_GAP * (1 - Math.exp(-1.2 * age) * Math.cos(age * 2));
  const rise = easings.easeOutCubic(getSpan(beat, 0, BUMP_BEAT - 1));
  const center = CENTER_SHIFT * easings.easeInOutSine(getSpan(beat, BUMP_BEAT + 1, 15));
  const facing = easings.easeInOutSine(getSpan(beat, BUMP_BEAT - 1, BUMP_BEAT + SETTLE_BEATS));
  const first: BalloonCat = {
    x: SOLO_X + (FIRST_X - SOLO_X) * glide + 4 * firstDrift - 3 * wave + center,
    y: BASE_Y,
    size,
    beat,
    drift: firstDrift,
    kick,
    turn: toRadians(14 * facing),
    roll: toRadians(14 * wave),
    spread: FIRST_SPREAD * glide,
    balloonShift: -center,
  };
  const second: BalloonCat = {
    x: ENTRY[0] + (contactX - ENTRY[0]) * coast + rebound + center,
    y: ENTRY[1] + (BASE_Y - ENTRY[1]) * rise,
    size,
    beat,
    drift: 0,
    kick,
    turn: toRadians(-24 + 10 * facing),
    roll: toRadians(-8 * wave),
    reach: [-0.9, -0.1 - 0.4 * wave, 0.3],
    spread: SECOND_SPREAD,
    balloonShift: -center,
  };
  return { first, second, bump: Math.max(0, wave) };
}

function getNuzzle(beat: number): number {
  const phase = ((beat % NUZZLE_EVERY) + NUZZLE_EVERY) % NUZZLE_EVERY;
  return Math.sin(Math.PI * getSpan(phase, NUZZLE_EVERY / 2 - 1, NUZZLE_EVERY / 2 + 2)) ** 2;
}

function getTogetherPair(beat: number, size: number, every: number): Pair {
  const { kick } = getBeatKick(beat, every);
  const drift = 0.5 * Math.sin((beat / 16) * TAU);
  const nuzzle = getNuzzle(beat);
  const shared = { y: BASE_Y, size, beat, drift, kick };
  return {
    first: {
      ...shared,
      x: FIRST_X + CENTER_SHIFT + 3 * drift + 1.5 * nuzzle,
      turn: toRadians(14),
      tilt: toRadians(-16 * nuzzle),
      spread: FIRST_SPREAD,
      balloonShift: -CENTER_SHIFT,
    },
    second: {
      ...shared,
      x: SECOND_X + CENTER_SHIFT + 3 * drift - 1.5 * nuzzle,
      turn: toRadians(-14),
      tilt: toRadians(16 * nuzzle),
      reach: [-0.9, -0.1, 0.3],
      spread: SECOND_SPREAD,
      balloonShift: -CENTER_SHIFT,
    },
    bump: 0,
  };
}

function drawFallingHearts(
  image: RgbaImage,
  x: number,
  y: number,
  age: number,
  seed: number,
  color: Color,
): void {
  if (age < 0 || age >= HEART_LIFETIME) {
    return;
  }
  for (let index = 0; index < HEART_COUNT; index++) {
    const random = createRandom(hashSeed(seed, index));
    const angle = (index / HEART_COUNT) * TAU + getRandomBetween(random, -0.4, 0.4);
    const pop = easings.easeOutCubic(getSpan(age, 0, 0.75)) * getRandomBetween(random, 4, 8);
    const fall = age ** 1.6 * getRandomBetween(random, 2.5, 4);
    const life = age / HEART_LIFETIME;
    drawHeart(image, {
      x: x + Math.cos(angle) * pop + Math.sin(age * 3 + index) * 0.8,
      y: y + Math.sin(angle) * pop * 0.7 + fall,
      size: getRandomBetween(random, 4, 6) * (1 - 0.3 * life),
      color: index % 2 === 0 ? mix(color, WHITE, 0.25) : mix(color, WHITE, 0.65),
      amount: 1 - life ** 2,
    });
  }
}

export const catBalloonMeet = defineEffect({
  id: "cat-balloon-meet",
  name: "Cat heart balloons meet",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...furParams,
    cat: z.enum(catIds).default("black"),
    phase: z.enum(meetPhases).default("meet"),
    every: z.number().min(0.25).max(4).default(1),
    eyes: z.enum(eyeStyles).default("hearts"),
    heartColor: colorSchema.default("#ff2a6d"),
    size: z.number().min(6).max(16).default(11),
  }),
  render(image, { params, beat }) {
    const heart = parseColor(params.heartColor);
    const colors = getBalloonColors(heart);
    const pair =
      params.phase === "meet"
        ? getMeetPair(beat, params.size, params.every)
        : getTogetherPair(beat, params.size, params.every);
    drawStreaks(image, beat, mix(heart, WHITE, 0.3));
    const cats = [
      { cat: pair.first, id: params.cat },
      { cat: pair.second, id: getSecondCat(params.cat) },
    ].map(({ cat, id }) => ({ cat, id, placement: getBalloonCatPlacement(cat) }));
    const raster = createRaster();
    for (const { id, placement } of cats) {
      drawBalloonCat(raster, placement, getCoat({ ...params, cat: id }), params.eyes);
    }
    resolveRaster(raster, image);
    for (const { cat, placement } of cats.toReversed()) {
      drawBalloons(image, placement, cat, colors);
    }
    for (const { cat, id, placement } of cats) {
      const eyeColor = parseColor(id === "tabby" ? params.tabbyEyeColor : params.eyeColor);
      drawBalloonCatEyes(image, placement, params.eyes, eyeColor, heart, cat.kick + pair.bump);
    }
    const middleX = (pair.first.x + pair.second.x) / 2 + 2;
    if (params.phase === "meet") {
      drawFallingHearts(image, middleX, BASE_Y - 10, beat - BUMP_BEAT, 0x5eed, heart);
      return;
    }
    const nuzzleAge = (((beat - NUZZLE_EVERY / 2) % NUZZLE_EVERY) + NUZZLE_EVERY) % NUZZLE_EVERY;
    drawFallingHearts(image, middleX, BASE_Y - 12, nuzzleAge, 0x2ea2 + Math.floor(beat / 8), heart);
  },
});

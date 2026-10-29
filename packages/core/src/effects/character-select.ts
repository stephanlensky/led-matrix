import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, type RgbaImage, WIDTH, createRgbaImage } from "../frame.ts";
import { drawText, fonts, measureText } from "../fonts/index.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import {
  type Raster,
  type Rotation,
  compose,
  createRaster,
  getRotation,
  resolveRaster,
} from "../mesh.ts";
import { TAU, clamp, furParams, getCoats, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import { type Coat, SIT, TUCK, UNSIT, WHITE, drawCat, mix } from "./cat-model.ts";
import { HERO_CENTER, type HeroPose, SOLE_Y, drawHero } from "./frieren-model.ts";
import { getArm } from "./hero-love.ts";
import { blendPixel } from "./heart.ts";
import { getBeatKick } from "./heart-pulse.ts";
import { type HunterPose, drawHunter } from "./hunter-model.ts";

export const selectCharacters = [
  "frieren",
  "himmel",
  "zoey",
  "rumi",
  "mira",
  "tabby",
  "black",
] as const;

type SelectCharacter = (typeof selectCharacters)[number];

type Press = [beat: number, direction: number];

type Slot = {
  x: number;
  floor: number;
  size: number;
  yaw: number;
  hop: number;
  cheer: number;
  flash: number;
};

const SELECT_BEATS = 32;
const INTRO_BEATS = 3.5;
const CONFIRM_BEAT = 25;
const SPIN_BEATS = 2.5;
const SPACING = 21;
const FLOOR = 50;
const BIG_SIZE = 14;
const SMALL_SIZE = 9.5;
const ARROW_GAP = 13;
const ARROW_Y = 33;
const CAT_SCALE = 0.9;
const CAT_FLOOR = 1;
const START_OFFSET = -10;
const STEP_BEATS = 0.3;
const SPARK_SEED = 0x5e1ec7;
const TWINKLE_SEED = 0x7a1;

const TITLE = "SELECT";

const ARROW = ["#..", "##.", "###", "##.", "#.."];

const presses: readonly Press[] = [
  [5, 1],
  [6, 1],
  [10, 1],
  [10.4, 1],
  [10.8, 1],
  [14.5, -1],
  [15.5, 1],
  [15.9, 1],
  [16.3, 1],
  [16.7, 1],
  [17.1, 1],
  [21, 1],
];

function easeOutBack(value: number): number {
  const overshoot = 1.7;
  return 1 + (overshoot + 1) * (value - 1) ** 3 + overshoot * (value - 1) ** 2;
}

function getCursor(story: number): number {
  let cursor = START_OFFSET;
  for (const [beat, direction] of presses) {
    cursor += direction * easings.easeOutCubic(clamp((story - beat) / STEP_BEATS));
  }
  return cursor;
}

function getActivePress(story: number): Press | undefined {
  return presses.find(([beat]) => story >= beat && story < beat + STEP_BEATS);
}

function getIdleBeats(story: number): number {
  const last = presses.findLast(([beat]) => beat <= story);
  return story - (last?.[0] ?? 0);
}

function getWrapped(offset: number): number {
  const count = selectCharacters.length;
  return offset - Math.round(offset / count) * count;
}

function getMuted([r, g, b]: Color, amount: number): Color {
  const gray = (r + g + b) / 3;
  const desaturated = mix([r, g, b], [gray, gray, gray], 0.5 * amount);
  const dim = 1 - 0.6 * amount;
  return [desaturated[0] * dim, desaturated[1] * dim, desaturated[2] * dim];
}

function getHeroPose(slot: Slot): HeroPose {
  const bob = toRadians(4 * Math.sin(slot.hop * Math.PI));
  return {
    head: getRotation(-bob, 0, 0),
    ...(slot.cheer > 0
      ? {
          ...getArm(-1, [-0.45 - 0.35 * slot.cheer, 0.1 + 0.75 * slot.cheer, 0.2], [-1, -1, -0.3]),
          ...getArm(1, [0.45 + 0.35 * slot.cheer, 0.1 + 0.75 * slot.cheer, 0.2], [1, -1, -0.3]),
        }
      : { leftArm: getRotation(0, 0, toRadians(-8)) }),
    leftLeg: getRotation(0, 0, toRadians(-5)),
    rightLeg: getRotation(0, 0, toRadians(5)),
  };
}

function getHunterPose(slot: Slot): HunterPose {
  return {
    head: getRotation(toRadians(-4 * Math.sin(slot.hop * Math.PI)), 0, 0),
    leftArm: getRotation(0, 0, toRadians(-10 - 110 * slot.cheer)),
    rightArm: getRotation(0, 0, toRadians(10 + 110 * slot.cheer)),
  };
}

function getStandingY(slot: Slot): number {
  return slot.floor - (HERO_CENTER[1] - SOLE_Y) * slot.size;
}

function drawCharacter(
  raster: Raster,
  character: SelectCharacter,
  slot: Slot,
  coats: Readonly<Record<"tabby" | "black", Coat>>,
): void {
  const rotate: Rotation = getRotation(VIEW_PITCH, slot.yaw, 0);
  if (character === "frieren" || character === "himmel") {
    drawHero(raster, character, {
      x: slot.x,
      y: getStandingY(slot),
      size: slot.size,
      rotate,
      flash: slot.flash,
      pose: getHeroPose(slot),
    });
    return;
  }
  if (character === "tabby" || character === "black") {
    const size = slot.size * CAT_SCALE;
    drawCat(
      raster,
      {
        x: slot.x,
        y: slot.floor - CAT_FLOOR * size,
        size,
        rotate: compose(rotate, SIT),
        flash: slot.flash,
        pose: {
          head: (vector) => UNSIT(getRotation(toRadians(-6), 0, 0)(vector)),
          backLeftLeg: TUCK,
          backRightLeg: TUCK,
          frontRightLeg: getRotation(
            toRadians(-100 * slot.cheer),
            0,
            toRadians(slot.cheer * (25 + 20 * Math.sin(slot.hop * TAU))),
          ),
          tail: getRotation(toRadians(60), toRadians(30 * Math.sin(slot.hop * Math.PI)), 0),
        },
      },
      coats[character],
    );
    return;
  }
  drawHunter(
    raster,
    character,
    {
      x: slot.x,
      y: getStandingY(slot),
      size: slot.size,
      rotate,
      pose: getHunterPose(slot),
    },
    slot.flash,
  );
}

function clearRaster(raster: Raster): void {
  raster.color.fill(0);
  raster.depth.fill(-Infinity);
}

function drawMuted(image: RgbaImage, layer: RgbaImage, mute: number, fade: number): void {
  for (let offset = 0; offset < layer.length; offset += 4) {
    const alpha = ((layer[offset + 3] ?? 0) / 255) * fade;
    if (alpha <= 0) {
      continue;
    }
    const color = getMuted(
      [layer[offset] ?? 0, layer[offset + 1] ?? 0, layer[offset + 2] ?? 0],
      mute,
    );
    const pixel = offset / 4;
    blendPixel(image, pixel % WIDTH, Math.floor(pixel / WIDTH), color, alpha);
  }
}

function drawArrow(
  image: RgbaImage,
  x: number,
  y: number,
  side: number,
  color: Color,
  amount: number,
): void {
  for (const [row, line] of ARROW.entries()) {
    for (let column = 0; column < line.length; column++) {
      if (line[column] === "#") {
        const px = side > 0 ? column : -column;
        blendPixel(image, Math.round(x) + px, Math.round(y) + row - 2, color, amount);
      }
    }
  }
}

function drawTitle(image: RgbaImage, color: Color, amount: number, rise: number): void {
  if (amount <= 0) {
    return;
  }
  const font = fonts["spleen-5x8"];
  const layer = createRgbaImage();
  drawText(layer, font, TITLE, (WIDTH - measureText(font, TITLE)) / 2, 3 - rise, color);
  drawMuted(image, layer, 0, amount);
}

function drawBurst(image: RgbaImage, age: number, colors: readonly Color[]): void {
  if (age < 0 || age > 1.6) {
    return;
  }
  const spread = easings.easeOutCubic(clamp(age / 1.2));
  const fade = clamp(1.6 - age);
  const random = createRandom(hashSeed(SPARK_SEED, 0));
  for (let index = 0; index < 22; index++) {
    const angle = getRandomBetween(random, 0, TAU);
    const speed = getRandomBetween(random, 16, 30);
    const color = colors[index % colors.length] ?? WHITE;
    const x = WIDTH / 2 + Math.cos(angle) * speed * spread;
    const y = ARROW_Y + Math.sin(angle) * speed * spread * 0.8 + 8 * age * age;
    blendPixel(image, Math.round(x), Math.round(y), mix(color, WHITE, clamp(1 - age * 2)), fade);
  }
}

function drawTwinkles(
  image: RgbaImage,
  beat: number,
  amount: number,
  colors: readonly Color[],
): void {
  const newest = Math.floor(beat * 2);
  for (let index = newest - 3; index <= newest; index++) {
    const age = (beat * 2 - index) / 4;
    const random = createRandom(hashSeed(TWINKLE_SEED, index));
    for (let star = 0; star < 2; star++) {
      const side = star === 0 ? -1 : 1;
      const x = WIDTH / 2 + side * getRandomBetween(random, 11, 26);
      const y = getRandomBetween(random, 10, 46);
      const color = colors[(index + star) % colors.length] ?? WHITE;
      const glow = Math.sin(clamp(age) * Math.PI) * amount;
      blendPixel(image, Math.round(x), Math.round(y), mix(color, WHITE, 0.4), glow);
      if (glow > 0.6) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          blendPixel(image, Math.round(x) + dx, Math.round(y) + dy, color, glow * 0.5);
        }
      }
    }
  }
}

const raster = createRaster();
const layer = createRgbaImage();

export const characterSelect = defineEffect({
  id: "character-select",
  name: "Character select",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    selected: z.enum(selectCharacters).default("frieren"),
    stage: z.enum(["search", "victory"]).default("search"),
    arrowColor: colorSchema.default("#ffd030"),
    sparkColor: colorSchema.default("#3cdcff"),
    ...furParams,
  }),
  render(image, { params, beat, progress }) {
    const story = params.stage === "victory" ? SELECT_BEATS : progress * SELECT_BEATS;
    const { kick } = getBeatKick(beat, 1);
    const [tabby, black] = getCoats(params);
    const coats = { tabby, black };
    const arrow = parseColor(params.arrowColor);
    const spark = parseColor(params.sparkColor);
    const colors = [arrow, spark, mix(arrow, spark, 0.5)];
    const selected = selectCharacters.indexOf(params.selected);
    const cursor = selected + getCursor(story);
    const press = getActivePress(story);
    const settle = clamp((getIdleBeats(story) - 0.6) * 2);
    const intro = easings.easeOutCubic(clamp(story / INTRO_BEATS));
    const shift = 90 * (1 - intro);
    const confirm = story - CONFIRM_BEAT;
    const leave = easings.easeInCubic(clamp(confirm / 1.2));
    const spin = easings.easeOutCubic(clamp(confirm / SPIN_BEATS));
    const cheer = easeOutBack(clamp((confirm - SPIN_BEATS) / 0.6));
    const slots = selectCharacters
      .map((character, index) => ({ character, offset: getWrapped(index - cursor) }))
      .filter(({ offset }) => Math.abs(offset) < 2.6)
      .toSorted((a, b) => Math.abs(b.offset) - Math.abs(a.offset));
    for (const { character, offset } of slots) {
      const distance = Math.abs(offset);
      const near = clamp(distance);
      const isChosen = confirm >= 0 && distance < 0.5;
      const size =
        (BIG_SIZE + (SMALL_SIZE - BIG_SIZE) * near) * (1 - 0.12 * Math.max(0, distance - 1));
      const side = Math.sign(offset);
      const slot: Slot = {
        x: WIDTH / 2 + offset * SPACING + shift + (isChosen ? 0 : side * 50 * leave),
        floor: FLOOR + (isChosen ? 0 : 20 * leave * leave),
        size,
        yaw: toRadians(-28 * side * near + 22 * (1 - near) * Math.sin(story * 0.35)),
        hop: 0,
        cheer: 0,
        flash: 0,
      };
      if (distance < 0.5) {
        const pickMe = settle * (1 - near);
        slot.floor -= pickMe * 1.5 * kick;
        slot.hop = getCycle(beat) * pickMe;
      }
      if (isChosen) {
        slot.yaw = toRadians(22 * Math.sin(story * 0.35)) * (1 - spin) + TAU * 3 * spin;
        slot.size = BIG_SIZE * (1 + 0.28 * spin);
        slot.floor -= 7 * Math.sin(Math.PI * clamp(confirm / SPIN_BEATS)) + 1.5 * kick * cheer;
        slot.flash =
          clamp(1 - confirm / 0.4) + 0.6 * clamp(1 - Math.abs(confirm - SPIN_BEATS) / 0.3);
        slot.cheer = cheer;
        slot.hop = getCycle(beat) * cheer;
      }
      clearRaster(raster);
      layer.fill(0);
      drawCharacter(raster, character, slot, coats);
      resolveRaster(raster, layer);
      drawMuted(image, layer, isChosen ? 0 : near, isChosen ? 1 : 1 - leave);
    }
    const arrowAmount = clamp((story - INTRO_BEATS + 0.5) * 2) * (1 - clamp(confirm / 0.8));
    for (const side of [-1, 1]) {
      const isPressed = press?.[1] === side;
      const push = isPressed ? 2 : kick * settle;
      const fly = 30 * easings.easeInCubic(clamp(confirm / 0.8));
      drawArrow(
        image,
        WIDTH / 2 + side * (ARROW_GAP + push + fly),
        ARROW_Y,
        side,
        isPressed ? mix(arrow, WHITE, 0.6) : arrow,
        arrowAmount,
      );
    }
    drawTitle(
      image,
      arrow,
      clamp((story - INTRO_BEATS + 1) * 2) * (0.75 + 0.25 * kick),
      14 * easings.easeInCubic(clamp(confirm / 0.8)),
    );
    drawBurst(image, confirm - SPIN_BEATS, colors);
    drawTwinkles(image, beat, clamp((confirm - SPIN_BEATS) * 2), colors);
  },
});

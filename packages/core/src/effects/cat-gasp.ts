import { z } from "zod";
import { parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import {
  type Rotation,
  type Vector,
  compose,
  compositeRaster,
  createRaster,
  getRotation,
} from "../mesh.ts";
import { type Palette, createSprite } from "../sprite.ts";
import {
  type CatId,
  TAU,
  catIds,
  clamp,
  furParams,
  getCoat,
  getSpan,
  toRadians,
} from "./cat-duo.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import { getCatFace, getEyelessCoat } from "./cat-face.ts";
import {
  type CatJoint,
  type CatPlacement,
  type Coat,
  SIT,
  TUCK,
  UNSIT,
  drawCat,
  getCatPoint,
  getJointAim,
  mix,
  setScaledColor,
} from "./cat-model.ts";
import { getOvershoot } from "./cat-wands.ts";
import { type CharacterHead, type CharacterHeadId, getCharacterHead } from "./character-heads.ts";
import { blendPixel } from "./heart.ts";
import { getBeatKick } from "./heart-pulse.ts";
import { drawThought, getThoughtMask, getThoughtTiming } from "./thought-bubble.ts";

const GASP_BEATS = 10;
const GASP_AT = 1;
const JUDGE_AT = 5;
const THOUGHT_SPAN = [GASP_AT, 8.4] as const;
const LOWER_SPAN = [8.6, 9.4] as const;
const SHOULDER: Vector = [0.3, -0.38, 0.35];
const LEG_LENGTH = 0.56;
const PAW_LIFT = 0.6;
const MITTEN_Y = -0.74;
const CHEEK: Vector = [0.3, 0.5, 1.0];
const MOUTH: Vector = [0, 0.36, 1.1];
const HEAD_TOP: Vector = [0, 1.15, 0.7];
const WHITE: Color = [255, 255, 255];
const LID: Color = [20, 8, 20];
const MOUTH_COLOR: Color = [40, 0, 10];
const SHOCK_COLOR: Color = [255, 220, 60];
const SHOCK_LINES = [-58, -90, -122] as const;

const FIRE_ROWS = [
  "....3....",
  "...33...3",
  "...323.33",
  "..3223.3.",
  ".32223333",
  ".3222223.",
  "332212233",
  "322111223",
  "321111123",
  "321111123",
  ".3211123.",
  "..33333..",
] as const;
const FIRE_PALETTE: Palette = {
  "1": [255, 240, 140],
  "2": [255, 140, 20],
  "3": [230, 40, 10],
};
const heroes: Readonly<Record<CatId, CharacterHeadId>> = { tabby: "frieren", black: "himmel" };

function getBurnThought(hero: CharacterHead, flicker: boolean): CharacterHead {
  const { sprite } = hero;
  const height = Math.max(sprite.height, FIRE_ROWS.length);
  const rows = Array.from({ length: height }, (_, row) => {
    const heroRow = sprite.rows[row - (height - sprite.height)] ?? "";
    const fireRow = FIRE_ROWS[row - (height - FIRE_ROWS.length)] ?? "";
    const fire = flicker ? fireRow.split("").toReversed().join("") : fireRow;
    return `${heroRow.padEnd(sprite.width, ".")}.${fire}`;
  });
  return { sprite: createSprite(rows), palette: { ...hero.palette, ...FIRE_PALETTE } };
}

function getPawReach(story: number): number {
  if (story < GASP_AT) {
    return 0;
  }
  if (story < LOWER_SPAN[0]) {
    return getOvershoot(getSpan(story, GASP_AT, GASP_AT + 0.3));
  }
  return 1 - easings.easeInOutCubic(getSpan(story, ...LOWER_SPAN));
}

function getMittenCoat(coat: Coat, mitten: Color): Coat {
  return (part, position, shade, out) =>
    part === "leg" && position[1] < MITTEN_Y
      ? setScaledColor(out, mitten, shade)
      : coat(part, position, shade, out);
}

function getStretch(length: number): Rotation {
  return ([x, y, depth]) => [x, y * length, depth];
}

function getSittingPlacement(
  x: number,
  y: number,
  size: number,
  head: Rotation,
  tailSwing: number,
): CatPlacement {
  return {
    x,
    y,
    size,
    rotate: compose(getRotation(VIEW_PITCH, toRadians(-12), 0), SIT),
    pose: {
      head: (vector) => UNSIT(head(vector)),
      backLeftLeg: TUCK,
      backRightLeg: TUCK,
      tail: getRotation(toRadians(60), toRadians(35 * tailSwing), 0),
    },
  };
}

function getPawPose(placement: CatPlacement, side: number, reach: number): Rotation {
  const [shoulderX, shoulderY, shoulderDepth] = getCatPoint(placement, [
    side * SHOULDER[0],
    SHOULDER[1],
    SHOULDER[2],
  ]);
  const [cheekX, cheekY, cheekDepth] = getCatPoint(
    placement,
    [side * CHEEK[0], CHEEK[1], CHEEK[2]],
    "head",
  );
  const direction: Vector = [
    (cheekX - shoulderX) / placement.size,
    (shoulderY - cheekY) / placement.size,
    cheekDepth - shoulderDepth + PAW_LIFT,
  ];
  const distance = Math.hypot(...direction);
  const down: Vector = [0, -1, 0.15];
  const aim: Vector = [
    down[0] + (direction[0] - down[0]) * reach,
    down[1] + (direction[1] - down[1]) * reach,
    down[2] + (direction[2] - down[2]) * reach,
  ];
  const length = 1 + (distance / LEG_LENGTH - 1) * clamp(reach);
  return compose(getJointAim(placement.rotate, aim), getStretch(length));
}

function drawShockEyes(image: RgbaImage, eyes: readonly Vector[], pupil: Color): void {
  for (const [eyeX, eyeY] of eyes) {
    const [x, y] = [Math.round(eyeX - 0.5), Math.round(eyeY - 0.5)];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        blendPixel(image, x + dx, y + dy, WHITE, dx !== 0 && dy !== 0 ? 0.6 : 1);
      }
    }
    blendPixel(image, x, y, pupil);
  }
}

function drawJudgingEyes(image: RgbaImage, eyes: readonly Vector[], color: Color): void {
  for (const [eyeX, eyeY] of eyes) {
    const [x, y] = [Math.round(eyeX - 0.5), Math.round(eyeY - 0.5)];
    for (let dx = -1; dx <= 1; dx++) {
      blendPixel(image, x + dx, y - 1, LID);
      blendPixel(image, x + dx, y, color, dx === 0 ? 1 : 0.7);
    }
  }
}

function drawOpenEyes(image: RgbaImage, eyes: readonly Vector[], color: Color): void {
  for (const [eyeX, eyeY] of eyes) {
    const [x, y] = [Math.round(eyeX - 0.5), Math.round(eyeY - 0.5)];
    blendPixel(image, x, y, color);
    blendPixel(image, x, y - 1, color);
  }
}

function drawMouth(image: RgbaImage, [mouthX, mouthY]: Vector, open: number): void {
  const [x, y] = [Math.round(mouthX - 0.5), Math.round(mouthY - 0.5)];
  if (open < 0.5) {
    blendPixel(image, x, y, MOUTH_COLOR);
    return;
  }
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    blendPixel(image, x + dx, y + dy, MOUTH_COLOR);
  }
}

function drawShockLines(
  image: RgbaImage,
  [topX, topY]: Vector,
  amount: number,
  kick: number,
): void {
  if (amount <= 0) {
    return;
  }
  const start = 3 + 2 * kick;
  const length = 2 + 3 * kick;
  const color = mix(SHOCK_COLOR, WHITE, 0.5 * kick);
  for (const degrees of SHOCK_LINES) {
    const angle = toRadians(degrees);
    for (let step = 0; step <= length; step += 0.5) {
      const reach = start + step;
      blendPixel(
        image,
        Math.round(topX + Math.cos(angle) * reach * 1.3),
        Math.round(topY + Math.sin(angle) * reach),
        color,
        amount,
      );
    }
  }
}

export const catGasp = defineEffect({
  id: "cat-gasp",
  name: "Cat gasp",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...furParams,
    cat: z.enum(catIds).default("tabby"),
    every: z.number().min(0.25).max(4).default(1),
  }),
  render(image, { params, beat }) {
    const story = getCycle(beat / GASP_BEATS) * GASP_BEATS;
    const { kick } = getBeatKick(beat, params.every);
    const isShocked = story >= GASP_AT && story < JUDGE_AT;
    const isJudging = story >= JUDGE_AT && story < LOWER_SPAN[0];
    const reach = getPawReach(story);
    const jolt = getSpan(story, GASP_AT, GASP_AT + 0.25) * (1 - getSpan(story, GASP_AT + 0.25, 2));
    const recoil = isShocked ? Math.max(jolt, 0.35 * kick) : 0;
    const shake = isJudging ? Math.sin(Math.floor(story) * Math.PI + Math.PI / 2) * kick : 0;
    const snub = clamp(getSpan(story, JUDGE_AT, JUDGE_AT + 0.4) - getSpan(story, ...LOWER_SPAN));
    const head = getRotation(
      toRadians(-14 * recoil - 10 * snub),
      toRadians(-18 * snub + 10 * shake),
      toRadians(8 * recoil - 6 * snub),
    );
    const placement = getSittingPlacement(
      WIDTH / 2 - 11,
      57 - 2 * recoil + (story < GASP_AT || story > LOWER_SPAN[1] ? kick : 0),
      19,
      head,
      Math.sin((beat / 2) * TAU),
    );
    const pawSide = 1;
    const paw: CatJoint = "frontRightLeg";
    if (placement.pose) {
      placement.pose[paw] = getPawPose(placement, pawSide, reach);
    }
    const mitten =
      params.cat === "tabby"
        ? parseColor(params.tabbyLightColor)
        : mix(parseColor(params.color), WHITE, 0.55);
    const coat = getMittenCoat(getEyelessCoat(getCoat(params)), mitten);
    const raster = createRaster();
    drawCat(raster, placement, coat);
    compositeRaster(raster, image);
    const face = getCatFace(placement);
    const eyeColor = parseColor(params.cat === "tabby" ? params.tabbyEyeColor : params.eyeColor);
    if (isShocked) {
      drawShockEyes(image, face.eyes, eyeColor);
    } else if (isJudging) {
      drawJudgingEyes(image, face.eyes, eyeColor);
    } else {
      drawOpenEyes(image, face.eyes, eyeColor);
    }
    drawMouth(image, getCatPoint(placement, MOUTH, "head"), isShocked ? 1 : 0);
    const top = getCatPoint(placement, HEAD_TOP, "head");
    drawShockLines(image, top, isShocked ? 1 : 0, Math.max(kick, jolt));
    const timing = getThoughtTiming(story, THOUGHT_SPAN);
    if (timing.dots > 0) {
      const thought = getBurnThought(
        getCharacterHead(heroes[params.cat], params),
        Math.floor(beat / params.every) % 2 === 1,
      );
      drawThought(image, {
        x: WIDTH - 1 - getThoughtMask(thought).width,
        y: 1,
        head: thought,
        anchor: [top[0] + 5, top[1] + 1],
        timing: { ...timing, scale: timing.scale * (1 + 0.1 * kick) },
        bob: kick > 0.4 ? 1 : 0,
      });
    }
  },
});

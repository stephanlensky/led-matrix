import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import {
  type Vector,
  compose,
  compositeRaster,
  createRaster,
  getRotation,
  resolveRaster,
} from "../mesh.ts";
import { TAU, clamp, furParams, getCoats, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import { drawEyes, getCatFace, getEyelessCoat } from "./cat-face.ts";
import {
  type CatJoint,
  type CatPlacement,
  SIT,
  TUCK,
  UNSIT,
  drawCat,
  getCatPoint,
  getJointAim,
  mix,
} from "./cat-model.ts";
import { blendPixel, drawHeart, getHeartSize } from "./heart.ts";
import { drawFloatingHearts, drawSparkles } from "./heart-particles.ts";
import { getBeatKick } from "./heart-pulse.ts";
import { getOvershoot } from "./cat-wands.ts";

const STAND = toRadians(-62);
const PAW_TIP = [0.3, -0.94, 0.35] as const;
const WHITE: Color = [255, 255, 255];
const BLUSH: Color = [255, 110, 150];
const LASH: Color = [20, 8, 20];
const BURST_COUNT = 8;
const KISS_BEATS = 4;
const MUZZLE: Vector = [0, 0.48, 1.16];
const CHEEK: Vector = [0.3, 0.52, 0.98];
const HEAD_CENTER: Vector = [0, 0.62, 0.7];
const KISS_SIZE = 13;
const BODY_LEAN = 18;
const HEAD_LEAN = 10;
const KISS_YAW = toRadians(80);

const loveParams = {
  ...furParams,
  every: z.number().min(0.25).max(4).default(1),
  heartColor: colorSchema.default("#ff2a6d"),
};

function getStandingPlacement(
  x: number,
  y: number,
  size: number,
  yaw: number,
  roll: number,
): CatPlacement {
  return {
    x,
    y,
    size,
    rotate: compose(getRotation(VIEW_PITCH, yaw, roll), getRotation(STAND, 0, 0)),
  };
}

function drawBurst(image: RgbaImage, x: number, y: number, phase: number, color: Color): void {
  const spread = easings.easeOutCubic(phase);
  for (let index = 0; index < BURST_COUNT; index++) {
    const angle = (index / BURST_COUNT) * TAU + 0.3;
    drawHeart(image, {
      x: x + Math.cos(angle) * (6 + 22 * spread),
      y: y + Math.sin(angle) * (5 + 18 * spread),
      size: 5 * (1 - 0.4 * spread),
      color: index % 2 === 0 ? color : mix(color, WHITE, 0.5),
      amount: clamp((1 - phase) * 2.5),
      angle: angle + Math.PI / 2,
    });
  }
}

export const catHeartHands = defineEffect({
  id: "cat-heart-hands",
  name: "Cat heart hands",
  kind: "pixel",
  params: z.object({ ...loveParams, beatOffset: z.number().min(-64).max(64).default(0) }),
  render(image, { params, beat }) {
    const heart = parseColor(params.heartColor);
    const { pulse, kick } = getBeatKick(beat + params.beatOffset, params.every);
    const phase = getCycle(pulse);
    const isPop = ((Math.floor(pulse) % 4) + 4) % 4 === 3;
    const pop = isPop ? kick : 0;
    drawSparkles(image, pulse, [mix(heart, WHITE, 0.4)], 0.7, { bottom: HEIGHT - 20 });
    const [tabbyCoat, blackCoat] = getCoats(params);
    const raster = createRaster();
    const sway = Math.sin((pulse / 2) * TAU);
    const cats = [
      [1, tabbyCoat, parseColor(params.tabbyEyeColor)],
      [-1, blackCoat, parseColor(params.eyeColor)],
    ] as const;
    const faces = [];
    const tips = [];
    for (const [side, coat] of cats) {
      const placement = getStandingPlacement(
        WIDTH / 2 - side * 17 + sway,
        45 - 1.5 * kick,
        13,
        side * 0.35,
        side * toRadians(-6 + 4 * sway),
      );
      const inner: CatJoint = side > 0 ? "frontRightLeg" : "frontLeftLeg";
      const outer: CatJoint = side > 0 ? "frontLeftLeg" : "frontRightLeg";
      placement.pose = {
        head: getRotation(-STAND + toRadians(-8 - 8 * kick), 0, side * toRadians(12 + 6 * sway)),
        tail: getRotation(toRadians(60), 0, toRadians(30 * sway)),
        [inner]: getJointAim(placement.rotate, [side, 0.9 + 0.3 * kick, 0.3]),
        [outer]: getJointAim(placement.rotate, [-side * 0.3, -1, 0.4]),
        backLeftLeg: getRotation(-STAND, 0, 0),
        backRightLeg: getRotation(-STAND, 0, 0),
      };
      drawCat(raster, placement, getEyelessCoat(coat));
      faces.push(getCatFace(placement));
      tips.push(getCatPoint(placement, [side * PAW_TIP[0], PAW_TIP[1], PAW_TIP[2]], inner));
    }
    const [left, right] = tips;
    const x = ((left?.[0] ?? 0) + (right?.[0] ?? 0)) / 2;
    const y = ((left?.[1] ?? 0) + (right?.[1] ?? 0)) / 2 + 1;
    const size =
      (Math.abs((right?.[0] ?? 0) - (left?.[0] ?? 0)) + 7) * (1 + 0.12 * kick + 0.15 * pop);
    drawGlow(image, x, y, size, heart, 0.35 + 0.4 * kick);
    drawFloatingHearts(image, pulse, [x, y - size * 0.3], [heart, mix(heart, WHITE, 0.5)], 7, {
      rise: 34,
      sizes: [4, 6],
    });
    drawHeart(image, {
      x,
      y,
      size,
      color: mix(heart, WHITE, 0.15 + 0.4 * pop),
      outline: mix(heart, WHITE, 0.6),
    });
    compositeRaster(raster, image);
    if (isPop) {
      drawBurst(image, x, y, phase, heart);
    }
    for (const [index, face] of faces.entries()) {
      const eyeColor = cats[index]?.[2] ?? WHITE;
      drawEyes(image, face, isPop ? "hearts" : "happy", eyeColor, heart, 1 + 0.3 * kick, 4);
    }
  },
});

function drawGlow(
  image: RgbaImage,
  x: number,
  y: number,
  size: number,
  color: Color,
  amount: number,
): void {
  const reach = size * 1.5;
  for (let py = Math.max(0, Math.floor(y - reach)); py < Math.min(HEIGHT, y + reach); py++) {
    for (let px = Math.max(0, Math.floor(x - reach)); px < Math.min(WIDTH, x + reach); px++) {
      const distance = getHeartSize(px + 0.5 - x, py + 0.5 - y) / size;
      if (distance < 2.2) {
        blendPixel(image, px, py, color, amount * (1 - (distance - 1) / 1.2) * 0.5);
      }
    }
  }
}

function getKissPlacement(
  side: number,
  x: number,
  y: number,
  lean: number,
  beat: number,
): CatPlacement {
  const bob = Math.sin(beat * Math.PI);
  const head = getRotation(
    toRadians(-4 + HEAD_LEAN * lean),
    0,
    side * toRadians(6 * bob * (1 - lean)),
  );
  return {
    x,
    y,
    size: KISS_SIZE,
    rotate: compose(
      getRotation(VIEW_PITCH, side * KISS_YAW, 0),
      getRotation(toRadians(BODY_LEAN * lean), 0, 0),
      SIT,
    ),
    pose: {
      head: (vector) => UNSIT(head(vector)),
      frontLeftLeg: getRotation(toRadians(-10 * lean), 0, 0),
      frontRightLeg: getRotation(toRadians(-10 * lean), 0, 0),
      backLeftLeg: TUCK,
      backRightLeg: TUCK,
      tail: getRotation(toRadians(60), toRadians(35 * Math.sin((beat / 2) * TAU)), 0),
    },
  };
}

function drawBlush(image: RgbaImage, placement: CatPlacement, side: number, amount: number): void {
  const center = getCatPoint(placement, HEAD_CENTER, "head");
  for (const cheek of [-1, 1]) {
    const [x, y, depth] = getCatPoint(placement, [cheek * CHEEK[0], CHEEK[1], CHEEK[2]], "head");
    if (depth < center[2] + 0.1 || cheek === side) {
      continue;
    }
    for (const dx of [-1, 0, 1]) {
      blendPixel(image, Math.round(x) + dx, Math.round(y), BLUSH, amount * (dx === 0 ? 0.9 : 0.6));
    }
  }
}

export const catKiss = defineEffect({
  id: "cat-kiss",
  name: "Cat kiss",
  kind: "pixel",
  params: z.object(loveParams),
  render(image, { params, beat }) {
    const heart = parseColor(params.heartColor);
    const { pulse, kick } = getBeatKick(beat, params.every);
    const story = getCycle(pulse / KISS_BEATS) * KISS_BEATS;
    const lean =
      story >= 3
        ? easings.easeInOutCubic(story - 3)
        : story < 0.6
          ? 1
          : 1 - easings.easeOutCubic(clamp((story - 0.6) / 0.8));
    const smitten = story < 2.2 ? 1 : 0;
    const [tabbyCoat, blackCoat] = getCoats(params);
    const cats = [
      [1, tabbyCoat, parseColor(params.tabbyEyeColor)],
      [-1, blackCoat, parseColor(params.eyeColor)],
    ] as const;
    const raster = createRaster();
    const placements: CatPlacement[] = [];
    for (const [side, coat] of cats) {
      const y = 46 - (1 - lean) * 1.5 * kick;
      const reach = getCatPoint(getKissPlacement(side, 0, y, lean, pulse), MUZZLE, "head")[0];
      const rest = WIDTH / 2 - side * 19;
      const kiss = WIDTH / 2 - reach - side * 0.5;
      const placement = getKissPlacement(side, rest + (kiss - rest) * lean, y, lean, pulse);
      drawCat(raster, placement, getEyelessCoat(coat));
      placements.push(placement);
    }
    resolveRaster(raster, image);
    for (const [index, placement] of placements.entries()) {
      const [side, , eyeColor] = cats[index] ?? cats[0];
      const face = getCatFace(placement);
      const eye = face.eyes.reduce((best, point) => (point[2] > best[2] ? point : best));
      const [x, y] = [Math.round(eye[0] - 0.5), Math.round(eye[1] - 0.5)];
      if (lean > 0.5) {
        blendPixel(image, x, y, LASH);
        blendPixel(image, x - side, y - 1, LASH);
      } else if (smitten) {
        drawEyes(
          image,
          { ...face, eyes: [eye], isFacing: true },
          "hearts",
          eyeColor,
          heart,
          1 + 0.3 * kick,
          4,
        );
      } else {
        blendPixel(image, x, y, eyeColor);
        blendPixel(image, x, y - 1, eyeColor);
      }
      drawBlush(image, placement, side, 0.4 + 0.6 * lean);
    }
    const smooch = story < 1.6 ? story / 1.6 : -1;
    if (smooch >= 0) {
      drawHeart(image, {
        x: WIDTH / 2,
        y: 30 - 18 * easings.easeOutCubic(smooch),
        size: 12 * getOvershoot(clamp(smooch * 5)) * (1 + 0.15 * kick),
        color: mix(heart, WHITE, 0.15),
        outline: mix(heart, WHITE, 0.6),
        amount: clamp((1 - smooch) * 3),
      });
      drawBurst(image, WIDTH / 2, 34, clamp(0.15 + smooch * 1.6), heart);
    }
    drawFloatingHearts(image, pulse, [WIDTH / 2, 36], [heart, mix(heart, WHITE, 0.5)], 26, {
      rise: 30,
      sizes: [4, 6],
      gap: 0.5,
    });
  },
});

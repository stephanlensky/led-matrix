import { z } from "zod";
import { colorSchema, getShiftedHue, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import { compose, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, catIds, furParams, getCoat, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import { drawEyes, eyeStyles, getCatFace, getEyelessCoat } from "./cat-face.ts";
import { type CatPlacement, drawCat, getCatPoint, getJointAim, mix } from "./cat-model.ts";
import { blendPixel, drawHeart } from "./heart.ts";
import { getBeatKick } from "./heart-pulse.ts";
import { drawLine } from "./vocal-shapes.ts";

const STAND = toRadians(-62);
const PAW_TIP = [0.3, -0.94, 0.35] as const;
const WHITE: Color = [255, 255, 255];
const STRING: Color = [200, 200, 210];
const STREAK_COUNT = 14;
const STREAK_SEED = 0xba11;
const BALLOONS = [
  [-3, -18, 9, 0.3],
  [5, -26, 10, 0],
  [12, -16, 9, 0.6],
] as const;

function drawStreaks(image: RgbaImage, beat: number, color: Color): void {
  for (let index = 0; index < STREAK_COUNT; index++) {
    const random = createRandom(hashSeed(STREAK_SEED, index));
    const x = Math.round(getRandomBetween(random, 1, WIDTH - 1));
    const speed = getRandomBetween(random, 6, 12);
    const y = getCycle(random() + (beat * speed) / HEIGHT) * (HEIGHT + 6) - 3;
    const tint = index % 3 === 0 ? color : WHITE;
    for (let step = 0; step < 3; step++) {
      blendPixel(image, x, Math.round(y) - step, tint, 0.7 - 0.25 * step);
    }
  }
}

export const catBalloons = defineEffect({
  id: "cat-balloons",
  name: "Cat heart balloons",
  kind: "pixel",
  params: z.object({
    ...furParams,
    cat: z.enum(catIds).default("black"),
    every: z.number().min(0.25).max(4).default(1),
    eyes: z.enum(eyeStyles).default("hearts"),
    heartColor: colorSchema.default("#ff2a6d"),
    size: z.number().min(6).max(16).default(11),
  }),
  render(image, { params, beat }) {
    const heart = parseColor(params.heartColor);
    const colors: Color[] = [heart, mix(heart, WHITE, 0.45), getShiftedHue(heart, 0.06)];
    const { kick } = getBeatKick(beat, params.every);
    const drift = Math.sin((beat / 8) * TAU);
    const bob = Math.sin((beat / 2) * TAU);
    const kickLeg = Math.sin(beat * Math.PI);
    drawStreaks(image, beat, mix(heart, WHITE, 0.3));
    const raster = createRaster();
    const rotate = compose(
      getRotation(VIEW_PITCH, toRadians(18 * drift), toRadians(-6 * drift)),
      getRotation(STAND, 0, 0),
    );
    const placement: CatPlacement = {
      x: WIDTH / 2 - 6 + 4 * drift,
      y: 47 + 1.5 * bob,
      size: params.size,
      rotate,
      pose: {
        head: getRotation(-STAND + toRadians(-14 - 6 * kick), 0, toRadians(8 * bob)),
        tail: getRotation(toRadians(40), 0, toRadians(40 * Math.sin(beat * Math.PI * 0.5))),
        frontLeftLeg: getJointAim(rotate, [-0.6, -0.5 + 0.4 * bob, 0.5]),
        frontRightLeg: getJointAim(rotate, [0.75, 0.75, 0.3]),
        backLeftLeg: getJointAim(rotate, [-0.15 + 0.25 * kickLeg, -1, 0.3 * kickLeg]),
        backRightLeg: getJointAim(rotate, [0.15 + 0.25 * kickLeg, -1, -0.3 * kickLeg]),
      },
    };
    const coat = getCoat(params);
    drawCat(raster, placement, params.eyes === "open" ? coat : getEyelessCoat(coat));
    const [pawX, pawY] = getCatPoint(
      placement,
      [PAW_TIP[0], PAW_TIP[1], PAW_TIP[2]],
      "frontRightLeg",
    );
    resolveRaster(raster, image);
    for (const [index, [dx, dy, size, lag]] of BALLOONS.entries()) {
      const sway = Math.sin(((beat - lag) / 2) * TAU) * 1.5 - 2 * drift;
      const x = pawX + dx + sway;
      const y = pawY + dy + Math.sin(((beat - lag) / 2) * TAU + 1) * 0.8;
      const swell = 1 + 0.12 * kick;
      drawLine(image, [pawX, pawY], [x, y + size * 0.45], 1, STRING, 0.8);
      const color = colors[index] ?? heart;
      drawHeart(image, {
        x,
        y,
        size: size * swell,
        color,
        outline: mix(color, WHITE, 0.5),
        angle: sway * 0.05,
      });
      drawHeart(image, {
        x: x - size * 0.22,
        y: y - size * 0.18,
        size: size * 0.18,
        color: mix(color, WHITE, 0.75),
      });
    }
    if (params.eyes !== "open") {
      drawEyes(
        image,
        getCatFace(placement),
        params.eyes,
        parseColor(params.cat === "tabby" ? params.tabbyEyeColor : params.eyeColor),
        heart,
        1 + 0.3 * kick,
        params.size * 0.32,
      );
    }
  },
});

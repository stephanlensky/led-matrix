import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { WIDTH } from "../frame.ts";
import { type Vector, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { furParams, getCoats, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { drawEyes, eyeStyles, getCatFace, getEyelessCoat } from "./cat-face.ts";
import {
  CUP,
  addGlow,
  deskStyles,
  fillDesk,
  getHeadphonesColor,
  getLaptopPose,
  getSquashedRotation,
  headphonesMesh,
} from "./cat-laptop.ts";
import { drawLaptop, getSplitHeartScreen } from "./cat-laptop-props.ts";
import { HEART_SEED, drawFloatingHearts } from "./heart-particles.ts";
import {
  type CatPlacement,
  SIT,
  WHITE,
  drawCat,
  drawCatProp,
  getCatOffset,
  getCatPoint,
  mix,
  scale,
} from "./cat-model.ts";

const VIEW_PITCH = toRadians(14);
const CAT_YAW = toRadians(-62);
const CAT_POSITION: Vector = [1.8, 0.25, 0.2];
const LAPTOP_POSITION: Vector = [0, 0, -0.45];
const DESK_Y = 50;

export const catLaptopDuo = defineEffect({
  id: "cat-laptop-duo",
  name: "Cat laptop duo",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...furParams,
    glowColor: colorSchema.default("#3070ff"),
    heartColor: colorSchema.default("#ff0080"),
    secondHeartColor: colorSchema.default("#00c8ff"),
    swap: z.boolean().default(false),
    every: z.number().min(0.25).max(4).default(1),
    size: z.number().min(6).max(16).default(11),
    hop: z.number().min(0).max(6).default(3),
    zoom: z.number().min(0).max(0.4).default(0.08),
    eyes: z.enum(eyeStyles).default("hearts"),
    desk: z.enum(deskStyles).default("edge"),
  }),
  render(image, { params, beat }) {
    const [tabbyCoat, blackCoat] = getCoats(params);
    const first = parseColor(params.heartColor);
    const second = parseColor(params.secondHeartColor);
    const [blackHeart, tabbyHeart] = params.swap ? [second, first] : [first, second];
    const glow = parseColor(params.glowColor);
    const pulse = beat / params.every;
    const phase = getCycle(pulse);
    const since = phase * params.every;
    const kick = Math.exp(-since * 7);
    const hop = params.hop * 4 * phase * (1 - phase);
    const squash = 0.12 * Math.exp(-since * 9) * Math.cos(since * 25);
    const size = params.size * (1 + params.zoom * kick);
    const view = getRotation(VIEW_PITCH, 0, 0);
    const centerX = WIDTH / 2;
    const raster = createRaster();
    fillDesk(raster, DESK_Y, params.desk);

    const [laptopX, laptopY, laptopDepth] = getCatOffset(view, LAPTOP_POSITION, size);
    const laptopRotate = getRotation(VIEW_PITCH, 0, 0);
    const laptopPlacement: CatPlacement = {
      x: centerX + laptopX,
      y: DESK_Y + laptopY - size * 0.25,
      size,
      rotate: laptopRotate,
      depth: laptopDepth,
    };
    drawLaptop(raster, laptopPlacement, {
      getScreenColor: getSplitHeartScreen(glow, blackHeart, tabbyHeart, kick),
    });

    const cats = [
      { side: -1, coat: blackCoat, heart: blackHeart, eyeColor: params.eyeColor },
      { side: 1, coat: tabbyCoat, heart: tabbyHeart, eyeColor: params.tabbyEyeColor },
    ].map(({ side, coat, heart, eyeColor }) => {
      const [catX, catY, catDepth] = getCatOffset(
        view,
        [CAT_POSITION[0] * side, CAT_POSITION[1], CAT_POSITION[2]],
        size,
      );
      const seated = getRotation(VIEW_PITCH, CAT_YAW * side, 0);
      const placement: CatPlacement = {
        x: centerX + catX,
        y: DESK_Y + catY - size * 0.25 - hop,
        size,
        rotate: getSquashedRotation((vector) => seated(SIT(vector)), squash, -0.8),
        depth: catDepth,
        pose: getLaptopPose(phase, pulse, side),
      };
      drawCat(raster, placement, params.eyes === "open" ? coat : getEyelessCoat(coat));
      drawCatProp(raster, placement, headphonesMesh, getHeadphonesColor(heart), "head");
      return { side, heart, eyeColor, placement };
    });
    resolveRaster(raster, image);

    const [screenX, screenY] = getCatOffset(laptopRotate, [0, 0.7, 0], size);
    for (const [side, heart] of [
      [-1, blackHeart],
      [1, tabbyHeart],
    ] as const) {
      addGlow(
        image,
        laptopPlacement.x + screenX + side * size * 0.4,
        laptopPlacement.y + screenY,
        size * 1.2,
        scale(mix(glow, heart, 0.5), 0.1 + 0.12 * kick),
      );
    }
    for (const { side, heart, eyeColor, placement } of cats) {
      if (params.eyes !== "open") {
        drawEyes(
          image,
          getCatFace(placement),
          params.eyes,
          parseColor(eyeColor),
          heart,
          1 + 0.3 * kick,
          size * 0.32,
        );
      }
      const [cupX, cupY] = getCatPoint(placement, [CUP[0] * side, CUP[1], CUP[2]], "head");
      drawFloatingHearts(
        image,
        pulse,
        [cupX - side * 2, cupY],
        [heart, mix(heart, WHITE, 0.5)],
        4,
        { rise: 30, sizes: [4, 6], seed: HEART_SEED + side },
      );
    }
  },
});

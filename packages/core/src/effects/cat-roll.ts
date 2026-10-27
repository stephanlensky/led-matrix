import { z } from "zod";
import { getHsvColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import {
  type Color,
  HEIGHT,
  RGBA_CHANNELS,
  type RgbaImage,
  WIDTH,
  createRgbaImage,
} from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { TAU, getSpan, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import {
  type CatPose,
  type Coat,
  drawCat,
  getSolidCoat,
  getTabbyCoat,
  scale,
} from "./cat-model.ts";

const BODY_GLOW = 0.12;

function getCurledPose(curl: number): CatPose {
  const tuck = toRadians(70 * curl);
  return {
    head: getRotation(toRadians(35 * curl), 0, 0),
    tail: getRotation(toRadians(-50 * curl), toRadians(70 * curl), 0),
    frontLeftLeg: getRotation(-tuck, 0, 0),
    frontRightLeg: getRotation(-tuck, 0, 0),
    backLeftLeg: getRotation(tuck, 0, 0),
    backRightLeg: getRotation(tuck, 0, 0),
  };
}

function getNeonCoat(glow: Color, isTabby: boolean): Coat {
  const body = scale(glow, BODY_GLOW);
  const fur = isTabby
    ? getTabbyCoat(body, scale(glow, 0.45), body, glow)
    : getSolidCoat(body, glow);
  const tail = getTabbyCoat(body, glow, body, glow);
  return (part, position, shade) =>
    part === "ear"
      ? scale(glow, 0.8)
      : part === "tail" && isTabby
        ? tail(part, position, shade)
        : fur(part, position, shade);
}

function isEmpty(image: RgbaImage, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    return true;
  }
  return (image[(y * WIDTH + x) * RGBA_CHANNELS + 3] ?? 0) < 96;
}

function drawOutlined(target: RgbaImage, source: RgbaImage, glow: Color): void {
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const offset = (y * WIDTH + x) * RGBA_CHANNELS;
      if (isEmpty(source, x, y)) {
        continue;
      }
      const isEdge =
        isEmpty(source, x - 1, y) ||
        isEmpty(source, x + 1, y) ||
        isEmpty(source, x, y - 1) ||
        isEmpty(source, x, y + 1);
      for (let channel = 0; channel < 3; channel++) {
        target[offset + channel] = isEdge ? (glow[channel] ?? 0) : (source[offset + channel] ?? 0);
      }
      target[offset + 3] = 255;
    }
  }
}

export const catRoll = defineEffect({
  id: "cat-roll",
  name: "Cat roll",
  kind: "pixel",
  params: z.object({
    size: z.number().min(4).max(16).default(12),
    beatsPerRoll: z.number().int().min(1).max(16).default(4),
    spacing: z.number().min(0).max(40).default(32),
    saturation: z.number().min(0).max(1).default(1),
  }),
  render(image, { params, beat }) {
    const cats = [
      { x: WIDTH / 2 - params.spacing / 2, side: 1, offset: 0, isTabby: true },
      { x: WIDTH / 2 + params.spacing / 2, side: -1, offset: 0.5, isTabby: false },
    ];
    for (const { x, side, offset, isTabby } of cats) {
      const phase = getCycle(beat / params.beatsPerRoll);
      const curl = easings.easeInOutCubic(
        Math.min(getSpan(phase, 0.05, 0.25), 1 - getSpan(phase, 0.75, 0.95)),
      );
      const roll = easings.easeInOutCubic(getSpan(phase, 0.2, 0.8)) * TAU * side;
      const hop = Math.abs(Math.sin(beat * Math.PI)) * (1 - curl);
      const glow = getHsvColor(phase + offset, params.saturation, 1);
      const raster = createRaster();
      drawCat(
        raster,
        {
          x,
          y: HEIGHT / 2 + 4 - hop * 2 - Math.sin(roll * side * 0.5) * 3,
          size: params.size * (1 + 0.1 * curl),
          rotate: getRotation(VIEW_PITCH + toRadians(10 * curl), side * 0.25, roll),
          pose: getCurledPose(curl),
        },
        getNeonCoat(glow, isTabby),
      );
      const layer = createRgbaImage();
      resolveRaster(raster, layer);
      drawOutlined(image, layer, glow);
    }
  },
});

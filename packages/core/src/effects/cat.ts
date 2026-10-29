import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { type Raster, createRaster, getRotation, resolveRaster, setRasterSample } from "../mesh.ts";
import { drawCat, getSolidCoat } from "./cat-model.ts";

const MAX_ZOOM = 10;

export const EYE_OFFSET = 15.5;
export const EYE_HALF_WIDTH = 15;
export const EYE_HALF_HEIGHT = 11;
const EYE_SLANT = 0.18;
const PUPIL_HALF_WIDTH = 2.6;
const HIGHLIGHT_RADIUS = 1.8;

export function getEyeColor(
  x: number,
  y: number,
  blink: number,
  eye: Color,
  highlight: Color,
): Color | undefined {
  for (const side of [-1, 1]) {
    const dx = x - (WIDTH / 2 + side * EYE_OFFSET);
    const outward = dx * side;
    const dy = y - HEIGHT / 2 + outward * EYE_SLANT;
    const edge = 1 - (dx / EYE_HALF_WIDTH) ** 2;
    if (edge <= 0) {
      continue;
    }
    const halfHeight = EYE_HALF_HEIGHT * edge;
    const top = -halfHeight + 1.6 * halfHeight * blink;
    const bottom = halfHeight - 0.4 * halfHeight * blink;
    if (dy < top || dy > bottom) {
      return undefined;
    }
    if (Math.hypot(dx + 5 * side, dy + 5) < HIGHLIGHT_RADIUS) {
      return highlight;
    }
    const pupil =
      PUPIL_HALF_WIDTH * Math.sqrt(Math.max(0, 1 - (dy / (EYE_HALF_HEIGHT * 0.95)) ** 2));
    if (Math.abs(dx) < pupil) {
      return [0, 0, 0];
    }
    const radius = Math.hypot(dx / EYE_HALF_WIDTH, dy / EYE_HALF_HEIGHT);
    const rim = Math.min(1, (bottom - dy) / 1.5, (dy - top) / 1.5);
    const shade = (1.15 - 0.6 * radius) * (0.4 + 0.6 * rim);
    return [eye[0] * shade, eye[1] * shade, eye[2] * shade];
  }
  return undefined;
}

function renderEyes(
  raster: Raster,
  scale: number,
  blink: number,
  eye: Color,
  highlight: Color,
): void {
  for (let y = 0; y < raster.height; y++) {
    const eyeY = HEIGHT / 2 + ((y + 0.5) / raster.samples - HEIGHT / 2) / scale;
    for (let x = 0; x < raster.width; x++) {
      const eyeX = WIDTH / 2 + ((x + 0.5) / raster.samples - WIDTH / 2) / scale;
      const color = getEyeColor(eyeX, eyeY, blink, eye, highlight) ?? [0, 0, 0];
      setRasterSample(raster, y * raster.width + x, color);
    }
  }
}

function getBlink(phase: number, centers: readonly number[], duration: number): number {
  let blink = 0;
  for (const center of centers) {
    const distance = Math.abs(phase - center) / (duration / 2);
    if (distance < 1) {
      blink = Math.max(blink, easings.easeInOutSine(1 - distance));
    }
  }
  return blink;
}

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export const cat = defineEffect({
  id: "cat",
  name: "Staring cat",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#4b1d7a"),
    eyeColor: colorSchema.default("#30e830"),
    highlightColor: colorSchema.default("#e0ffe0"),
    size: z.number().min(6).max(24).default(15),
    turns: z.number().int().min(1).max(16).default(3),
    tiltX: z.number().min(-60).max(60).default(20),
    tiltZ: z.number().min(-60).max(60).default(18),
    stare: z.number().min(0).max(0.9).default(0.4),
    zoom: z.number().min(0.01).max(0.2).default(0.03),
    blink: z.number().min(0.01).max(0.3).default(0.05),
  }),
  render(image, { params, progress }) {
    const fur = parseColor(params.color);
    const eye = parseColor(params.eyeColor);
    const highlight = parseColor(params.highlightColor);
    const stareStart = 1 - params.stare;
    const stareEnd = 1 - params.zoom;
    const eyesStart = stareStart + params.zoom;

    let zoomProgress = 0;
    let eyesMix = 0;
    let eyesScale = 1;
    let blink = 0;
    let spin = 0;
    if (progress < stareStart) {
      spin = (progress / stareStart) * params.turns * Math.PI * 2;
    } else if (progress < eyesStart || progress >= stareEnd) {
      zoomProgress =
        progress < eyesStart
          ? (progress - stareStart) / params.zoom
          : 1 - (progress - stareEnd) / params.zoom;
      eyesMix = smoothstep((zoomProgress - 0.6) / 0.4);
      eyesScale = 0.6 + 0.4 * easings.easeOutCubic(eyesMix);
    } else {
      zoomProgress = 1;
      eyesMix = 1;
      const phase = (progress - eyesStart) / (stareEnd - eyesStart);
      blink = getBlink(phase, [0.45, 0.45 + params.blink * 2.2], params.blink);
    }

    const raster = createRaster();
    if (eyesMix < 1) {
      const tilt = 1 - smoothstep(zoomProgress * 2);
      drawCat(
        raster,
        {
          x: WIDTH / 2,
          y: HEIGHT / 2,
          size: params.size,
          rotate: getRotation(toRadians(params.tiltX) * tilt, spin, toRadians(params.tiltZ) * tilt),
          zoom: 1 + (MAX_ZOOM - 1) * easings.easeInCubic(zoomProgress),
          zoomProgress: easings.easeInOutCubic(zoomProgress),
        },
        getSolidCoat(fur, eye),
      );
    }
    if (eyesMix > 0) {
      const eyes = createRaster();
      renderEyes(eyes, eyesScale, blink, eye, highlight);
      for (let index = 0; index < raster.color.length; index++) {
        raster.color[index] =
          (raster.color[index] ?? 0) * (1 - eyesMix) + (eyes.color[index] ?? 0) * eyesMix;
      }
    }
    resolveRaster(raster, image);
  },
});

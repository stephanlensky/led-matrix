import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";

const SAMPLES = 3;
const PIVOT_X = 14;
const PIVOT_Y = 70;
const TILT = 0.3;
const REST = 0.7;
const DROP = 4;
const OFFSET_X = 2;

type Ellipse = readonly [x: number, y: number, radiusX: number, radiusY: number];
type Point = readonly [x: number, y: number];

const HEAD: Ellipse = [22, 26, 27, 23];
const BROW: Ellipse = [38, 22, 10, 8];
const MUZZLE: Ellipse = [46, 33, 9, 7.5];
const JAW: Ellipse = [40, 41, 9, 5.5];
const FRONT: Ellipse = [34, 22, 26, 22];
const BACK: Ellipse = [-6, 50, 22, 30];
const NOSE: Ellipse = [54, 29.5, 3.2, 2.8];
const CHEEK: Ellipse = [41, 35, 5, 3];
const EYE_LID: Ellipse = [38, 22, 5.5, 2.4];
const EAR: readonly Point[] = [
  [30, 7],
  [42, -6],
  [46, 12],
];
const EAR_INNER: readonly Point[] = [
  [35, 7],
  [42, -2],
  [44, 10],
];

function isInsideEllipse([x, y, radiusX, radiusY]: Ellipse, u: number, v: number): boolean {
  const dx = (u - x) / radiusX;
  const dy = (v - y) / radiusY;
  return dx * dx + dy * dy <= 1;
}

function isInsideTriangle([a, b, c]: readonly Point[], u: number, v: number): boolean {
  if (!a || !b || !c) {
    return false;
  }
  const side = (p: Point, q: Point) => (q[0] - p[0]) * (v - p[1]) - (q[1] - p[1]) * (u - p[0]);
  const ab = side(a, b);
  const bc = side(b, c);
  const ca = side(c, a);
  return (ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0);
}

function isOnSegment(u: number, v: number, [ax, ay]: Point, [bx, by]: Point, width: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)));
  const distanceX = u - (ax + dx * t);
  const distanceY = v - (ay + dy * t);
  return distanceX * distanceX + distanceY * distanceY <= width * width;
}

function isInsideNeck(u: number, v: number): boolean {
  return (v >= 30 && u <= 44 - (v - 42) * 0.5) || isInsideEllipse(BACK, u, v);
}

function isInsideFace(u: number, v: number): boolean {
  return (
    isInsideEllipse(HEAD, u, v) ||
    isInsideEllipse(BROW, u, v) ||
    isInsideEllipse(MUZZLE, u, v) ||
    isInsideEllipse(JAW, u, v)
  );
}

function scaleColor([r, g, b]: Color, amount: number): Color {
  return [r * amount, g * amount, b * amount];
}

function mixColor([r, g, b]: Color, [tr, tg, tb]: Color, amount: number): Color {
  return [r + (tr - r) * amount, g + (tg - g) * amount, b + (tb - b) * amount];
}

type Palette = {
  fur: Color;
  light: Color;
  shadow: Color;
  deep: Color;
  inner: Color;
  nose: Color;
  line: Color;
};

function getPalette(fur: Color, pink: Color): Palette {
  return {
    fur,
    light: mixColor(fur, scaleColor(fur, 0.78), 0.5),
    shadow: mixColor(scaleColor(fur, 0.78), pink, 0.25),
    deep: mixColor(scaleColor(fur, 0.55), pink, 0.3),
    inner: mixColor(fur, pink, 0.55),
    nose: mixColor(scaleColor(fur, 0.7), pink, 0.75),
    line: mixColor(scaleColor(fur, 0.2), pink, 0.15),
  };
}

function getHeadColor(palette: Palette, u: number, v: number): Color | undefined {
  if (u > 64 || v < -8) {
    return undefined;
  }
  const isNearEye = u > 32 && u < 44 && v > 21 && v < 25;
  if (
    isNearEye &&
    (isOnSegment(u, v, [33, 22], [38, 24], 0.8) || isOnSegment(u, v, [38, 24], [43, 22], 0.8))
  ) {
    return palette.line;
  }
  if (isInsideEllipse(NOSE, u, v)) {
    return palette.nose;
  }
  const isNearMouth = u > 44 && u < 54 && v > 31 && v < 39;
  if (
    isNearMouth &&
    (isOnSegment(u, v, [53, 32], [51, 36], 0.6) || isOnSegment(u, v, [51, 36], [45, 37.5], 0.6))
  ) {
    return palette.deep;
  }
  const isFace = isInsideFace(u, v);
  if (
    !isFace &&
    u > 50 &&
    (isOnSegment(u, v, [49, 35], [63, 32], 0.4) || isOnSegment(u, v, [49, 36.5], [62, 40], 0.4))
  ) {
    return palette.light;
  }
  if (isInsideTriangle(EAR_INNER, u, v) && !isInsideEllipse(HEAD, u, v + 1)) {
    return palette.inner;
  }
  if (isInsideTriangle(EAR, u, v) && !isFace) {
    return palette.shadow;
  }
  if (isFace) {
    if (isInsideEllipse(EYE_LID, u, v)) {
      return palette.shadow;
    }
    if (isInsideEllipse(CHEEK, u, v)) {
      return palette.inner;
    }
    if (!isInsideFace(u - 2, v + 4)) {
      return palette.shadow;
    }
    return isInsideEllipse(FRONT, u, v) ? palette.fur : palette.light;
  }
  if (isInsideNeck(u, v)) {
    return isInsideFace(u, v - 5) ? palette.deep : palette.shadow;
  }
  return undefined;
}

function getBob(beat: number, every: number): number {
  const phase = (((beat / every) % 1) + 1) % 1;
  return ((1 + Math.cos(phase * Math.PI * 2)) / 2) ** 1.5;
}

export const catJam = defineEffect({
  id: "cat-jam",
  name: "Cat jam",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default("#f4e8e0"),
    pinkColor: colorSchema.default("#e07a80"),
    backgroundColor: colorSchema.default("#000000"),
    every: z.number().min(0.25).max(4).default(1),
    sway: z.number().min(0).max(6).default(2),
  }),
  render(image, { params, beat }) {
    const background = parseColor(params.backgroundColor);
    const palette = getPalette(parseColor(params.color), parseColor(params.pinkColor));
    const bob = getBob(beat, params.every);
    const angle = (bob - REST) * TILT;
    const shiftX = Math.sin((beat / params.every) * Math.PI) * params.sway - OFFSET_X;
    const shiftY = bob * DROP;
    const sin = Math.sin(-angle);
    const cos = Math.cos(-angle);
    const getColor = (x: number, y: number): Color => {
      const dx = x - PIVOT_X - shiftX;
      const dy = y - PIVOT_Y - shiftY;
      return (
        getHeadColor(palette, PIVOT_X + dx * cos - dy * sin, PIVOT_Y + dx * sin + dy * cos) ??
        background
      );
    };
    const corners = Array.from({ length: (WIDTH + 1) * (HEIGHT + 1) }, (_, index) =>
      getColor(index % (WIDTH + 1), Math.floor(index / (WIDTH + 1))),
    );
    const count = SAMPLES * SAMPLES;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const corner = y * (WIDTH + 1) + x;
        const color = getColor(x + 0.5, y + 0.5);
        if (
          corners[corner] === color &&
          corners[corner + 1] === color &&
          corners[corner + WIDTH + 1] === color &&
          corners[corner + WIDTH + 2] === color
        ) {
          setRgbaPixel(image, x, y, color);
          continue;
        }
        let r = 0;
        let g = 0;
        let b = 0;
        for (let sample = 0; sample < count; sample++) {
          const [sr, sg, sb] = getColor(
            x + ((sample % SAMPLES) + 0.5) / SAMPLES,
            y + (Math.floor(sample / SAMPLES) + 0.5) / SAMPLES,
          );
          r += sr;
          g += sg;
          b += sb;
        }
        setRgbaPixel(image, x, y, [r / count, g / count, b / count]);
      }
    }
  },
});

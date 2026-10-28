import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { TAU, clamp } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { mix, scale } from "./cat-model.ts";
import { getOvershoot } from "./cat-wands.ts";
import { blendPixel } from "./heart.ts";

type Inside = (x: number, y: number) => boolean;

const SAMPLES = 3;
const WHITE: Color = [255, 255, 255];
const INK: Color = [16, 10, 20];
const CANCEL_RED: Color = [255, 24, 24];
const CANCEL_EDGE: Color = [70, 0, 0];

export function drawShape(
  image: RgbaImage,
  [left, top, right, bottom]: readonly [number, number, number, number],
  isInside: Inside,
  color: Color,
  amount = 1,
): void {
  const count = SAMPLES * SAMPLES;
  for (let py = Math.max(0, Math.floor(top)); py <= Math.min(HEIGHT - 1, bottom); py++) {
    for (let px = Math.max(0, Math.floor(left)); px <= Math.min(WIDTH - 1, right); px++) {
      let fill = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          fill += isInside(px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES) ? 1 : 0;
        }
      }
      blendPixel(image, px, py, color, (amount * fill) / count);
    }
  }
}

export function fillEllipse(
  image: RgbaImage,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  color: Color,
  amount = 1,
): void {
  drawShape(
    image,
    [x - radiusX - 1, y - radiusY - 1, x + radiusX + 1, y + radiusY + 1],
    (px, py) => ((px - x) / radiusX) ** 2 + ((py - y) / radiusY) ** 2 <= 1,
    color,
    amount,
  );
}

export function fillCircle(
  image: RgbaImage,
  x: number,
  y: number,
  radius: number,
  color: Color,
  amount = 1,
): void {
  fillEllipse(image, x, y, radius, radius, color, amount);
}

export function fillRect(
  image: RgbaImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
  color: Color,
  amount = 1,
): void {
  drawShape(
    image,
    [left - 1, top - 1, right + 1, bottom + 1],
    (px, py) => px >= left && px <= right && py >= top && py <= bottom,
    color,
    amount,
  );
}

function getSegmentDistance(
  px: number,
  py: number,
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
): number {
  const [dx, dy] = [bx - ax, by - ay];
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / Math.max(1e-6, dx * dx + dy * dy));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

export function drawLine(
  image: RgbaImage,
  from: readonly [number, number],
  to: readonly [number, number],
  width: number,
  color: Color,
  amount = 1,
): void {
  const reach = width / 2 + 1;
  drawShape(
    image,
    [
      Math.min(from[0], to[0]) - reach,
      Math.min(from[1], to[1]) - reach,
      Math.max(from[0], to[0]) + reach,
      Math.max(from[1], to[1]) + reach,
    ],
    (px, py) => getSegmentDistance(px, py, from, to) <= width / 2,
    color,
    amount,
  );
}

type Point = readonly [number, number];

function getSide(px: number, py: number, [ax, ay]: Point, [bx, by]: Point): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

export function fillTriangle(
  image: RgbaImage,
  [a, b, c]: readonly [Point, Point, Point],
  color: Color,
  amount = 1,
): void {
  const xs = [a[0], b[0], c[0]];
  const ys = [a[1], b[1], c[1]];
  drawShape(
    image,
    [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1],
    (px, py) => {
      const sides = [getSide(px, py, a, b), getSide(px, py, b, c), getSide(px, py, c, a)];
      return sides.every((side) => side >= 0) || sides.every((side) => side <= 0);
    },
    color,
    amount,
  );
}

export function fadeImage(image: RgbaImage, amount: number): void {
  if (amount <= 0) {
    return;
  }
  for (let offset = 0; offset < image.length; offset += 4) {
    const [r, g, b] = [image[offset] ?? 0, image[offset + 1] ?? 0, image[offset + 2] ?? 0];
    const gray = (r * 0.3 + g * 0.55 + b * 0.15) * 0.55;
    image[offset] = r + (gray - r) * amount;
    image[offset + 1] = g + (gray - g) * amount;
    image[offset + 2] = b + (gray - b) * amount;
  }
}

export function getCancelShake(since: number): number {
  return since < 0 ? 0 : Math.sin(since * 70) * Math.exp(-since * 7) * 2;
}

export function drawCancel(
  image: RgbaImage,
  x: number,
  y: number,
  radius: number,
  since: number,
): void {
  if (since < 0) {
    return;
  }
  const grow = getOvershoot(clamp(since / 0.3));
  if (grow * radius < 1) {
    return;
  }
  const slash = easings.easeOutCubic(clamp((since - 0.18) / 0.22));
  const pulse = Math.exp(-getCycle(since) * 5);
  const outer = radius * grow * (1 + 0.04 * pulse);
  const thickness = outer * 0.2;
  const inner = outer - thickness;
  const direction = [Math.SQRT1_2, Math.SQRT1_2] as const;
  const length = inner * 2;
  const start: [number, number] = [x - direction[0] * inner, y - direction[1] * inner];
  const end: [number, number] = [
    start[0] + direction[0] * length * slash,
    start[1] + direction[1] * length * slash,
  ];
  const color = mix(CANCEL_RED, WHITE, 0.45 * Math.exp(-since * 6));
  const isRing =
    (border: number): Inside =>
    (px, py) => {
      const distance = Math.hypot(px - x, py - y);
      return distance <= outer + border && distance >= inner - border;
    };
  const isSlash =
    (border: number): Inside =>
    (px, py) =>
      slash > 0 && getSegmentDistance(px, py, start, end) <= thickness / 2 + border;
  const bounds = [x - outer - 2, y - outer - 2, x + outer + 2, y + outer + 2] as const;
  drawShape(image, bounds, (px, py) => isRing(1)(px, py) || isSlash(1)(px, py), CANCEL_EDGE);
  drawShape(image, bounds, (px, py) => isRing(0)(px, py) || isSlash(0)(px, py), color);
}

export function drawEarth(
  image: RgbaImage,
  x: number,
  y: number,
  radius: number,
  spin: number,
  sick: number,
): void {
  const ocean = mix([30, 100, 235], [80, 70, 60], sick);
  const land = mix([60, 200, 70], [150, 110, 40], sick);
  const ice: Color = [235, 245, 255];
  const atmosphere: Color = [120, 190, 255];
  fillCircle(image, x, y, radius + 1.2, scale(atmosphere, 0.5), 0.6);
  for (let py = Math.floor(y - radius - 1); py <= y + radius + 1; py++) {
    for (let px = Math.floor(x - radius - 1); px <= x + radius + 1; px++) {
      const nx = (px + 0.5 - x) / radius;
      const ny = (py + 0.5 - y) / radius;
      const squared = nx * nx + ny * ny;
      if (squared > 1.05) {
        continue;
      }
      const nz = Math.sqrt(Math.max(0, 1 - squared));
      const longitude = Math.atan2(nx, nz) + spin;
      const latitude = Math.asin(Math.max(-1, Math.min(1, -ny)));
      const noise =
        Math.sin(longitude * 2 + Math.sin(latitude * 3) * 1.4) +
        0.6 * Math.sin(latitude * 4 + longitude) +
        0.4 * Math.cos(longitude * 3 - latitude * 2);
      const base = Math.abs(latitude) > 1.32 ? ice : noise > 0.55 ? land : ocean;
      const light = 0.35 + 0.85 * Math.max(0, -nx * 0.5 - ny * 0.45 + nz * 0.75);
      blendPixel(image, px, py, scale(base, light), clamp((1.05 - squared) * radius * 0.5));
    }
  }
}

export function drawEarthFace(
  image: RgbaImage,
  x: number,
  y: number,
  radius: number,
  dead: boolean,
  beat: number,
): void {
  const spread = radius * 0.36;
  const eyeY = y - radius * 0.12;
  for (const side of [-1, 1]) {
    const eyeX = x + side * spread;
    if (dead) {
      drawLine(image, [eyeX - 2, eyeY - 2], [eyeX + 2, eyeY + 2], 1.3, INK);
      drawLine(image, [eyeX - 2, eyeY + 2], [eyeX + 2, eyeY - 2], 1.3, INK);
    } else {
      fillCircle(image, eyeX, eyeY, 2.2, WHITE);
      fillCircle(image, eyeX + 0.4, eyeY + 0.6, 1.2, INK);
    }
  }
  const mouthY = y + radius * 0.42;
  const wobble = dead ? 0 : Math.sin(beat * TAU * 2) * 0.6;
  for (let step = -3; step <= 3; step++) {
    const px = x + step * 1.1;
    const py = mouthY - Math.cos((step / 3) * (Math.PI / 2)) * 2 + wobble * (step % 2);
    fillCircle(image, px, py, 0.7, INK);
  }
  if (!dead) {
    const drop = getCycle(beat / 2);
    fillEllipse(
      image,
      x + radius * 0.75,
      y - radius * 0.35 + drop * 6,
      1.2,
      1.8,
      [150, 220, 255],
      1 - drop,
    );
  }
}

export function drawWhiteHouse(
  image: RgbaImage,
  x: number,
  ground: number,
  squash: number,
  wave: number,
): void {
  const wall: Color = [238, 236, 226];
  const shadow: Color = [178, 176, 170];
  const glass: Color = [40, 52, 90];
  const lift = (height: number) => ground - height * (1 - squash);
  fillRect(image, x - 26, lift(19), x + 26, ground, wall);
  fillRect(image, x - 26, lift(19), x + 26, lift(18), shadow);
  fillRect(image, x - 27, lift(21), x + 27, lift(19.4), wall);
  for (const row of [15.5, 8.5]) {
    for (let column = 0; column < 10; column++) {
      const windowX = x - 24 + column * 5 + (column >= 5 ? 1 : 0);
      if (Math.abs(windowX + 1 - x) < 9) {
        continue;
      }
      fillRect(image, windowX, lift(row), windowX + 1.6, lift(row - 3.4), glass);
    }
  }
  fillTriangle(
    image,
    [
      [x - 10.5, lift(23)],
      [x + 10.5, lift(23)],
      [x, lift(29)],
    ],
    wall,
  );
  fillRect(image, x - 10.5, lift(23.4), x + 10.5, lift(22), shadow);
  for (let column = 0; column < 4; column++) {
    const columnX = x - 8 + column * 5.3;
    fillRect(image, columnX, lift(22), columnX + 1.4, ground - 1, scale(wall, 1.05));
    fillRect(image, columnX + 1.4, lift(22), columnX + 2, ground - 1, shadow);
  }
  fillRect(image, x - 2.5, lift(7), x + 2.5, ground - 1, glass);
  fillRect(image, x - 11, ground - 1.5, x + 11, ground, shadow);
  const poleTop = lift(40);
  fillRect(image, x - 0.4, poleTop, x + 0.4, lift(29), [200, 200, 200]);
  const red: Color = [220, 30, 40];
  const blue: Color = [30, 50, 150];
  for (let column = 0; column < 9; column++) {
    const dy = Math.sin(column * 0.7 - wave * TAU) * 0.8;
    for (let row = 0; row < 5; row++) {
      const isCanton = column < 4 && row < 3;
      blendPixel(
        image,
        x + 1 + column,
        poleTop + row + dy,
        isCanton ? blue : row % 2 === 0 ? red : WHITE,
      );
    }
  }
}

export const critterKinds = ["bunny", "duck", "pig"] as const;

export type CritterKind = (typeof critterKinds)[number];

export function drawCritter(
  image: RgbaImage,
  kind: CritterKind,
  x: number,
  ground: number,
  phase: number,
  size = 1,
): void {
  const step = Math.sin(phase * TAU);
  const hop = kind === "bunny" ? Math.abs(Math.sin(phase * Math.PI)) * 5 : Math.abs(step);
  const y = ground - hop * size;
  const at = (dx: number, dy: number): [number, number] => [x + dx * size, y + dy * size];
  const ellipse = (dx: number, dy: number, rx: number, ry: number, color: Color) =>
    fillEllipse(image, ...at(dx, dy), rx * size, ry * size, color);
  const triangle = ([a, b, c]: readonly [Point, Point, Point], color: Color) =>
    fillTriangle(image, [at(...a), at(...b), at(...c)], color);
  if (kind === "bunny") {
    const fur: Color = [240, 238, 236];
    const pink: Color = [255, 150, 180];
    ellipse(-5.5, -5, 2, 2, WHITE);
    ellipse(-3, -2.5, 2.4, 1.6, scale(fur, 0.8));
    ellipse(0, -5, 5, 4.2, fur);
    ellipse(4.5, -9.5, 3.4, 3.1, fur);
    for (const [dx, tilt] of [
      [-0.5, -0.9],
      [1.8, 0.4],
    ] as const) {
      ellipse(4 + dx + tilt, -15.5, 1.2, 3.8, fur);
      ellipse(4 + dx + tilt, -15.3, 0.5, 2.6, pink);
    }
    ellipse(6, -10, 0.8, 0.8, INK);
    ellipse(7.7, -8.7, 0.6, 0.6, pink);
    ellipse(3, -1, 2.2, 1.3, fur);
    return;
  }
  if (kind === "duck") {
    const feather: Color = [255, 214, 40];
    const orange: Color = [255, 130, 20];
    for (const side of [-1, 1]) {
      const swing = side * step * 1.6;
      drawLine(image, at(swing * 0.3, -3), [x + swing * size, ground - 0.5], size, orange);
      fillRect(
        image,
        x + swing * size,
        ground - size,
        x + (swing + 2) * size,
        ground - 0.2,
        orange,
      );
    }
    ellipse(-0.5, -6.5, 5.5, 3.8, feather);
    triangle(
      [
        [-5, -9],
        [-8, -9.5],
        [-5.5, -5.5],
      ],
      feather,
    );
    ellipse(-1, -6.2, 2.8, 1.8, scale(feather, 0.8));
    ellipse(4, -11.5, 3.2, 3.2, feather);
    ellipse(7.6, -10.8, 2, 1, orange);
    ellipse(4.9, -12.3, 0.8, 0.8, INK);
    return;
  }
  const skin: Color = [255, 160, 180];
  const dark: Color = [220, 105, 135];
  for (const [legX, side] of [
    [-3.5, 1],
    [-1.5, -1],
    [2, -1],
    [4, 1],
  ] as const) {
    const [left, top] = at(legX + side * step * 0.8, -3);
    fillRect(image, left, top, left + 1.4 * size, ground, dark);
  }
  ellipse(0, -6, 6.2, 4.4, skin);
  drawLine(image, at(-6, -7), at(-7.5, -8.5), 0.8 * size, dark);
  ellipse(-8, -9, 0.8, 0.8, dark);
  ellipse(5.3, -8.5, 3.6, 3.6, skin);
  triangle(
    [
      [3.6, -11],
      [5.8, -11.6],
      [4, -14],
    ],
    dark,
  );
  ellipse(8.6, -7.8, 1.3, 1.6, dark);
  ellipse(6.3, -9.6, 0.75, 0.75, INK);
}

export function drawUfo(image: RgbaImage, x: number, y: number, beat: number, beam: number): void {
  const metal: Color = [170, 178, 196];
  const dark: Color = [84, 90, 110];
  const alien: Color = [110, 240, 90];
  const glass: Color = [150, 230, 255];
  if (beam > 0) {
    drawShape(
      image,
      [x - 18, y + 4, x + 18, HEIGHT],
      (px, py) => {
        const t = (py - y - 4) / (HEIGHT - y - 4);
        return Math.abs(px - x) <= 5 + 12 * t;
      },
      [255, 250, 150],
      0.28 * beam,
    );
  }
  fillCircle(image, x, y - 3, 8.2, scale(glass, 0.35), 0.9);
  fillEllipse(image, x, y - 5, 4.2, 4.8, alien);
  fillTriangle(
    image,
    [
      [x - 3.6, y - 7.2],
      [x - 0.8, y - 5.4],
      [x - 2.8, y - 3.8],
    ],
    INK,
  );
  fillTriangle(
    image,
    [
      [x + 3.6, y - 7.2],
      [x + 0.8, y - 5.4],
      [x + 2.8, y - 3.8],
    ],
    INK,
  );
  drawLine(image, [x - 1, y - 9.5], [x - 2.5, y - 13], 0.8, alien);
  drawLine(image, [x + 1, y - 9.5], [x + 2.5, y - 13], 0.8, alien);
  fillCircle(image, x - 2.5, y - 13.2, 1, alien);
  fillCircle(image, x + 2.5, y - 13.2, 1, alien);
  drawShape(
    image,
    [x - 9, y - 12, x + 9, y],
    (px, py) => Math.hypot(px - x, py - y + 3) <= 8.2 && Math.hypot(px - x, py - y + 3) >= 7.3,
    mix(glass, WHITE, 0.4),
    0.7,
  );
  fillEllipse(image, x, y + 2.5, 12, 3.4, dark);
  fillEllipse(image, x, y, 21, 4.6, metal);
  fillEllipse(image, x - 3, y - 1.6, 14, 1.4, mix(metal, WHITE, 0.6));
  const lights: Color[] = [
    [255, 220, 40],
    [255, 60, 60],
    [60, 230, 255],
  ];
  for (let index = 0; index < 7; index++) {
    const angle = Math.PI * (0.12 + (index / 6) * 0.76);
    const color = lights[(index + Math.floor(beat * 2)) % lights.length] ?? WHITE;
    fillCircle(image, x - Math.cos(angle) * 17, y + Math.sin(angle) * 3, 1.1, color);
  }
}

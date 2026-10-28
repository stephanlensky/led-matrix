import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";

const TAU = Math.PI * 2;

const HEART_SAMPLES = 3;
const HEART_TOP = 1.25;
const HEART_BOTTOM = -1;
const HEART_HALF_WIDTH = 1.14;
const HEART_MIDDLE = (HEART_TOP + HEART_BOTTOM) / 2;
const ANGLE_STEPS = 360;

export function isInsideHeart(x: number, y: number): boolean {
  const radius = x * x + y * y - 1;
  return radius * radius * radius - x * x * y * y * y <= 0;
}

export function getHeartCoverage(u: number, v: number): number {
  return isInsideHeart((u * 2 - 1) * HEART_HALF_WIDTH, HEART_TOP - v * (HEART_TOP - HEART_BOTTOM))
    ? 1
    : 0;
}

function getBoundaryRadius(angle: number): number {
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  let [low, high] = [0, 2];
  for (let step = 0; step < 20; step++) {
    const middle = (low + high) / 2;
    const isInside = isInsideHeart(dx * middle, HEART_MIDDLE + dy * middle);
    [low, high] = isInside ? [middle, high] : [low, middle];
  }
  return low / (HEART_HALF_WIDTH * 2);
}

const boundaryRadii = Float32Array.from({ length: ANGLE_STEPS }, (_, index) =>
  getBoundaryRadius((index / ANGLE_STEPS) * TAU),
);

export function getHeartSize(dx: number, dy: number): number {
  const angle = Math.atan2(-dy, dx);
  const index = Math.round((((angle / TAU) % 1) + 1) * ANGLE_STEPS) % ANGLE_STEPS;
  return Math.hypot(dx, dy) / (boundaryRadii[index] ?? 1);
}

export function blendPixel(
  image: RgbaImage,
  x: number,
  y: number,
  [r, g, b]: Color,
  amount = 1,
): void {
  if (amount <= 0 || x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    return;
  }
  const offset = (Math.floor(y) * WIDTH + Math.floor(x)) * 4;
  const below = ((image[offset + 3] ?? 0) / 255) * (1 - Math.min(1, amount));
  const cover = Math.min(1, amount);
  const alpha = cover + below;
  image[offset] = ((image[offset] ?? 0) * below + r * cover) / alpha;
  image[offset + 1] = ((image[offset + 1] ?? 0) * below + g * cover) / alpha;
  image[offset + 2] = ((image[offset + 2] ?? 0) * below + b * cover) / alpha;
  image[offset + 3] = alpha * 255;
}

export type Heart = {
  x: number;
  y: number;
  size: number;
  color: Color;
  outline?: Color;
  amount?: number;
  angle?: number;
};

export function drawHeart(
  image: RgbaImage,
  { x, y, size, color, outline, amount = 1, angle = 0 }: Heart,
): void {
  if (size <= 0 || amount <= 0) {
    return;
  }
  const halfWidth = size / 2;
  const height = (size * (HEART_TOP - HEART_BOTTOM)) / (HEART_HALF_WIDTH * 2);
  const scale = (HEART_HALF_WIDTH * 2) / size;
  const middle = (HEART_TOP + HEART_BOTTOM) / 2;
  const [sin, cos] = [Math.sin(-angle), Math.cos(-angle)];
  const border = outline ? 1 : 0;
  const reach = Math.ceil(Math.max(halfWidth, height / 2) + border + 1);
  const isInside = (px: number, py: number, grow: number): boolean => {
    const dx = px - x;
    const dy = py - y;
    const localX = (dx * cos - dy * sin) * scale;
    const localY = middle - (dx * sin + dy * cos) * scale;
    const shrink = 1 + grow * scale;
    return isInsideHeart(localX / shrink, (localY - middle) / shrink + middle);
  };
  for (let py = Math.floor(y - reach); py <= y + reach; py++) {
    for (let px = Math.floor(x - reach); px <= x + reach; px++) {
      let fill = 0;
      let edge = 0;
      for (let sampleY = 0; sampleY < HEART_SAMPLES; sampleY++) {
        for (let sampleX = 0; sampleX < HEART_SAMPLES; sampleX++) {
          const sx = px + (sampleX + 0.5) / HEART_SAMPLES;
          const sy = py + (sampleY + 0.5) / HEART_SAMPLES;
          if (isInside(sx, sy, 0)) {
            fill++;
          } else if (border && isInside(sx, sy, border)) {
            edge++;
          }
        }
      }
      const count = HEART_SAMPLES * HEART_SAMPLES;
      if (edge > 0 && outline) {
        blendPixel(image, px, py, outline, (amount * (edge + fill)) / count);
      }
      if (fill > 0) {
        blendPixel(image, px, py, color, (amount * fill) / count);
      }
    }
  }
}

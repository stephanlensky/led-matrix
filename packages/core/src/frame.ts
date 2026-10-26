export const WIDTH = 64;
export const HEIGHT = 64;
export const CHANNELS = 3;
export const RGBA_CHANNELS = 4;

export type Frame = Uint8ClampedArray;

export type RgbaImage = Uint8ClampedArray;

export type Color = readonly [r: number, g: number, b: number];

export function createFrame(): Frame {
  return new Uint8ClampedArray(WIDTH * HEIGHT * CHANNELS);
}

export function createRgbaImage(): RgbaImage {
  return new Uint8ClampedArray(WIDTH * HEIGHT * RGBA_CHANNELS);
}

function getOffset(x: number, y: number, channels: number): number {
  return (y * WIDTH + x) * channels;
}

function isInBounds(x: number, y: number): boolean {
  return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
}

export function setPixel(frame: Frame, x: number, y: number, [r, g, b]: Color): void {
  const offset = getOffset(x, y, CHANNELS);
  frame[offset] = r;
  frame[offset + 1] = g;
  frame[offset + 2] = b;
}

export function getPixel(frame: Frame, x: number, y: number): Color {
  const offset = getOffset(x, y, CHANNELS);
  return [frame[offset] ?? 0, frame[offset + 1] ?? 0, frame[offset + 2] ?? 0];
}

export function setRgbaPixel(
  image: RgbaImage,
  x: number,
  y: number,
  [r, g, b]: Color,
  alpha = 255,
): void {
  if (!isInBounds(x, y)) {
    return;
  }
  const offset = getOffset(x, y, RGBA_CHANNELS);
  image[offset] = r;
  image[offset + 1] = g;
  image[offset + 2] = b;
  image[offset + 3] = alpha;
}

export function getRgbaPixel(
  image: RgbaImage,
  x: number,
  y: number,
): readonly [r: number, g: number, b: number, a: number] {
  const offset = getOffset(x, y, RGBA_CHANNELS);
  return [
    image[offset] ?? 0,
    image[offset + 1] ?? 0,
    image[offset + 2] ?? 0,
    image[offset + 3] ?? 0,
  ];
}

export function fillRgbaImage(image: RgbaImage, [r, g, b]: Color, alpha = 255): void {
  for (let offset = 0; offset < image.length; offset += RGBA_CHANNELS) {
    image[offset] = r;
    image[offset + 1] = g;
    image[offset + 2] = b;
    image[offset + 3] = alpha;
  }
}

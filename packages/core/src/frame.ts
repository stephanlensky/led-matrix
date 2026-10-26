export const WIDTH = 64;
export const HEIGHT = 64;
export const CHANNELS = 3;

export type Frame = Uint8ClampedArray;

export type Color = readonly [r: number, g: number, b: number];

export function createFrame(): Frame {
  return new Uint8ClampedArray(WIDTH * HEIGHT * CHANNELS);
}

function getOffset(x: number, y: number): number {
  return (y * WIDTH + x) * CHANNELS;
}

export function setPixel(frame: Frame, x: number, y: number, [r, g, b]: Color): void {
  const offset = getOffset(x, y);
  frame[offset] = r;
  frame[offset + 1] = g;
  frame[offset + 2] = b;
}

export function getPixel(frame: Frame, x: number, y: number): Color {
  const offset = getOffset(x, y);
  return [frame[offset] ?? 0, frame[offset + 1] ?? 0, frame[offset + 2] ?? 0];
}

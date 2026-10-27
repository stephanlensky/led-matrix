import type { Waveform } from "./library.ts";
import { FULL_RANGE, type TrackRange } from "./track-scale.ts";

export type Rgb = readonly [number, number, number];

export type WaveformColors = {
  low: Rgb;
  mid: Rgb;
  high: Rgb;
};

export const MIXXX_RGB_COLORS: WaveformColors = {
  low: [255, 0, 0],
  mid: [0, 255, 0],
  high: [0, 0, 255],
};

export type WaveformColumns = {
  heights: Float32Array;
  colors: Uint8ClampedArray;
};

const MAX_VALUE = 255;

function getMax(values: Uint8Array, start: number, stop: number): number {
  let max = 0;
  for (let index = start; index < stop; index++) {
    max = Math.max(max, values[index]!);
  }
  return max;
}

export function getWaveformColumns(
  waveform: Waveform,
  count: number,
  range: TrackRange = FULL_RANGE,
  colors: WaveformColors = MIXXX_RGB_COLORS,
): WaveformColumns {
  const frameCount = waveform.all.length;
  const heights = new Float32Array(count);
  const rgb = new Uint8ClampedArray(count * 3);
  if (frameCount === 0) {
    return { heights, colors: rgb };
  }
  const offset = range.start * frameCount;
  const step = ((range.end - range.start) * frameCount) / count;
  for (let column = 0; column < count; column++) {
    const start = Math.min(Math.max(Math.floor(offset + column * step), 0), frameCount - 1);
    const stop = Math.min(
      Math.max(Math.floor(offset + (column + 1) * step), start + 1),
      frameCount,
    );
    const low = getMax(waveform.low, start, stop);
    const mid = getMax(waveform.mid, start, stop);
    const high = getMax(waveform.high, start, stop);
    const color = [0, 1, 2].map(
      (channel) =>
        low * colors.low[channel]! + mid * colors.mid[channel]! + high * colors.high[channel]!,
    );
    const maxComponent = Math.max(...color);
    if (maxComponent > 0) {
      rgb.set(
        color.map((component) => (component / maxComponent) * MAX_VALUE),
        column * 3,
      );
    }
    heights[column] = getMax(waveform.all, start, stop) / MAX_VALUE;
  }
  return { heights, colors: rgb };
}

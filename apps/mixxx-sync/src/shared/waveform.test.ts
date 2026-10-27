import { describe, expect, it } from "vitest";
import type { Waveform } from "./library.ts";
import { getWaveformColumns } from "./waveform.ts";

function createWaveform(frames: [number, number, number, number][]): Waveform {
  return {
    visualSampleRate: 1,
    low: Uint8Array.from(frames, ([low]) => low),
    mid: Uint8Array.from(frames, ([, mid]) => mid),
    high: Uint8Array.from(frames, ([, , high]) => high),
    all: Uint8Array.from(frames, ([, , , all]) => all),
  };
}

describe("getWaveformColumns", () => {
  it("normalises the band mix by its largest component", () => {
    const { heights, colors } = getWaveformColumns(createWaveform([[200, 100, 0, 255]]), 1);
    expect(heights[0]).toBe(1);
    expect([...colors]).toEqual([255, 128, 0]);
  });

  it("takes the maximum of each band over the frames in a column", () => {
    const waveform = createWaveform([
      [0, 0, 80, 51],
      [0, 0, 40, 102],
      [10, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const { heights, colors } = getWaveformColumns(waveform, 2);
    expect(heights[0]).toBeCloseTo(0.4);
    expect([...colors.subarray(0, 3)]).toEqual([0, 0, 255]);
    expect(heights[1]).toBe(0);
    expect([...colors.subarray(3, 6)]).toEqual([255, 0, 0]);
  });

  it("repeats frames when there are more columns than frames", () => {
    const { heights } = getWaveformColumns(
      createWaveform([
        [1, 1, 1, 51],
        [1, 1, 1, 255],
      ]),
      4,
    );
    expect([...heights]).toEqual([0.2, 0.2, 1, 1].map(Math.fround));
  });

  it("draws only the columns in the range", () => {
    const { heights } = getWaveformColumns(
      createWaveform([
        [1, 1, 1, 51],
        [1, 1, 1, 102],
        [1, 1, 1, 153],
        [1, 1, 1, 255],
      ]),
      2,
      { start: 0.5, end: 1 },
    );
    expect([...heights]).toEqual([0.6, 1].map(Math.fround));
  });

  it("leaves silent columns black", () => {
    const { colors } = getWaveformColumns(createWaveform([[0, 0, 0, 0]]), 1);
    expect([...colors]).toEqual([0, 0, 0]);
  });
});

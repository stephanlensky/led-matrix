import { describe, expect, it } from "vitest";
import { CHANNELS, HEIGHT, WIDTH, createFrame, getPixel, setPixel } from "./frame.ts";

describe("frame", () => {
  it("creates a black frame sized for the panel", () => {
    const frame = createFrame();
    expect(frame).toHaveLength(WIDTH * HEIGHT * CHANNELS);
    expect(frame.every((value) => value === 0)).toBe(true);
  });

  it("sets and gets pixels", () => {
    const frame = createFrame();
    setPixel(frame, 63, 10, [255, 128, 300]);
    expect(getPixel(frame, 63, 10)).toEqual([255, 128, 255]);
    expect(getPixel(frame, 0, 0)).toEqual([0, 0, 0]);
  });
});

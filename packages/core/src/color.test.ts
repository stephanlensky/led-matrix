import { describe, expect, it } from "vitest";
import { colorSchema, formatColor, getHsvColor, parseColor } from "./color.ts";

describe("color", () => {
  it("parses and formats hex colors", () => {
    expect(parseColor("#ff8000")).toEqual([255, 128, 0]);
    expect(formatColor([255, 127.6, 0])).toBe("#ff8000");
  });

  it("validates hex colors", () => {
    expect(colorSchema.safeParse("#A0b1C2").success).toBe(true);
    expect(colorSchema.safeParse("red").success).toBe(false);
  });

  it("converts hsv to rgb", () => {
    expect(getHsvColor(0, 1, 1)).toEqual([255, 0, 0]);
    expect(getHsvColor(1 / 3, 1, 1).map(Math.round)).toEqual([0, 255, 0]);
    expect(getHsvColor(-1 / 3, 1, 1).map(Math.round)).toEqual([0, 0, 255]);
    expect(getHsvColor(0.5, 0, 0.5)).toEqual([127.5, 127.5, 127.5]);
  });
});

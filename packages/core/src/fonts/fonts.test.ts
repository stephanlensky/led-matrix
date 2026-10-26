import { describe, expect, it } from "vitest";
import { HEIGHT, WIDTH, createRgbaImage, getRgbaPixel } from "../frame.ts";
import { parseBdf } from "./bdf.ts";
import { drawText, fonts, measureText } from "./index.ts";

const source = `STARTFONT 2.1
FONTBOUNDINGBOX 3 3 0 0
STARTPROPERTIES 2
FONT_ASCENT 3
FONT_DESCENT 0
ENDPROPERTIES
CHARS 1
STARTCHAR T
ENCODING 84
DWIDTH 4 0
BBX 3 3 0 0
BITMAP
E0
40
40
ENDCHAR
ENDFONT
`;

function getMask(image: Uint8ClampedArray, width: number, height: number): string[] {
  return Array.from({ length: height }, (_row, y) =>
    Array.from({ length: width }, (_column, x) => (getRgbaPixel(image, x, y)[3] ? "#" : ".")).join(
      "",
    ),
  );
}

describe("parseBdf", () => {
  it("parses metrics and glyph bitmaps", () => {
    const font = parseBdf(source, "test");
    expect(font).toEqual({
      name: "test",
      ascent: 3,
      descent: 0,
      glyphs: { 84: { width: 3, height: 3, xOffset: 0, yOffset: 0, advance: 4, rows: [7, 2, 2] } },
    });
  });
});

describe("drawText", () => {
  it("draws glyphs at their baseline and falls back to nothing for unknown glyphs", () => {
    const font = parseBdf(source, "test");
    const image = createRgbaImage();
    drawText(image, font, "TxT", 1, 0, [255, 0, 0]);
    expect(getMask(image, 10, 4)).toEqual([".###.###..", "..#...#...", "..#...#...", ".........."]);
    expect(getRgbaPixel(image, 1, 0)).toEqual([255, 0, 0, 255]);
  });

  it("renders bundled spleen glyphs pixel-exactly", () => {
    const image = createRgbaImage();
    drawText(image, fonts["spleen-5x8"], "A", 0, 0, [255, 255, 255]);
    expect(getMask(image, 5, 8)).toEqual([
      ".....",
      ".##..",
      "#..#.",
      "#..#.",
      "####.",
      "#..#.",
      "#..#.",
      ".....",
    ]);
  });

  it("clips text drawn outside the panel", () => {
    const image = createRgbaImage();
    expect(() =>
      drawText(image, fonts["spleen-8x16"], "CLIP", WIDTH - 4, HEIGHT - 4, [255, 255, 255]),
    ).not.toThrow();
    expect(() =>
      drawText(image, fonts["spleen-8x16"], "CLIP", -10, -10, [255, 255, 255]),
    ).not.toThrow();
  });

  it("measures text by glyph advance", () => {
    expect(measureText(fonts["spleen-6x12"], "HELLO")).toBe(30);
  });
});

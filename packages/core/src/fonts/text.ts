import { type Color, type RgbaImage, setRgbaPixel } from "../frame.ts";
import type { BitmapFont, Glyph } from "./bdf.ts";

const FALLBACK_CODE = 0x3f;

function getGlyph(font: BitmapFont, character: string): Glyph | undefined {
  return font.glyphs[character.codePointAt(0) ?? FALLBACK_CODE] ?? font.glyphs[FALLBACK_CODE];
}

export function measureText(font: BitmapFont, text: string): number {
  let width = 0;
  for (const character of text) {
    width += getGlyph(font, character)?.advance ?? 0;
  }
  return width;
}

export function getLineHeight(font: BitmapFont): number {
  return font.ascent + font.descent;
}

export function drawText(
  image: RgbaImage,
  font: BitmapFont,
  text: string,
  x: number,
  y: number,
  color: Color,
): void {
  const baseline = Math.round(y) + font.ascent;
  let penX = Math.round(x);
  for (const character of text) {
    const glyph = getGlyph(font, character);
    if (!glyph) {
      continue;
    }
    const top = baseline - glyph.yOffset - glyph.height;
    for (let row = 0; row < glyph.height; row++) {
      const bits = glyph.rows[row] ?? 0;
      for (let column = 0; column < glyph.width; column++) {
        if ((bits >> (glyph.width - 1 - column)) & 1) {
          setRgbaPixel(image, penX + glyph.xOffset + column, top + row, color);
        }
      }
    }
    penX += glyph.advance;
  }
}

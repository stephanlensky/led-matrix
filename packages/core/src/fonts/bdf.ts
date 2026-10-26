export type Glyph = {
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
  advance: number;
  rows: readonly number[];
};

export type BitmapFont = {
  name: string;
  ascent: number;
  descent: number;
  glyphs: Readonly<Record<number, Glyph>>;
};

function getNumbers(line: string): number[] {
  return line.trim().split(/\s+/).slice(1).map(Number);
}

export function parseBdf(source: string, name: string): BitmapFont {
  const lines = source.split(/\r?\n/);
  const glyphs: Record<number, Glyph> = {};
  let ascent = 0;
  let descent = 0;
  let encoding = -1;
  let advance = 0;
  let box = [0, 0, 0, 0];
  let rows: number[] | undefined;

  for (const line of lines) {
    const keyword = line.split(" ", 1)[0];
    if (rows && keyword !== "ENDCHAR") {
      const [width = 0] = box;
      const hex = line.trim();
      rows.push(Number.parseInt(hex, 16) >> (hex.length * 4 - width));
      continue;
    }
    switch (keyword) {
      case "FONT_ASCENT":
        [ascent = 0] = getNumbers(line);
        break;
      case "FONT_DESCENT":
        [descent = 0] = getNumbers(line);
        break;
      case "ENCODING":
        [encoding = -1] = getNumbers(line);
        break;
      case "DWIDTH":
        [advance = 0] = getNumbers(line);
        break;
      case "BBX":
        box = getNumbers(line);
        break;
      case "BITMAP":
        rows = [];
        break;
      case "ENDCHAR": {
        const [width = 0, height = 0, xOffset = 0, yOffset = 0] = box;
        if (encoding >= 0 && rows) {
          glyphs[encoding] = { width, height, xOffset, yOffset, advance, rows };
        }
        rows = undefined;
        break;
      }
    }
  }

  return { name, ascent, descent, glyphs };
}

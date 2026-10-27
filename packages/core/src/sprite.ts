import { type Color, type RgbaImage, setRgbaPixel } from "./frame.ts";

export type Sprite = {
  width: number;
  height: number;
  rows: readonly string[];
};

export type Palette = Readonly<Record<string, Color>>;

export type DrawSpriteOptions = {
  flipX?: boolean;
  flipY?: boolean;
  tint?: Color;
};

export function createSprite(rows: readonly string[]): Sprite {
  return {
    width: Math.max(0, ...rows.map((row) => row.length)),
    height: rows.length,
    rows,
  };
}

export function drawSprite(
  image: RgbaImage,
  sprite: Sprite,
  x: number,
  y: number,
  palette: Palette,
  { flipX = false, flipY = false, tint }: DrawSpriteOptions = {},
): void {
  const left = Math.round(x);
  const top = Math.round(y);
  for (const [row, line] of sprite.rows.entries()) {
    for (let column = 0; column < line.length; column++) {
      const color = palette[line[column] ?? "."];
      if (!color) {
        continue;
      }
      setRgbaPixel(
        image,
        left + (flipX ? sprite.width - 1 - column : column),
        top + (flipY ? sprite.height - 1 - row : row),
        tint ?? color,
      );
    }
  }
}

export function getAnimationFrame<T>(frames: readonly T[], time: number, rate: number): T {
  const index = Math.floor(time * rate) % frames.length;
  const frame = frames[(index + frames.length) % frames.length];
  if (frame === undefined) {
    throw new Error("Animation has no frames");
  }
  return frame;
}

export function rotateSprite(sprite: Sprite, quarterTurns: number): Sprite {
  let rows = sprite.rows.map((row) => row.padEnd(sprite.width, "."));
  for (let turn = 0; turn < ((quarterTurns % 4) + 4) % 4; turn++) {
    const width = rows[0]?.length ?? 0;
    rows = Array.from({ length: width }, (_, column) =>
      rows
        .map((row) => row[column] ?? ".")
        .toReversed()
        .join(""),
    );
  }
  return createSprite(rows);
}

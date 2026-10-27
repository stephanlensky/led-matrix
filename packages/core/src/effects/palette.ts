import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import type { Color } from "../frame.ts";

export const paletteParams = {
  color1: colorSchema.default("#ff5a00"),
  color2: colorSchema.default("#000000"),
  color3: colorSchema.default("#9000ff"),
  color4: colorSchema.default("#3cff00"),
  colorCount: z.number().int().min(1).max(4).default(2),
};

type PaletteParams = {
  color1: string;
  color2: string;
  color3: string;
  color4: string;
  colorCount: number;
};

export function getPalette(params: PaletteParams): Color[] {
  return [params.color1, params.color2, params.color3, params.color4]
    .slice(0, params.colorCount)
    .map(parseColor);
}

export function getPaletteColor(palette: readonly Color[], index: number): Color {
  const wrapped = ((Math.floor(index) % palette.length) + palette.length) % palette.length;
  return palette[wrapped] ?? [0, 0, 0];
}

export function mixColors(from: Color, to: Color, amount: number): Color {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

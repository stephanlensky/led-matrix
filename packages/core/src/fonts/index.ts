import type { BitmapFont } from "./bdf.ts";
import { spleen5x8, spleen6x12, spleen8x16, spleen12x24, spleen16x32 } from "./generated/index.ts";

export const fontNames = [
  "spleen-5x8",
  "spleen-6x12",
  "spleen-8x16",
  "spleen-12x24",
  "spleen-16x32",
] as const;

export type FontName = (typeof fontNames)[number];

export const fonts: Readonly<Record<FontName, BitmapFont>> = {
  "spleen-5x8": spleen5x8,
  "spleen-6x12": spleen6x12,
  "spleen-8x16": spleen8x16,
  "spleen-12x24": spleen12x24,
  "spleen-16x32": spleen16x32,
};

export * from "./bdf.ts";
export * from "./text.ts";

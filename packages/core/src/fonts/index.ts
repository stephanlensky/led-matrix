import type { BitmapFont } from "./bdf.ts";
import { spleen5x8, spleen6x12, spleen8x16 } from "./generated/index.ts";

export const fontNames = ["spleen-5x8", "spleen-6x12", "spleen-8x16"] as const;

export type FontName = (typeof fontNames)[number];

export const fonts: Readonly<Record<FontName, BitmapFont>> = {
  "spleen-5x8": spleen5x8,
  "spleen-6x12": spleen6x12,
  "spleen-8x16": spleen8x16,
};

export * from "./bdf.ts";
export * from "./text.ts";

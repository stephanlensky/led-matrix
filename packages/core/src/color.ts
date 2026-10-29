import { z } from "zod";
import type { Color } from "./frame.ts";

export const colorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Expected a #rrggbb color")
  .meta({ format: "color" });

export const BLOOD_COLOR = "#8a0303";
export const DRIED_BLOOD_COLOR = "#4c0704";
export const FRESH_BLOOD_COLOR = "#d0001c";
export const BLOOD_PALETTE = [DRIED_BLOOD_COLOR, BLOOD_COLOR, FRESH_BLOOD_COLOR] as const;

export function getBackgroundColor(params: { background: boolean; color: string }): Color {
  return params.background ? parseColor(params.color) : [0, 0, 0];
}

export function parseColor(hex: string): Color {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function formatColor([r, g, b]: Color): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

export function getHsvColor(hue: number, saturation: number, value: number): Color {
  const h = (((hue % 1) + 1) % 1) * 6;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const m = value - chroma;
  const sector = Math.floor(h);
  const [r, g, b] =
    sector === 0
      ? [chroma, x, 0]
      : sector === 1
        ? [x, chroma, 0]
        : sector === 2
          ? [0, chroma, x]
          : sector === 3
            ? [0, x, chroma]
            : sector === 4
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function getShiftedHue([r, g, b]: Color, shift: number): Color {
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  const hue =
    chroma === 0
      ? 0
      : max === r
        ? (g - b) / chroma / 6
        : max === g
          ? ((b - r) / chroma + 2) / 6
          : ((r - g) / chroma + 4) / 6;
  return getHsvColor(hue + shift, max === 0 ? 0 : chroma / max, max / 255);
}

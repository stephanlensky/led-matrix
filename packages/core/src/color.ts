import { z } from "zod";
import type { Color } from "./frame.ts";

export const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "Expected a #rrggbb color");

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

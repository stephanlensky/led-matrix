import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, RGBA_CHANNELS, WIDTH } from "../frame.ts";

function getBlocks(size: number, length: number): [start: number, end: number][] {
  const offset = Math.floor(((size - (length % size)) % size) / 2);
  const blocks: [number, number][] = [];
  for (let start = -offset; start < length; start += size) {
    blocks.push([Math.max(0, start), Math.min(length, start + size)]);
  }
  return blocks;
}

export const pixelate = defineEffect({
  id: "pixelate",
  name: "Pixelate",
  kind: "filter",
  isBeatOnly: true,
  params: z.object({
    size: z.number().int().min(1).max(32).default(4),
  }),
  render(image, { params, source }) {
    const columns = getBlocks(params.size, WIDTH);
    for (const [top, bottom] of getBlocks(params.size, HEIGHT)) {
      for (const [left, right] of columns) {
        const sum = [0, 0, 0];
        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) {
            for (let channel = 0; channel < 3; channel++) {
              sum[channel] =
                (sum[channel] ?? 0) + (source[(y * WIDTH + x) * RGBA_CHANNELS + channel] ?? 0);
            }
          }
        }
        const count = (bottom - top) * (right - left);
        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) {
            const offset = (y * WIDTH + x) * RGBA_CHANNELS;
            for (let channel = 0; channel < 3; channel++) {
              image[offset + channel] = (sum[channel] ?? 0) / count;
            }
            image[offset + 3] = 255;
          }
        }
      }
    }
  },
});

import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, RGBA_CHANNELS, WIDTH } from "../frame.ts";

export const mirrorAxes = ["horizontal", "vertical", "both"] as const;

function getMirroredPosition(position: number, length: number, isFlipped: boolean): number {
  const isSecondHalf = position >= length / 2;
  return isSecondHalf !== isFlipped ? length - 1 - position : position;
}

export const mirror = defineEffect({
  id: "mirror",
  name: "Mirror",
  kind: "filter",
  params: z.object({
    axis: z.enum(mirrorAxes).default("horizontal"),
    flip: z.boolean().default(false),
  }),
  render(image, { params, source }) {
    const mirrorX = params.axis !== "vertical";
    const mirrorY = params.axis !== "horizontal";
    for (let y = 0; y < HEIGHT; y++) {
      const sourceY = mirrorY ? getMirroredPosition(y, HEIGHT, params.flip) : y;
      for (let x = 0; x < WIDTH; x++) {
        const sourceX = mirrorX ? getMirroredPosition(x, WIDTH, params.flip) : x;
        const from = (sourceY * WIDTH + sourceX) * RGBA_CHANNELS;
        image.set(source.subarray(from, from + RGBA_CHANNELS), (y * WIDTH + x) * RGBA_CHANNELS);
      }
    }
  },
});

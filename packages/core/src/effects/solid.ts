import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { fillRgbaImage } from "../frame.ts";

export const solid = defineEffect({
  id: "solid",
  name: "Solid",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default("#ffffff"),
  }),
  render(image, { params }) {
    fillRgbaImage(image, parseColor(params.color));
  },
});

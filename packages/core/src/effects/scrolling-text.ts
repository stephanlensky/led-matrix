import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { fontNames, fonts, drawText, getLineHeight, measureText } from "../fonts/index.ts";
import { HEIGHT, WIDTH } from "../frame.ts";

export const scrollingText = defineEffect({
  id: "scrolling-text",
  name: "Scrolling text",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    text: z.string().max(256).default("HELLO"),
    font: z.enum(fontNames).default("spleen-8x16"),
    color: colorSchema.default("#ffffff"),
    cycles: z.number().int().min(1).max(32).default(1),
    y: z.number().int().min(-HEIGHT).max(HEIGHT).optional(),
  }),
  render(image, { params, progress }) {
    const font = fonts[params.font];
    const textWidth = measureText(font, params.text);
    const distance = (progress * params.cycles * (textWidth + WIDTH)) % (textWidth + WIDTH);
    const y = params.y ?? Math.floor((HEIGHT - getLineHeight(font)) / 2);
    drawText(image, font, params.text, WIDTH - distance, y, parseColor(params.color));
  },
});

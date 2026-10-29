import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { fontNames, fonts, drawText, getLineHeight, measureText } from "../fonts/index.ts";
import { HEIGHT, WIDTH } from "../frame.ts";

export const textAlignments = ["left", "center", "right"] as const;

export const text = defineEffect({
  id: "text",
  name: "Text",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    text: z.string().max(256).meta({ multiline: true }).default("HELLO"),
    font: z.enum(fontNames).default("spleen-8x16"),
    color: colorSchema.default("#ffffff"),
    align: z.enum(textAlignments).default("center"),
    lineSpacing: z.number().int().min(0).max(16).default(1),
    offsetX: z.number().int().min(-WIDTH).max(WIDTH).default(0),
    offsetY: z.number().int().min(-HEIGHT).max(HEIGHT).default(0),
  }),
  render(image, { params }) {
    const font = fonts[params.font];
    const lines = params.text.split("\n");
    const lineHeight = getLineHeight(font) + params.lineSpacing;
    const blockHeight = lines.length * lineHeight - params.lineSpacing;
    const top = Math.floor((HEIGHT - blockHeight) / 2) + params.offsetY;
    const color = parseColor(params.color);
    for (const [index, line] of lines.entries()) {
      const lineWidth = measureText(font, line);
      const left =
        params.align === "left"
          ? 0
          : params.align === "right"
            ? WIDTH - lineWidth
            : Math.floor((WIDTH - lineWidth) / 2);
      drawText(image, font, line, left + params.offsetX, top + index * lineHeight, color);
    }
  },
});

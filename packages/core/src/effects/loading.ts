import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { fonts, drawText, getLineHeight, measureText } from "../fonts/index.ts";
import { type Color, HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";

const FONT = fonts["spleen-6x12"];
const LABEL = "LOADING";
const DOT_COUNT = 3;
const DOT_SIZE = 3;
const DOT_GAP = 2;
const LABEL_GAP = 2;
const BOUNCE_LENGTH = 0.5;

function getScaledColor([r, g, b]: Color, scale: number): Color {
  return [r * scale, g * scale, b * scale];
}

export const loading = defineEffect({
  id: "loading",
  name: "Loading",
  kind: "pixel",
  params: z.object({
    bounce: z.number().int().min(1).max(16).default(5),
    period: z.number().int().min(1).max(8).default(2),
    stagger: z.number().min(0).max(0.5).default(0.15),
    color: colorSchema.default("#ff0000"),
    textColor: colorSchema.default("#7a0000"),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const labelWidth = measureText(FONT, LABEL);
    const dotsWidth = DOT_COUNT * DOT_SIZE + (DOT_COUNT - 1) * DOT_GAP;
    const left = Math.floor((WIDTH - labelWidth - LABEL_GAP - dotsWidth) / 2);
    const top = Math.floor((HEIGHT - getLineHeight(FONT)) / 2);
    drawText(image, FONT, LABEL, left, top, parseColor(params.textColor));

    const baseline = top + FONT.ascent;
    for (let index = 0; index < DOT_COUNT; index++) {
      const cycle = (((beat / params.period - index * params.stagger) % 1) + 1) % 1;
      const lift = cycle < BOUNCE_LENGTH ? Math.sin((Math.PI * cycle) / BOUNCE_LENGTH) : 0;
      const dotLeft = left + labelWidth + LABEL_GAP + index * (DOT_SIZE + DOT_GAP);
      const dotTop = baseline - DOT_SIZE - Math.round(lift * params.bounce);
      const dotColor = getScaledColor(color, 0.65 + 0.35 * lift);
      for (let y = 0; y < DOT_SIZE; y++) {
        for (let x = 0; x < DOT_SIZE; x++) {
          setRgbaPixel(
            image,
            dotLeft + x,
            dotTop + y,
            getScaledColor(dotColor, 1 - (y / DOT_SIZE) * 0.3),
          );
        }
      }
    }
  },
});

import { z } from "zod";
import { canvasFontFamilies } from "../canvas-fonts.ts";
import type { CanvasContext } from "../canvas.ts";
import { colorSchema } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";

type BigTextLayout = {
  text: string;
  font: (typeof canvasFontFamilies)[number];
  size: number;
  outlineWidth: number;
};

function getMargin(outlineWidth: number): number {
  return outlineWidth + 2;
}

function getScrollDistance(textWidth: number, outlineWidth: number): number {
  return textWidth + getMargin(outlineWidth) * 2 - WIDTH;
}

export function getBigTextExitScroll(context: CanvasContext, layout: BigTextLayout): number {
  context.font = `${layout.size}px "${layout.font}"`;
  context.textAlign = "center";
  const metrics = context.measureText(layout.text);
  return (
    0.5 +
    (WIDTH / 2 + metrics.actualBoundingBoxRight + layout.outlineWidth) /
      getScrollDistance(metrics.width, layout.outlineWidth)
  );
}

export const bigText = defineEffect({
  id: "big-text",
  name: "Big text",
  kind: "canvas",
  isBeatOnly: true,
  params: z.object({
    text: z.string().max(64).default("DROP"),
    font: z.enum(canvasFontFamilies).default("Anton"),
    size: z.number().min(8).max(128).default(40),
    fitWidth: z.boolean().default(true),
    color: colorSchema.default("#ffffff"),
    outlineColor: colorSchema.default("#ff0080"),
    outlineWidth: z.number().min(0).max(8).default(0),
    pulse: z.number().min(0).max(1).default(0),
    scroll: z.number().min(0).max(2).optional(),
  }),
  render(context, { params, beat }) {
    context.font = `${params.size}px "${params.font}"`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    const metrics = context.measureText(params.text);
    const textWidth = metrics.width;
    const baseline = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    const fitScale =
      params.fitWidth && params.scroll === undefined && textWidth > 0
        ? Math.min(1, (WIDTH - params.outlineWidth * 2) / textWidth)
        : 1;
    const scale = fitScale * (1 + params.pulse * (1 - (beat % 1)) * 0.5);
    const x =
      params.scroll === undefined
        ? WIDTH / 2
        : WIDTH / 2 +
          (0.5 - params.scroll) * getScrollDistance(textWidth * scale, params.outlineWidth);
    context.translate(x, HEIGHT / 2);
    context.scale(scale, scale);
    context.lineJoin = "round";
    if (params.outlineWidth > 0) {
      context.strokeStyle = params.outlineColor;
      context.lineWidth = (params.outlineWidth * 2) / scale;
      context.strokeText(params.text, 0, baseline);
    }
    context.fillStyle = params.color;
    context.fillText(params.text, 0, baseline);
  },
});

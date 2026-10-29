import { z } from "zod";
import { colorSchema } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";

export const squares = defineEffect({
  id: "squares",
  name: "Spinning squares",
  kind: "canvas",
  isBeatOnly: true,
  params: z.object({
    count: z.number().int().min(1).max(8).default(3),
    startColor: colorSchema.default("#ff0080"),
    endColor: colorSchema.default("#00c8ff"),
    rotations: z.number().int().min(-8).max(8).default(1),
    pulse: z.number().min(0).max(1).default(0.25),
    glow: z.number().min(0).max(16).default(4),
  }),
  render(context, { params, progress, beat }) {
    const size = WIDTH * 0.6;
    const pulse = 1 - params.pulse * (beat % 1);
    context.translate(WIDTH / 2, HEIGHT / 2);
    context.globalCompositeOperation = "lighter";
    context.lineWidth = 2;
    context.shadowBlur = params.glow;
    for (let index = 0; index < params.count; index++) {
      const fraction = params.count === 1 ? 0 : index / (params.count - 1);
      const scale = pulse * (1 - fraction * 0.6);
      const gradient = context.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
      gradient.addColorStop(0, params.startColor);
      gradient.addColorStop(1, params.endColor);
      context.save();
      context.rotate(
        (progress * params.rotations + fraction / 4) * Math.PI * 2 * (index % 2 === 0 ? 1 : -1),
      );
      context.scale(scale, scale);
      context.strokeStyle = gradient;
      context.shadowColor = index % 2 === 0 ? params.startColor : params.endColor;
      context.strokeRect(-size / 2, -size / 2, size, size);
      context.restore();
    }
  },
});

import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createPlaneProjection } from "../projection.ts";
import { createRgba, samplingModes, sampleImage, setRgba } from "../sample.ts";

export const spinAxes = ["x", "y", "z"] as const;

const angleSchema = z.number().min(-180).max(180);

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function getSpinAngle(
  beat: number,
  { spinEvery, spinBeats, spinTurns }: { spinEvery: number; spinBeats: number; spinTurns: number },
): number {
  if (spinEvery === 0) {
    return 0;
  }
  const phase = beat % spinEvery;
  return phase < spinBeats ? easings.easeInOutCubic(phase / spinBeats) * 360 * spinTurns : 0;
}

export const tilt = defineEffect({
  id: "tilt",
  name: "3D tilt",
  kind: "filter",
  params: z.object({
    rotateX: angleSchema.default(0),
    rotateY: angleSchema.default(0),
    rotateZ: angleSchema.default(0),
    wobble: z.number().min(0).max(60).default(10),
    wobbleCycles: z.number().int().min(1).max(16).default(1),
    spinEvery: z.number().int().min(0).max(64).default(8),
    spinBeats: z.number().min(0.25).max(8).default(1),
    spinTurns: z.number().int().min(1).max(4).default(1),
    spinAxis: z.enum(spinAxes).default("y"),
    distance: z.number().min(32).max(512).default(96),
    scale: z.number().min(0.25).max(2).default(1),
    shading: z.number().min(0).max(1).default(0.5),
    sampling: z.enum(samplingModes).default("nearest"),
  }),
  render(image, { params, progress, beat, source }) {
    const phase = progress * params.wobbleCycles * Math.PI * 2;
    const spin = getSpinAngle(beat, params);
    const rotation = {
      x: toRadians(
        params.rotateX + params.wobble * Math.sin(phase) + (params.spinAxis === "x" ? spin : 0),
      ),
      y: toRadians(
        params.rotateY + params.wobble * Math.cos(phase) + (params.spinAxis === "y" ? spin : 0),
      ),
      z: toRadians(params.rotateZ + (params.spinAxis === "z" ? spin : 0)),
    };
    const projection = createPlaneProjection(rotation, params.distance);
    const shade = 1 - params.shading * (1 - Math.abs(projection.normal[2]));
    const color = createRgba();
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const point = projection.getPoint(x + 0.5 - WIDTH / 2, y + 0.5 - HEIGHT / 2);
        if (!point) {
          continue;
        }
        sampleImage(
          source,
          point.u / params.scale + WIDTH / 2,
          point.v / params.scale + HEIGHT / 2,
          params.sampling,
          color,
        );
        color[0] *= shade;
        color[1] *= shade;
        color[2] *= shade;
        setRgba(image, x, y, color);
      }
    }
  },
});

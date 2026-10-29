import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { TAU, toRadians } from "./cat-duo.ts";
import { drawHunter, hunterIds } from "./hunter-model.ts";

const PERSPECTIVE = 50;

export const hunterHyperspace = defineEffect({
  id: "hunter-hyperspace",
  name: "Hunter hyperspace",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    size: z.number().min(4).max(16).default(10),
    radius: z.number().min(0).max(30).default(18),
    orbits: z.number().int().min(1).max(8).default(2),
    turns: z.number().int().min(0).max(16).default(4),
    tilt: z.number().min(0).max(1).default(0.35),
  }),
  render(image, { params, progress, beat }) {
    const raster = createRaster();
    for (const [index, hunter] of hunterIds.entries()) {
      const angle = progress * params.orbits * TAU + (index * TAU) / 3;
      const depth = params.radius * Math.cos(angle);
      const perspective = 1 + depth / PERSPECTIVE;
      const float = Math.sin((beat / 2 + index / 3) * TAU);
      const kick = Math.sin((beat / 4 + index / 3) * TAU);
      drawHunter(raster, hunter, {
        x: WIDTH / 2 + params.radius * Math.sin(angle),
        y: HEIGHT / 2 + 2 + float + params.tilt * depth * 0.3,
        size: params.size * perspective,
        depth: depth / params.size,
        rotate: getRotation(
          toRadians(15),
          params.turns * TAU * progress + angle,
          toRadians(12 * kick),
        ),
        pose: {
          torso: getRotation(toRadians(-8), 0, 0),
          head: getRotation(toRadians(-10 + 8 * float), 0, toRadians(-10 * kick)),
          hair: getRotation(toRadians(55 + 15 * float), 0, toRadians(20 * kick)),
          leftArm: getRotation(toRadians(-150 - 10 * float), 0, toRadians(-15)),
          rightArm: getRotation(toRadians(25 + 10 * float), 0, toRadians(35)),
          leftLeg: getRotation(toRadians(25 + 10 * kick), 0, toRadians(-8)),
          rightLeg: getRotation(toRadians(-15 - 10 * kick), 0, toRadians(8)),
        },
      });
    }
    resolveRaster(raster, image);
  },
});

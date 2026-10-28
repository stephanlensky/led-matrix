import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { WIDTH } from "../frame.ts";
import { createRaster, resolveRaster } from "../mesh.ts";
import { type Dancer, hunterMoveFrames, hunterMoves } from "./hunter-dance.ts";
import { drawHero, heroIds } from "./frieren-model.ts";

const syncPhases = {
  together: [0, 0],
  alternate: [0, 0.5],
  offbeat: [0, 0.25],
} as const;

export const heroSyncs = ["together", "alternate", "offbeat"] as const;

export const heroDance = defineEffect({
  id: "hero-dance",
  name: "Frieren and Himmel dance",
  kind: "pixel",
  params: z.object({
    move: z.enum(hunterMoves).default("headbang"),
    sync: z.enum(heroSyncs).default("together"),
    size: z.number().min(4).max(20).default(15),
    spacing: z.number().min(0).max(30).default(15),
  }),
  render(image, { params, beat }) {
    const raster = createRaster();
    for (const [index, hero] of heroIds.entries()) {
      const side = index === 0 ? 1 : -1;
      const dancer: Dancer = {
        x: WIDTH / 2 - side * params.spacing,
        phase: syncPhases[params.sync][index] ?? 0,
        side,
      };
      const frame = hunterMoveFrames[params.move](beat, dancer, params.size);
      drawHero(raster, hero, {
        ...frame,
        pose: { ...frame.pose, cape: frame.pose.hair },
      });
    }
    resolveRaster(raster, image);
  },
});

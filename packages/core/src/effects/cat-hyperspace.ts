import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { createRaster, getRotation, resolveRaster } from "../mesh.ts";
import {
  BLACK_IMPACT,
  BLACK_TILT,
  CAT_RADIUS,
  CAT_SIZE,
  TABBY_IMPACT,
  TABBY_TILT,
  TAU,
  furParams,
  getBounceState,
  getCoats,
} from "./cat-duo.ts";
import { drawCat } from "./cat-model.ts";

const ORBIT_CENTER = [
  (TABBY_IMPACT[0] + BLACK_IMPACT[0]) / 2,
  (TABBY_IMPACT[1] + BLACK_IMPACT[1]) / 2,
] as const;
const PERSPECTIVE = 40;
const BOB_CYCLES = 4;
const BOB_HEIGHT = 1.5;
export const catHyperspace = defineEffect({
  id: "cat-hyperspace",
  name: "Cat hyperspace",
  kind: "pixel",
  params: z.object({
    ...furParams,
    orbits: z.number().int().min(1).max(8).default(2),
    turns: z.number().int().min(0).max(16).default(4),
    tilt: z.number().min(0).max(1).default(0.35),
  }),
  render(image, { params, progress }) {
    const [tabbyCoat, blackCoat] = getCoats(params);
    const starts = getBounceState(0);
    const angle = progress * params.orbits * TAU;
    const bob = BOB_HEIGHT * Math.sin(progress * BOB_CYCLES * TAU);
    const raster = createRaster();
    const cats = [
      { start: starts[0], impact: TABBY_IMPACT, tilt: TABBY_TILT, coat: tabbyCoat, turns: -1 },
      { start: starts[1], impact: BLACK_IMPACT, tilt: BLACK_TILT, coat: blackCoat, turns: 1 },
    ];
    for (const [index, { start, impact, tilt, coat, turns }] of cats.entries()) {
      const offsetX = impact[0] - ORBIT_CENTER[0];
      const offsetY = impact[1] - ORBIT_CENTER[1];
      const depth = -offsetX * Math.sin(angle);
      const perspective = 1 + depth / PERSPECTIVE;
      drawCat(
        raster,
        {
          x: ORBIT_CENTER[0] + offsetX * Math.cos(angle),
          y:
            ORBIT_CENTER[1] +
            offsetY * Math.cos(angle) +
            bob * (index === 0 ? 1 : -1) +
            params.tilt * depth * 0.3,
          size: CAT_SIZE * perspective,
          depth: depth / CAT_RADIUS,
          rotate: getRotation(
            tilt[0] ?? 0,
            start.yaw + turns * params.turns * TAU * progress,
            tilt[1] ?? 0,
          ),
        },
        coat,
      );
    }
    resolveRaster(raster, image);
  },
});

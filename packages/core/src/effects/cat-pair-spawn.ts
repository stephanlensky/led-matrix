import { z } from "zod";
import { parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRaster, getRotation, resolveRaster } from "../mesh.ts";
import {
  BLACK_TILT,
  CAT_SIZE,
  type CatState,
  STARING_CAT_SIZE,
  TABBY_TILT,
  TAU,
  clamp,
  coatParams,
  drawChargeParticles,
  drawSpawnRing,
  getBounceState,
  getCoats,
  getSpan,
  getSpawnVisibility,
} from "./cat-duo.ts";
import { drawCat } from "./cat-model.ts";

const CHARGE_END = 0.3;
const SPAWN_LENGTH = 0.2;
const STAGGER = 0.08;
const APPROACH_START = 0.6;
const SPAWN_TURNS = 6;
const spawnCats = ["both", "tabby", "black"] as const;
const SOLO_TARGET: CatState = { x: WIDTH / 2, y: HEIGHT / 2, yaw: 0 };

export const catPairSpawn = defineEffect({
  id: "cat-pair-spawn",
  name: "Cat pair spawn",
  kind: "pixel",
  params: z.object({
    ...coatParams,
    spread: z.number().min(0).max(24).default(10),
    float: z.number().min(0).max(4).default(1.5),
    cats: z.enum(spawnCats).default("both"),
  }),
  render(image, { params, progress }) {
    const coats = getCoats(params);
    const spark = parseColor(params.sparkColor);
    const tilts = [TABBY_TILT, BLACK_TILT];
    const solo = params.cats !== "both";
    const indices = solo ? [params.cats === "tabby" ? 0 : 1] : [0, 1];
    const targets = getBounceState(0);
    const approach = easings.easeInOutCubic(getSpan(progress, APPROACH_START, 1));
    const raster = createRaster();
    for (const [order, index] of indices.entries()) {
      const target = solo ? SOLO_TARGET : (targets[index] ?? SOLO_TARGET);
      const side = index === 0 ? -1 : 1;
      const spread = solo ? 0 : params.spread;
      const spawnStart = CHARGE_END + order * STAGGER;
      const spawn = getSpan(progress, spawnStart, spawnStart + SPAWN_LENGTH);
      const spin = getSpan(progress, spawnStart, 1);
      const x = target.x + side * spread * (1 - approach);
      const y =
        target.y + Math.sin(progress * TAU * 4 + index * Math.PI) * params.float * (1 - approach);
      if (getSpawnVisibility(spawn)) {
        drawCat(
          raster,
          {
            x,
            y,
            size: solo ? STARING_CAT_SIZE : CAT_SIZE,
            rotate: getRotation(
              tilts[index]?.[0] ?? 0,
              target.yaw - side * TAU * SPAWN_TURNS * (1 - spin) ** 2,
              tilts[index]?.[1] ?? 0,
            ),
            flash: 1 - easings.easeOutCubic(clamp(spawn * 1.6)),
          },
          coats[index] ?? coats[1],
        );
      }
      drawChargeParticles(raster, x, y, getSpan(progress, 0, spawnStart), spark);
      drawSpawnRing(raster, x, y, spawn, spark);
    }
    resolveRaster(raster, image);
  },
});

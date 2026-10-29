import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { WIDTH } from "../frame.ts";
import { createRaster, resolveRaster } from "../mesh.ts";
import { type Dancer, hunterMoveFrames, hunterMoves } from "./hunter-dance.ts";
import { type CatFace, drawEyes, eyeStyles } from "./cat-face.ts";
import { getCycle } from "./cat-dance.ts";
import { type HeroId, drawHero, heroIds } from "./frieren-model.ts";
import { HERO_EYE_COLORS, getHeroEyeModel, getHeroFace } from "./hero-love.ts";

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
    speed: z.number().min(0.25).max(4).default(1),
    sync: z.enum(heroSyncs).default("together"),
    size: z.number().min(4).max(20).default(15),
    spacing: z.number().min(0).max(30).default(15),
    eyes: z.enum(eyeStyles).default("open"),
    heartColor: colorSchema.default("#ff2a6d"),
  }),
  render(image, { params, beat }) {
    const raster = createRaster();
    const faces: [HeroId, CatFace][] = [];
    for (const [index, hero] of heroIds.entries()) {
      const side = index === 0 ? 1 : -1;
      const dancer: Dancer = {
        x: WIDTH / 2 - side * params.spacing,
        phase: syncPhases[params.sync][index] ?? 0,
        side,
      };
      const frame = hunterMoveFrames[params.move](beat * params.speed, dancer, params.size);
      const placement = {
        ...frame,
        pose: { ...frame.pose, cape: frame.pose.hair, skirt: frame.pose.hips },
        hidden: params.move === "twerk" ? ["cape" as const] : [],
      };
      drawHero(raster, hero, { ...placement, eyes: getHeroEyeModel(hero, placement, params.eyes) });
      faces.push([hero, getHeroFace(hero, placement)]);
    }
    resolveRaster(raster, image);
    const pop = 1 + 0.3 * Math.exp(-getCycle(beat) * 6);
    for (const [hero, face] of faces) {
      drawEyes(
        image,
        face,
        params.eyes,
        HERO_EYE_COLORS[hero],
        parseColor(params.heartColor),
        pop,
        params.size * 0.23,
      );
    }
  },
});

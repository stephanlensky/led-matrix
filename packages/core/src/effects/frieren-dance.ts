import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { HEIGHT, type RgbaImage, WIDTH, setRgbaPixel } from "../frame.ts";
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

const OUTLINE_ALPHA = 128;

function drawOutline(image: RgbaImage): void {
  const isSolid = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < WIDTH &&
    y < HEIGHT &&
    (image[(y * WIDTH + x) * 4 + 3] ?? 0) >= OUTLINE_ALPHA;
  const outline: [number, number][] = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (
        !isSolid(x, y) &&
        (isSolid(x - 1, y) || isSolid(x + 1, y) || isSolid(x, y - 1) || isSolid(x, y + 1))
      ) {
        outline.push([x, y]);
      }
    }
  }
  for (const [x, y] of outline) {
    const offset = (y * WIDTH + x) * 4;
    const alpha = (image[offset + 3] ?? 0) / 255;
    setRgbaPixel(image, x, y, [
      (image[offset] ?? 0) * alpha,
      (image[offset + 1] ?? 0) * alpha,
      (image[offset + 2] ?? 0) * alpha,
    ]);
  }
}

export const heroSyncs = ["together", "alternate", "offbeat"] as const;

export const heroDancers = ["both", ...heroIds] as const;

export const heroDance = defineEffect({
  id: "hero-dance",
  name: "Frieren and Himmel dance",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    move: z.enum(hunterMoves).default("headbang"),
    speed: z.number().min(0.25).max(4).default(1),
    sync: z.enum(heroSyncs).default("together"),
    dancers: z.enum(heroDancers).default("both"),
    size: z.number().min(4).max(20).default(15),
    spacing: z.number().min(0).max(30).default(15),
    eyes: z.enum(eyeStyles).default("open"),
    heartColor: colorSchema.default("#ff2a6d"),
    outline: z.boolean().default(false),
  }),
  render(image, { params, beat }) {
    const raster = createRaster();
    const faces: [HeroId, CatFace][] = [];
    const isSolo = params.dancers !== "both";
    for (const [index, hero] of heroIds.entries()) {
      if (isSolo && hero !== params.dancers) {
        continue;
      }
      const side = index === 0 ? 1 : -1;
      const dancer: Dancer = {
        x: isSolo ? WIDTH / 2 : WIDTH / 2 - side * params.spacing,
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
    if (params.outline) {
      drawOutline(image);
    }
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

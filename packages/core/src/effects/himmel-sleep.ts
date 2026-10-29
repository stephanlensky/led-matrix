import { z } from "zod";
import { defineEffect } from "../effect.ts";
import { fonts, drawText } from "../fonts/index.ts";
import { HEIGHT, WIDTH } from "../frame.ts";
import { type Vector, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { TAU, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { HERO_CENTER, PROP_COLORS, drawHero, drawProp } from "./frieren-model.ts";
import { getModelProjector } from "./hunter-model.ts";
import { createBedMesh, createBlanketMesh } from "./frieren-props.ts";
import { scale } from "./cat-model.ts";

const bedMesh = createBedMesh();
const SNORE_COLOR = PROP_COLORS.pillow;
const SNORE_LETTERS = 3;
const HEAD: Vector = [0, 0.3, -0.9];

export const himmelSleep = defineEffect({
  id: "himmel-sleep",
  name: "Himmel sleeping",
  kind: "pixel",
  params: z.object({
    breath: z.number().min(1).max(16).default(4),
    size: z.number().min(8).max(32).default(15),
    yaw: z.number().min(-180).max(180).default(-35),
    pitch: z.number().min(0).max(80).default(38),
  }),
  render(image, { params, beat }) {
    const phase = getCycle(beat / params.breath);
    const inhale = 0.5 - 0.5 * Math.cos(phase * TAU);
    const raster = createRaster();
    const placement = {
      x: WIDTH / 2 + 3,
      y: HEIGHT / 2 - params.size * 0.55,
      size: params.size,
      rotate: getRotation(toRadians(params.pitch), toRadians(params.yaw), 0),
    };
    drawProp(raster, bedMesh, placement);
    drawProp(raster, createBlanketMesh(0.5 + 0.06 * inhale), placement);
    drawHero(raster, "himmel", {
      ...placement,
      orient: getRotation(toRadians(-90), 0, 0),
      offset: [0, 0.3, 0.15],
      eyes: "closed",
      hidden: [
        "cape",
        "leftArm",
        "rightArm",
        "leftForearm",
        "rightForearm",
        "leftLeg",
        "rightLeg",
        "leftShin",
        "rightShin",
      ],
      pose: { head: getRotation(toRadians(8 * inhale), 0, toRadians(-12)) },
    });
    resolveRaster(raster, image);
    const font = fonts["spleen-5x8"];
    const [headX, headY] = getModelProjector(HERO_CENTER, placement)(HEAD);
    for (let index = 0; index < SNORE_LETTERS; index++) {
      const age = getCycle(phase + index / SNORE_LETTERS);
      const fade = Math.sin(age * Math.PI);
      if (fade < 0.2) {
        continue;
      }
      const x = headX + 3 + age * 12 + Math.sin(age * TAU) * 2;
      const y = headY - 6 - age * 14;
      drawText(
        image,
        font,
        index % 2 === 0 ? "Z" : "z",
        Math.round(x),
        Math.round(y),
        scale(SNORE_COLOR, fade),
      );
    }
  },
});

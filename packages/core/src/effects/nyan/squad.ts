import { z } from "zod";
import { parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { TAU } from "../cat-duo.ts";
import {
  type NyanCatId,
  drawMiniNyan,
  drawMiniRainbow,
  drawNyan,
  drawRainbow,
  drawStars,
  fillBackground,
  getNyanFrame,
  getNyanPalette,
  getShadedPalette,
  nyanCatIds,
  nyanParams,
} from "./shared.ts";

type Wingman = { x: number; y: number; phase: number; cat: NyanCatId };

const FULL_WINGMEN = [
  { x: 5, y: 1, phase: 2 },
  { x: 5, y: 43, phase: 4 },
] as const;

const MINI_WINGMEN = [
  { x: 9, y: 7, phase: 2 },
  { x: 9, y: 46, phase: 4 },
] as const;

export function getWingmanCats(lead: NyanCatId): [NyanCatId, NyanCatId] {
  const [top = "black", bottom = "tabby"] = nyanCatIds.filter((cat) => cat !== lead);
  return [top, bottom];
}

export const nyanSquad = defineEffect({
  id: "nyan-squad",
  name: "Nyan squad",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    wingmen: z.enum(["full", "mini"]).default("full"),
    depth: z.number().min(0.2).max(1).default(0.7),
    drift: z.number().min(0).max(6).default(2),
    stars: z.number().int().min(0).max(40).default(14),
  }),
  render(image, { params, beat }) {
    fillBackground(image, parseColor(params.background));
    const frame = getNyanFrame(beat, params.speed);
    drawStars(image, frame, { count: params.stars });
    const isMini = params.wingmen === "mini";
    const cats = getWingmanCats(params.cat);
    const wingmen: Wingman[] = (isMini ? MINI_WINGMEN : FULL_WINGMEN).map(
      ({ x, y, phase }, index) => ({
        x: x + Math.round(params.drift * Math.sin((beat / 8 + index * 0.5) * TAU)),
        y,
        phase,
        cat: cats[index] ?? "black",
      }),
    );
    for (const wingman of wingmen) {
      const wingFrame = frame + wingman.phase;
      const amount = isMini ? Math.min(1, params.depth + 0.2) : params.depth;
      const palette = getShadedPalette(getNyanPalette(params, wingman.cat), amount);
      if (isMini) {
        drawMiniRainbow(image, wingman.x, wingman.y, wingFrame, { amount });
        drawMiniNyan(image, params, wingman.x, wingman.y, wingFrame, { cat: wingman.cat, palette });
      } else {
        drawRainbow(image, wingman.x, wingman.y, wingFrame, { amount });
        drawNyan(image, params, wingman.x, wingman.y, wingFrame, { cat: wingman.cat, palette });
      }
    }
    const leadX = (isMini ? 25 : 24) + Math.round(params.drift * 0.5 * Math.sin((beat / 8) * TAU));
    drawRainbow(image, leadX, 22, frame);
    drawNyan(image, params, leadX, 22, frame);
  },
});

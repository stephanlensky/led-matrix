import { z } from "zod";
import { parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import type { Color } from "../../frame.ts";
import { type Palette, createSprite, drawSprite } from "../../sprite.ts";
import { getCharacterHead } from "../character-heads.ts";
import { type HeroRiderId, type RiderId, getTartBob, riderIds } from "./pixel-riders.ts";
import {
  BLACK,
  drawNyan,
  drawRainbow,
  drawScaledSprite,
  drawStars,
  fillBackground,
  getNyanFrame,
  nyanParams,
} from "./shared.ts";

const SKIN = parseColor("#f6c2a0");

const HAND_PALETTE: Palette = { K: BLACK, f: SKIN };

const HAND_DOWN = createSprite(["KKK", "KffK", "KKK"]);

const HAND_UP = createSprite([".KK.", "KffK", "KffK", ".KK."]);

const SEATS: Readonly<Record<RiderId, readonly [rider: HeroRiderId, x: number][]>> = {
  frieren: [["frieren", 9]],
  himmel: [["himmel", 10]],
  both: [
    ["himmel", 14],
    ["frieren", 2],
  ],
};

function getHairStreams(rider: HeroRiderId): readonly Color[] {
  return rider === "frieren"
    ? [parseColor("#e4e0f4"), parseColor("#a8a4c8")]
    : [parseColor("#e6dcc0"), parseColor("#2c48b0")];
}

export const nyanHeadRiders = defineEffect({
  id: "nyan-head-riders",
  name: "Nyan head riders",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    rider: z.enum(riderIds).default("frieren"),
    pose: z.enum(["hold", "cheer", "pump"]).default("pump"),
    stars: z.number().int().min(0).max(40).default(12),
  }),
  render(image, { params, beat }) {
    fillBackground(image, parseColor(params.background));
    const frame = getNyanFrame(beat, params.speed);
    drawStars(image, frame, { count: params.stars });
    const x = 20;
    const y = 34;
    const bob = getTartBob(frame);
    const seats = SEATS[params.rider];
    for (const [rider, seatX] of seats) {
      const head = getCharacterHead(rider, params);
      const headX = x + seatX;
      const headY = y + bob - head.sprite.height + 3;
      const [first, second] = getHairStreams(rider);
      for (let index = 0; index < 4; index++) {
        const wave = Math.round(Math.sin((frame / 3 + index * 0.7) * Math.PI));
        const length = 5 + ((frame + index) % 3);
        for (let step = 0; step < length; step++) {
          const color = (index + step) % 3 === 0 ? second : first;
          const streamX = headX - 1 - step;
          const streamY = headY + 4 + index * 2 + (step > 2 ? wave : 0);
          drawScaledSprite(image, createSprite(["X"]), streamX, streamY, { X: color ?? BLACK });
        }
      }
    }
    drawRainbow(image, x, y, frame);
    for (const [index, [rider, seatX]] of seats.entries()) {
      const head = getCharacterHead(rider, params);
      const headX = x + seatX;
      const isUp =
        params.pose === "cheer" ||
        (params.pose === "pump" && (Math.floor(beat) + index) % 2 === 0 && beat % 1 < 0.5);
      const lift = isUp ? 1 : 0;
      drawSprite(image, head.sprite, headX, y + bob - head.sprite.height + 3 - lift, head.palette);
    }
    drawNyan(image, params, x, y, frame);
    for (const [index, [rider, seatX]] of seats.entries()) {
      const head = getCharacterHead(rider, params);
      const isUp =
        params.pose === "cheer" ||
        (params.pose === "pump" && (Math.floor(beat) + index) % 2 === 0 && beat % 1 < 0.5);
      const left = x + seatX - 1;
      const right = x + seatX + head.sprite.width - 3;
      if (isUp) {
        const handY = y + bob - head.sprite.height + 1;
        drawScaledSprite(image, HAND_UP, left - 2, handY, HAND_PALETTE);
        drawScaledSprite(image, HAND_UP, right + 1, handY, HAND_PALETTE);
      } else {
        drawScaledSprite(image, HAND_DOWN, left + 2, y + bob - 1, HAND_PALETTE);
        drawScaledSprite(image, HAND_DOWN, right - 2, y + bob - 1, HAND_PALETTE);
      }
    }
  },
});

import { z } from "zod";
import { parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import type { RgbaImage } from "../../frame.ts";
import { type Palette, type Sprite, createSprite } from "../../sprite.ts";
import {
  drawNyan,
  drawRainbow,
  drawScaledSprite,
  drawStars,
  fillBackground,
  getNyanFrame,
  nyanParams,
} from "./shared.ts";

export const riderIds = ["frieren", "himmel", "both"] as const;

export type RiderId = (typeof riderIds)[number];

export type HeroRiderId = Exclude<RiderId, "both">;

export const RIDER_PALETTE: Palette = {
  K: [0, 0, 0],
  H: parseColor("#e4e0f4"),
  h: parseColor("#aaa6c4"),
  f: parseColor("#f6c2a0"),
  e: parseColor("#1e9c70"),
  w: parseColor("#f4f2ee"),
  y: parseColor("#d8a838"),
  d: parseColor("#3c4060"),
  b: parseColor("#8a6440"),
  r: parseColor("#e03030"),
  m: parseColor("#d0506a"),
  B: parseColor("#8cc0ec"),
  j: parseColor("#5a8cc8"),
  u: parseColor("#2c48b0"),
  c: parseColor("#e6dcc0"),
  n: parseColor("#1c3c78"),
  s: parseColor("#a8a8b8"),
  g: parseColor("#262838"),
};

const FRIEREN_HEAD = [
  "...KKKKK...",
  "..KHHHHHK..",
  ".KHHHHHHHK.",
  "KHHHHHHHHHK",
  "KHHfHHHfHHK",
  "KHfffffffHK",
  "KHfefffefHK",
  "KrfffffffrK",
  "hHKfffmfKHh",
];

const HIMMEL_HEAD = [
  "...KKKKK...",
  "..KBBBBBK..",
  ".KBBBBBBBK.",
  "KBBBBBBBBBK",
  "KBjBBBBBjBK",
  "KBfBfffBfBK",
  "KBfnfffnfBK",
  "KBfffffffBK",
  ".KKffmffKK.",
];

const RIDER_SPRITES: Readonly<Record<HeroRiderId, Readonly<Record<"sit" | "cheer", Sprite>>>> = {
  frieren: {
    sit: createSprite([
      ...FRIEREN_HEAD,
      "hH.KwdwK.Hh",
      "hHKwwywwKHh",
      "hHfKwywKfHh",
      "hhKwwwwwKhh",
      ".hKyyyyyKh.",
      "...KdKdK...",
      "...KbKbK...",
    ]),
    cheer: createSprite([
      "f.........f",
      "w..KKKKK..w",
      "wKKHHHHHKKw",
      ...FRIEREN_HEAD.slice(2),
      "hH.KwdwK.Hh",
      "hH.KwywK.Hh",
      "hH.KwywK.Hh",
      "hhKwwwwwKhh",
      ".hKyyyyyKh.",
      "...KdKdK...",
      "...KbKbK...",
    ]),
  },
  himmel: {
    sit: createSprite([
      ...HIMMEL_HEAD,
      ".cKKsssKKc.",
      "ccKuwuwuKcc",
      "cKfuuwuufKc",
      "cKuuuuuuuKc",
      "c.KwwwwwK.c",
      "...KwKwK...",
      "...KgKgK...",
    ]),
    cheer: createSprite([
      "f.........f",
      "u..KKKKK..u",
      "uKKBBBBBKKu",
      ...HIMMEL_HEAD.slice(2),
      ".cKKsssKKc.",
      "ccKuwuwuKcc",
      "c.KuuwuuK.c",
      "cKuuuuuuuKc",
      "c.KwwwwwK.c",
      "...KwKwK...",
      "...KgKgK...",
    ]),
  },
};

const SEATS: Readonly<Record<RiderId, readonly [rider: HeroRiderId, x: number][]>> = {
  frieren: [["frieren", 8]],
  himmel: [["himmel", 8]],
  both: [
    ["himmel", 13],
    ["frieren", 3],
  ],
};

export function getTartBob(frame: number): number {
  const phase = ((frame % 6) + 6) % 6;
  return phase < 2 ? 0 : 1;
}

export function drawPixelRider(
  image: RgbaImage,
  rider: HeroRiderId,
  pose: "sit" | "cheer",
  x: number,
  seatY: number,
): void {
  const sprite = RIDER_SPRITES[rider][pose];
  drawScaledSprite(image, sprite, x, seatY - sprite.height + 3, RIDER_PALETTE);
}

export const nyanPixelRiders = defineEffect({
  id: "nyan-pixel-riders",
  name: "Nyan pixel riders",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    rider: z.enum(riderIds).default("frieren"),
    pose: z.enum(["sit", "cheer", "pump"]).default("pump"),
    stars: z.number().int().min(0).max(40).default(12),
  }),
  render(image, { params, beat }) {
    fillBackground(image, parseColor(params.background));
    const frame = getNyanFrame(beat, params.speed);
    drawStars(image, frame, { count: params.stars });
    const x = 20;
    const y = 36;
    drawRainbow(image, x, y, frame);
    drawNyan(image, params, x, y, frame);
    const seatY = y + getTartBob(frame) + 1;
    for (const [index, [rider, seatX]] of SEATS[params.rider].entries()) {
      const isUp =
        params.pose === "cheer" ||
        (params.pose === "pump" && (Math.floor(beat) + index) % 2 === 0 && beat % 1 < 0.5);
      drawPixelRider(image, rider, isUp ? "cheer" : "sit", x + seatX, seatY);
    }
  },
});

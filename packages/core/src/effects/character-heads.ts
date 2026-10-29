import { parseColor } from "../color.ts";
import type { Color } from "../frame.ts";
import { type Palette, type Sprite, createSprite } from "../sprite.ts";
import type { FurParams } from "./cat-duo.ts";
import { mix, scale } from "./cat-model.ts";

export type CharacterHeadId = "tabby" | "black" | "frieren" | "himmel";

export type CharacterHead = { sprite: Sprite; palette: Palette };

const WHITE: Color = [255, 255, 255];
const PINK: Color = [255, 130, 160];
const SKIN = parseColor("#f6c2a0");
const MOUTH = parseColor("#d0506a");

const catHead = createSprite([
  ".G.........G.",
  ".GG.......GG.",
  ".GPG.....GPG.",
  ".GPGGSGSGGPG.",
  "GGGGGSGSGGGGG",
  "SSGGGGGGGGGSS",
  "GGEEGGGGGEEGG",
  "GGEEGGGGGEEGG",
  "SSGGGLNLGGGSS",
  ".GGGLLLLLGGG.",
  "..GGGLLLGGG..",
  "....GGGGG....",
]);

const frierenHead = createSprite([
  ".....HHHHH.....",
  "...HHHHHHHHH...",
  "..HHHHHHHHHHH..",
  "..HHHHHHHHHHH..",
  "..HHHHFHFHHHH..",
  "FFHHFFFFFFFHHFF",
  ".FHFEFFFFFEFHF.",
  "..HFEFFFFFEFH..",
  "..HRFFFFFFFRH..",
  "..HhFFFMFFFhH..",
  "..Hh.FFFFF.hH..",
  "..hh.......hh..",
  "..h.........h..",
]);

const himmelHead = createSprite([
  "...HHHHHHH...",
  ".HHHHHHHHHHH.",
  "HHHHHHHHHHHHH",
  "HHHHHHHHHHHHH",
  "HHFHHHHFHHHHH",
  "HFFFHHFFFHFFH",
  "HFFEFFFFFEFFH",
  "HFFEFFFFFEFFH",
  ".FFFFFFFFFFF.",
  ".FFFMFFFMFFF.",
  "..FFFMMMFFF..",
  "....FFFFF....",
]);

function getCatPalette(body: Color, stripe: Color, light: Color, eye: Color): Palette {
  return { G: body, S: stripe, L: light, E: eye, P: PINK, N: PINK };
}

export function getCharacterHead(id: CharacterHeadId, params: FurParams): CharacterHead {
  if (id === "tabby") {
    return {
      sprite: catHead,
      palette: getCatPalette(
        parseColor(params.tabbyColor),
        parseColor(params.tabbyStripeColor),
        parseColor(params.tabbyLightColor),
        parseColor(params.tabbyEyeColor),
      ),
    };
  }
  if (id === "black") {
    const body = parseColor(params.color);
    return {
      sprite: catHead,
      palette: getCatPalette(
        body,
        scale(body, 0.65),
        mix(body, WHITE, 0.3),
        parseColor(params.eyeColor),
      ),
    };
  }
  if (id === "frieren") {
    const hair = parseColor("#e4e0f4");
    return {
      sprite: frierenHead,
      palette: {
        H: hair,
        h: scale(hair, 0.7),
        F: SKIN,
        E: parseColor("#28a07c"),
        R: parseColor("#e03030"),
        M: MOUTH,
      },
    };
  }
  return {
    sprite: himmelHead,
    palette: {
      H: parseColor("#8cc0ec"),
      F: SKIN,
      E: parseColor("#2c5cc8"),
      M: MOUTH,
    },
  };
}

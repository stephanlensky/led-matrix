import type { Palette } from "../../sprite.ts";
import type { HairStyle } from "./sprites.ts";

export type Hunter = {
  name: string;
  hair: HairStyle;
  x: number;
  fireOffset: number;
  palette: Palette;
};

export type DemonType = "imp" | "bat" | "brute";

export type Spawn = {
  type: DemonType;
  x: number;
  y: number;
};

const gun: Palette = {
  G: [200, 200, 215],
  g: [110, 110, 125],
};

export const hunters: readonly Hunter[] = [
  {
    name: "Zoey",
    hair: "bob",
    x: 4,
    fireOffset: 0.25,
    palette: {
      ...gun,
      H: [60, 80, 235],
      h: [30, 40, 150],
      s: [240, 180, 140],
      t: [60, 225, 110],
      p: [110, 70, 170],
      l: [110, 70, 170],
      b: [255, 210, 60],
      c: [90, 120, 255],
    },
  },
  {
    name: "Mira",
    hair: "ponytail",
    x: 15,
    fireOffset: 0.125,
    palette: {
      ...gun,
      H: [255, 60, 155],
      h: [175, 30, 105],
      s: [240, 180, 140],
      t: [90, 90, 115],
      p: [245, 175, 30],
      l: [70, 60, 90],
      b: [70, 60, 90],
      c: [255, 80, 170],
    },
  },
  {
    name: "Rumi",
    hair: "braid",
    x: 26,
    fireOffset: 0,
    palette: {
      ...gun,
      H: [170, 140, 255],
      h: [105, 80, 200],
      s: [240, 180, 140],
      t: [255, 195, 30],
      p: [70, 70, 90],
      l: [240, 180, 140],
      b: [120, 60, 140],
      c: [190, 165, 255],
    },
  },
];

export const cats: readonly Hunter[] = [
  {
    name: "Tabby",
    hair: "bob",
    x: 6,
    fireOffset: 0.25,
    palette: { ...gun, h: [140, 142, 148], H: [240, 176, 32], c: [255, 190, 60] },
  },
  {
    name: "Black",
    hair: "bob",
    x: 22,
    fireOffset: 0,
    palette: { ...gun, h: [75, 29, 122], H: [48, 232, 48], c: [120, 255, 90] },
  },
];

export const TILE_SIZE = 4;
export const LEVEL_TOP = 8;
export const SCROLL_SPEED = 12;

export const level = [
  "................................................",
  "................................................",
  "................................................",
  "................................................",
  "................................................",
  "................................................",
  "................................................",
  "...................--------.....................",
  "................................................",
  "................................................",
  "==============..=================..=============",
  "##############..#################..#############",
  "##############~~#################~~#############",
  "##############~~#################~~#############",
];

export const spawns: readonly Spawn[] = [
  { type: "imp", x: 70, y: 40 },
  { type: "bat", x: 96, y: 20 },
  { type: "imp", x: 110, y: 20 },
  { type: "imp", x: 130, y: 40 },
  { type: "bat", x: 150, y: 22 },
  { type: "bat", x: 162, y: 16 },
  { type: "brute", x: 185, y: 36 },
];

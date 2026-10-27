import type { Color } from "../../frame.ts";
import { type Palette, type Sprite, createSprite, rotateSprite } from "../../sprite.ts";

export type HairSprite = {
  frames: readonly Sprite[];
  offsetX: number;
};

export const hunterRunFrames = [
  createSprite([
    "........",
    "...ss...",
    "...sss..",
    "...ss...",
    "...tt...",
    "..ttt...",
    "...tt...",
    "..ppp...",
    "..l.ll..",
    ".ll..l..",
    ".l...ll.",
    "bb....b.",
  ]),
  createSprite([
    "........",
    "...ss...",
    "...sss..",
    "...ss...",
    "...tt...",
    "..ttt...",
    "...tt...",
    "..ppp...",
    "...ll...",
    "...ll...",
    "..l.l...",
    "..bbb...",
  ]),
  createSprite([
    "........",
    "...ss...",
    "...sss..",
    "...ss...",
    "...tt...",
    "..ttt...",
    "...tt...",
    "..ppp...",
    "..ll.l..",
    "..l...l.",
    ".l....l.",
    ".b....bb",
  ]),
];

export const hunterBallFrames = [0, 1, 2, 3].map((turns) =>
  rotateSprite(createSprite(["..HHH.", ".HHsst", "HHs.tt", "Hl..pp", ".ll.p.", "..bll."]), turns),
);

export type Aim = "right" | "up" | "down";

export const gunSprites: Readonly<Record<Aim, { sprite: Sprite; x: number; y: number }>> = {
  right: { sprite: createSprite(["ssGGg", "...g."]), x: 3, y: 5 },
  up: { sprite: createSprite(["....G", "...G.", "..G..", "ss..."]), x: 3, y: 2 },
  down: { sprite: createSprite(["ss...", "..G..", "...G.", "....g"]), x: 3, y: 5 },
};

export const muzzleFlash = createSprite(["y.y", ".W.", "y.y"]);

export const bulletSprite = createSprite([".c.", "cWc", ".c."]);

export const hairStyles = {
  bob: {
    offsetX: 0,
    frames: [
      createSprite([".hH.....", "..HHHH..", "..HHh...", "..Hh...."]),
      createSprite(["..hH....", "..HHHH..", "..HHh...", "..Hh...."]),
    ],
  },
  braid: {
    offsetX: 0,
    frames: [
      createSprite([
        "...HHH..",
        "..HHHH..",
        "..H.....",
        "..h.....",
        ".H......",
        ".h......",
        ".H......",
        "h.......",
      ]),
      createSprite([
        "...HHH..",
        "..HHHH..",
        "..H.....",
        "..h.....",
        "..H.....",
        ".h......",
        ".H......",
        ".h......",
      ]),
    ],
  },
  ponytail: {
    offsetX: -3,
    frames: [
      createSprite([
        ".....HHHH..",
        "...HHHHHH..",
        "..HhHHH....",
        ".HH..Hh....",
        ".Hh........",
        "HH.........",
        "H..........",
        "h..........",
      ]),
      createSprite([
        ".....HHHH..",
        "..HHHHHHH..",
        ".HHh.HH....",
        "HH...Hh....",
        "Hh.........",
        "H..........",
        ".H.........",
        ".h.........",
      ]),
    ],
  },
} as const satisfies Record<string, HairSprite>;

export type HairStyle = keyof typeof hairStyles;

export const impFrames = [
  createSprite([
    "k.....k",
    "kd...dk",
    ".rrrrr.",
    "rerrrer",
    "rrmmmrr",
    ".rrrrr.",
    ".r...r.",
    "rr...rr",
  ]),
  createSprite([
    "k.....k",
    "kd...dk",
    ".rrrrr.",
    "rerrrer",
    "rrmmmrr",
    ".rrrrr.",
    "..r.r..",
    ".rr.rr.",
  ]),
];

export const batFrames = [
  createSprite(["w.......w", "ww.k.k.ww", ".wwrrrww.", "..rerer..", "...rmr...", "....r...."]),
  createSprite([".........", "...k.k...", "...rrr...", ".wwrerww.", "ww.rmr.ww", "w...r...w"]),
];

export const bruteFrames = [
  createSprite([
    "k.........k",
    "kk.......kk",
    ".kdrrrrrdk.",
    "..rrrrrrr..",
    ".rreerreer.",
    ".rrrrrrrrr.",
    "rrrmmmmmrrr",
    "rr.rmmmr.rr",
    "rr.rrrrr.rr",
    "...rrdrr...",
    "..rr...rr..",
    ".rrr...rrr.",
  ]),
  createSprite([
    "k.........k",
    "kk.......kk",
    ".kdrrrrrdk.",
    "..rrrrrrr..",
    ".rreerreer.",
    ".rrrrrrrrr.",
    "rrrmmmmmrrr",
    "rr.rmmmr.rr",
    "rr.rrrrr.rr",
    "...rrdrr...",
    "...rr.rr...",
    "..rrr.rrr..",
  ]),
];

export const explosionFrames = [
  createSprite([".......", ".......", "...y...", "..yWy..", "...y...", ".......", "......."]),
  createSprite(["...o...", ".o.y.o.", "..yWy..", "oyWWWyo", "..yWy..", ".o.y.o.", "...o..."]),
  createSprite(["o..o..o", ".r...r.", "...o...", "or.r.ro", "...o...", ".r...r.", "o..o..o"]),
];

export const explosionPalette: Palette = {
  W: [255, 255, 230],
  y: [255, 220, 60],
  o: [255, 120, 20],
  r: [170, 30, 10],
};

export const medalSprite = createSprite(["c.c", "c.c", ".m.", "mmm", "mMm", ".m."]);

export const digitSprites: Readonly<Record<string, Sprite>> = {
  "1": createSprite([".#", "##", ".#", ".#", ".#"]),
  "2": createSprite(["##.", "..#", ".#.", "#..", "###"]),
  "3": createSprite(["##.", "..#", ".#.", "..#", "##."]),
  P: createSprite(["##.", "#.#", "##.", "#..", "#.."]),
};

export const tileSprites: Readonly<Record<string, readonly Sprite[]>> = {
  "=": [
    createSprite(["gGgG", "GGGG", "dGdd", "rRrr"]),
    createSprite(["GgGG", "GGGG", "ddGd", "rrRr"]),
  ],
  "-": [
    createSprite(["gGgG", "GGGG", "dGdd", "d..d"]),
    createSprite(["GgGG", "GGGG", "ddGd", ".d.."]),
  ],
  "#": [
    createSprite(["rRrr", "rrrk", "kRrr", "rrkr"]),
    createSprite(["rrRr", "krrr", "rrRk", "Rrrr"]),
  ],
  "~": [
    createSprite(["wW..", "....", "....", "...."]),
    createSprite(["..wW", "....", "....", "...."]),
  ],
};

export const tilePalette: Palette = {
  g: [150, 240, 90],
  G: [50, 170, 50],
  d: [25, 90, 35],
  r: [95, 70, 55],
  R: [140, 110, 85],
  k: [55, 40, 32],
  w: [120, 170, 255],
  W: [220, 240, 255],
};

export const WATER_COLOR: Color = [20, 40, 140];

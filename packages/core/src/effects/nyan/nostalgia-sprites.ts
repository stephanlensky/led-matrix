import { parseColor } from "../../color.ts";
import { type Palette, createSprite } from "../../sprite.ts";

const K = parseColor("#000000");
const WHITE = parseColor("#ffffff");

export const EMOJI_PALETTE: Palette = {
  O: parseColor("#8a5200"),
  Y: parseColor("#ffd800"),
  K,
  W: WHITE,
  R: parseColor("#e8203c"),
  r: parseColor("#ff7a90"),
  B: parseColor("#2850c8"),
};

export const EMOJI_SPRITES = [
  createSprite([
    "..OOOOO..",
    ".OYYYYYO.",
    "OYYKYKYYO",
    "OYYKYKYYO",
    "OYYYYYYYO",
    "OYKYYYKYO",
    "OYYKKKYYO",
    ".OYYYYYO.",
    "..OOOOO..",
  ]),
  createSprite([
    "..OOOOO..",
    ".OYYYYYO.",
    "OYYKYKYYO",
    "OYYKYKYYO",
    "OYYYYYYYO",
    "OYKKKKKYO",
    "OYKWWWKYO",
    ".OYKKKYO.",
    "..OOOOO..",
  ]),
  createSprite([
    "..OOOOO..",
    ".OYYYYYO.",
    "OYYKYYYYO",
    "OYYKYKKYO",
    "OYYYYYYYO",
    "OYKYYYKYO",
    "OYYKKKYYO",
    ".OYYYYYO.",
    "..OOOOO..",
  ]),
  createSprite([
    "..OOOOO..",
    ".OYYYYYO.",
    "OYYKYKYYO",
    "OYYKYKYYO",
    "OYYYYYYYO",
    "OYKKKKKYO",
    "OYYYRRYYO",
    ".OYYRRYO.",
    "..OOOOO..",
  ]),
  createSprite([
    "..OOOOO..",
    ".OYYYYYO.",
    "OYKKYKKYO",
    "OYKKYKKYO",
    "OYYYYYYYO",
    "OYYYKYYYO",
    "OYYKYKYYO",
    ".OYYKYYO.",
    "..OOOOO..",
  ]),
  createSprite([
    "..OOOOO..",
    ".OYYYYYO.",
    "OKKKKKKKO",
    "OYKKYKKYO",
    "OYYYYYYYO",
    "OYKYYYKYO",
    "OYYKKKYYO",
    ".OYYYYYO.",
    "..OOOOO..",
  ]),
  createSprite([
    ".RR...RR.",
    "RWrR.RRRR",
    "RrRRRRRRR",
    "RRRRRRRRR",
    ".RRRRRRR.",
    "..RRRRR..",
    "...RRR...",
    "....R....",
  ]),
  createSprite([
    "..OOOOO..",
    ".OYYYYYO.",
    "OYYKYKYYO",
    "OYYKYKYYO",
    "OYYYYYYYO",
    "OYYKKKYYO",
    "OYKYYYKYO",
    ".OYYYYYO.",
    "..OOOOO..",
  ]),
] as const;

export const DOGE_PALETTE: Palette = {
  K,
  T: parseColor("#e0a040"),
  t: parseColor("#b87a28"),
  C: parseColor("#f8e4b8"),
  W: WHITE,
};

export const DOGE = createSprite([
  "..K..........K..",
  ".KtK........KtK.",
  ".KTtK......KtTK.",
  ".KTTTKKKKKKTTTK.",
  "KTTTTTTTTTTTTTTK",
  "KTTTTTTTTTTTTTTK",
  "KTTWKTTTTTTWKTTK",
  "KTTTTTTTTTTTTTTK",
  "KTTTCCCCCCCCTTTK",
  "KTTCCCCKKKCCCTTK",
  "KTCCCCCCKCCCCCTK",
  ".KCCCCKKCKKCCCK.",
  ".KCCCCCCCCCCCCK.",
  "..KKCCCCCCCCKK..",
  "....KKKKKKKK....",
]);

export const MINECRAFT_PALETTE: Palette = {
  g: parseColor("#5d9e2f"),
  G: parseColor("#7cbd3c"),
  d: parseColor("#866043"),
  D: parseColor("#6b4a30"),
  s: parseColor("#7a7a7a"),
  S: parseColor("#9a9a9a"),
  c: parseColor("#5decf5"),
  L: parseColor("#6b5130"),
  l: parseColor("#4f3a22"),
  V: parseColor("#3f8f2a"),
  v: parseColor("#2e6b1e"),
  K,
  C: parseColor("#6ccf4a"),
  E: parseColor("#2f7a24"),
  U: parseColor("#fff27a"),
  u: parseColor("#ffd23a"),
  W: WHITE,
  w: parseColor("#d8d8d8"),
  P: parseColor("#f0a0a8"),
  p: parseColor("#d07880"),
};

export const GRASS_BLOCK = createSprite(["GgGG", "gDgd", "dDdd", "Dddd"]);
export const DIRT_BLOCK = createSprite(["dDdd", "ddDd", "Dddd", "ddDd"]);
export const STONE_BLOCK = createSprite(["SsSS", "sSSs", "SSsS", "sSSS"]);
export const DIAMOND_BLOCK = createSprite(["ScSS", "sScs", "cSSS", "sScS"]);
export const LOG_BLOCK = createSprite(["LlLL", "LlLl", "LLLl", "lLLl"]);
export const LEAF_BLOCK = createSprite(["VvVV", "VVvV", "vVVV", "VVVv"]);
export const SUN = createSprite([
  "uUUUUUu",
  "UUUUUUU",
  "UUUUUUU",
  "UUUUUUU",
  "UUUUUUU",
  "UUUUUUU",
  "uUUUUUu",
]);
export const CLOUD = createSprite([
  "...WWWWWWw.....",
  ".WWWWWWWWWWWWw.",
  "WWWWWWWWWWWWWWW",
  "wwwwwwwwwwwwwww",
]);

export const CREEPER = createSprite([
  "CECCECCE",
  "ECCECCEC",
  "CKKCCKKC",
  "CKKECKKE",
  "ECCKKCCC",
  "CEKKKKEC",
  "CCKKKKCE",
  "ECKCCKCC",
  "..CECE..",
  "..ECCC..",
  "..CCEC..",
  "..CECC..",
  "..ECCE..",
  "CECCECCE",
  "ECE..ECE",
]);

export const PIG = createSprite([
  "....PPPPPP",
  "....PKPPKP",
  "PPPPPPPppP",
  "PpPPPPPKpK",
  "PPPPPPPppP",
  "PPPpPPPPP.",
  "PP.PP.PP..",
  "pp.pp.pp..",
]);

export const FLAPPY_PALETTE: Palette = {
  K: parseColor("#543847"),
  L: parseColor("#9ce659"),
  G: parseColor("#73bf2e"),
  d: parseColor("#558022"),
  Y: parseColor("#f8d030"),
  y: parseColor("#e0a020"),
  O: parseColor("#f86020"),
  W: WHITE,
  w: parseColor("#fff0b0"),
  T: parseColor("#ded895"),
  b: parseColor("#4a8a1c"),
};

export const FLAPPY_BIRD = [
  createSprite([
    "...KKKKK..",
    "..KwwYKWK.",
    ".KYYYYKWKK",
    "KwwwYYKWKK",
    "KWWwKYYKKKK",
    "KwwKYYKOOOK",
    ".KKYYYKOKK.",
    "..KyyyyKOOK",
    "...KKKKKKK.",
  ]),
  createSprite([
    "...KKKKK..",
    "..KYYYKWK.",
    ".KYYYYKWKK",
    "KKKKYYKWKK",
    "KwwwKYYKKKK",
    "KwwwKYKOOOK",
    ".KKKYYKOKK.",
    "..KyyyyKOOK",
    "...KKKKKKK.",
  ]),
] as const;

export const ANGRY_PALETTE: Palette = {
  K,
  R: parseColor("#d81e1e"),
  r: parseColor("#a01010"),
  W: parseColor("#f4e0d0"),
  O: parseColor("#f8b020"),
  P: parseColor("#7ccf3c"),
  p: parseColor("#4f9a24"),
  s: parseColor("#b8f070"),
  B: parseColor("#c8893a"),
  b: parseColor("#7a4a1a"),
  E: WHITE,
};

export const RED_BIRD = createSprite([
  "....KK.K..",
  "...KRRKRK.",
  "..KRRRRRK.",
  ".KRRKKRRRK",
  "KRRKEKEKRK",
  "KRRREKOOKK",
  "KRrRRROOOK",
  "KRWWWRRKK.",
  ".KWWWWRK..",
  "..KKKKK...",
]);

export const GREEN_PIG = createSprite([
  "...KKKK...",
  ".KKppPPKK.",
  "KPPPPPPPPK",
  "KPEKPPEKPK",
  "KPPPssPPPK",
  "KPPsKsKPPK",
  "KPPPssPPPK",
  ".KPPPPPPK.",
  "..KKKKKK..",
]);

export const SLINGSHOT = createSprite([
  "bB...bB",
  "bBB.bBB",
  ".bBbBB.",
  "..bBB..",
  "..bBB..",
  "..bBB..",
  "..bBB..",
  "..bBB..",
  ".bbBBb.",
]);

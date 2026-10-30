import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import { type Palette, type Sprite, createSprite } from "../../sprite.ts";
import { type FurParams, furParams } from "../cat-duo.ts";

export const NYAN_FRAMES_PER_BEAT = 6;
export const NYAN_WIDTH = 34;
export const NYAN_HEIGHT = 21;
export const NYAN_TART_LEFT = 7;
export const RAINBOW_HEIGHT = 19;
export const MINI_WIDTH = 19;
export const MINI_HEIGHT = 11;
export const BLACK: Color = [0, 0, 0];
export const WHITE: Color = [255, 255, 255];
export const RAINBOW_COLORS: readonly Color[] = [
  parseColor("#ff0000"),
  parseColor("#ff9900"),
  parseColor("#ffff00"),
  parseColor("#33ff00"),
  parseColor("#0099ff"),
  parseColor("#6633ff"),
];

const ORIGINAL_FRAMES = [
  createSprite([
    ".........KKKKKKKKKKKKKKKKK........",
    "........KCCCCCCCCCCCCCCCCCK.......",
    ".......KCCCFFFFFFFFFFFFFCCCK......",
    ".......KCCFFFFFFSFFSFFFFFCCK......",
    ".......KCFFSFFFFFFFFFFFFFFCK......",
    ".......KCFFFFFFFFFFKKFFSFFCK.KK...",
    ".......KCFFFFFFFFFKGGKFFFFCKKGGK..",
    ".KKKK..KCFFFFFFSFFKGGGKFFFCKGGGK..",
    ".KGGKK.KCFFFFFFFFFKGGGGKKKKGGGGK..",
    ".KKGGKKKCFFFSFFFFFKGGGGGGGGGGGGK..",
    "..KKGGKKCFFFFFFFSKGGGGGGGGGGGGGGK.",
    "...KKGGKCFSFFFFFFKGGGWEGGGGGWEGGK.",
    "....KKKKCFFFFFFFFKGGGEEGGGKGEEGGK.",
    "......KKCFFFFFSFFKGPPGGGGGGGGGPPK.",
    ".......KCCFSFFFFFKGPPGKGGKGGKGPPK.",
    ".......KCCCFFFFFFFKGGGKKKKKKKGGK..",
    "......KKKCCCCCCCCCCKGGGGGGGGGGK...",
    ".....KGGGKKKKKKKKKKKKKKKKKKKKK....",
    ".....KGGKK.KGGK.....KGGK.KGGK.....",
    ".....KKKK..KKK.......KKK..KK......",
    "..................................",
  ]),
  createSprite([
    ".........KKKKKKKKKKKKKKKKK........",
    "........KCCCCCCCCCCCCCCCCCK.......",
    ".......KCCCFFFFFFFFFFFFFCCCK......",
    ".......KCCFFFFFFSFFSFFFFFCCK......",
    ".......KCFFSFFFFFFFFFFFFFFCK......",
    ".......KCFFFFFFFFFFFKKFSFFCK..KK..",
    ".......KCFFFFFFFFFFKGGKFFFCK.KGGK.",
    ".......KCFFFFFFSFFFKGGGKFFCKKGGGK.",
    "..KK...KCFFFFFFFFFFKGGGGKKKKGGGGK.",
    ".KGGK..KCFFFSFFFFFFKGGGGGGGGGGGGK.",
    ".KGGKKKKCFFFFFFFSFKGGGGGGGGGGGGGGK",
    "..KGGGGKCFSFFFFFFFKGGGWEGGGGGWEGGK",
    "...KKGGKCFFFFFFFFFKGGGEEGGGKGEEGGK",
    ".....KKKCFFFFFSFFFKGPPGGGGGGGGGPPK",
    ".......KCCFSFFFFFFKGPPGKGGKGGKGPPK",
    ".......KCCCFFFFFFFFKGGGKKKKKKKGGK.",
    ".......KKCCCCCCCCCCCKGGGGGGGGGGK..",
    "......KGGKKKKKKKKKKKKKKKKKKKKKK...",
    "......KGGK.KGGK......KGGK.KGGK....",
    "......KKK...KKK.......KKK..KKK....",
    "..................................",
  ]),
  createSprite([
    "..................................",
    ".........KKKKKKKKKKKKKKKKK........",
    "........KCCCCCCCCCCCCCCCCCK.......",
    ".......KCCCFFFFFFFFFFFFFCCCK......",
    ".......KCCFFFFFFSFFSFFFFFCCK......",
    ".......KCFFSFFFFFFFFFFFFFFCK......",
    ".......KCFFFFFFFFFFFKKFSFFCK..KK..",
    ".......KCFFFFFFFFFFKGGKFFFCK.KGGK.",
    ".......KCFFFFFFSFFFKGGGKFFCKKGGGK.",
    ".......KCFFFFFFFFFFKGGGGKKKKGGGGK.",
    ".......KCFFFSFFFFFFKGGGGGGGGGGGGK.",
    "......KKCFFFFFFFSFKGGGGGGGGGGGGGGK",
    "...KKKKKCFSFFFFFFFKGGGWEGGGGGWEGGK",
    ".KKGGGGKCFFFFFFFFFKGGGEEGGGKGEEGGK",
    ".KGGGKKKCFFFFFSFFFKGPPGGGGGGGGGPPK",
    "..KKKK.KCCFSFFFFFFKGPPGKGGKGGKGPPK",
    ".......KCCCFFFFFFFFKGGGKKKKKKKGGK.",
    ".......KKCCCCCCCCCCCKGGGGGGGGGGK..",
    ".......KGKKKKKKKKKKKKKKKKKKKKKK...",
    ".......KGGK.KGGK......KGGK.KGGK...",
    ".......KKK...KKK.......KKK..KKK...",
  ]),
  createSprite([
    "..................................",
    ".........KKKKKKKKKKKKKKKKK........",
    "........KCCCCCCCCCCCCCCCCCK.......",
    ".......KCCCFFFFFFFFFFFFFCCCK......",
    ".......KCCFFFFFFSFFSFFFFFCCK......",
    ".......KCFFSFFFFFFFFFFFFFFCK......",
    ".......KCFFFFFFFFFFFKKFSFFCK..KK..",
    ".......KCFFFFFFFFFFKGGKFFFCK.KGGK.",
    ".......KCFFFFFFSFFFKGGGKFFCKKGGGK.",
    ".......KCFFFFFFFFFFKGGGGKKKKGGGGK.",
    ".......KCFFFSFFFFFFKGGGGGGGGGGGGK.",
    ".....KKKCFFFFFFFSFKGGGGGGGGGGGGGGK",
    "...KKGGKCFSFFFFFFFKGGGWEGGGGGWEGGK",
    "..KGGGGKCFFFFFFFFFKGGGEEGGGKGEEGGK",
    ".KGGKKKKCFFFFFSFFFKGPPGGGGGGGGGPPK",
    ".KGGK..KCCFSFFFFFFKGPPGKGGKGGKGPPK",
    "..KK...KCCCFFFFFFFFKGGGKKKKKKKGGK.",
    ".......KKCCCCCCCCCCCKGGGGGGGGGGK..",
    "......KGGKKKKKKKKKKKKKKKKKKKKKK...",
    "......KGGK.KGGK......KGGK.KGGK....",
    "......KKK...KKK.......KKK..KKK....",
  ]),
  createSprite([
    "..................................",
    ".........KKKKKKKKKKKKKKKKK........",
    "........KCCCCCCCCCCCCCCCCCK.......",
    ".......KCCCFFFFFFFFFFFFFCCCK......",
    ".......KCCFFFFFFSFFSFFFFFCCK......",
    ".......KCFFSFFFFFFFFFFFFFFCK......",
    ".......KCFFFFFFFFFFKKFFSFFCK.KK...",
    ".......KCFFFFFFFFFKGGKFFFFCKKGGK..",
    ".......KCFFFFFFSFFKGGGKFFFCKGGGK..",
    ".KKKK..KCFFFFFFFFFKGGGGKKKKGGGGK..",
    "KGGGKKKKCFFFSFFFFFKGGGGGGGGGGGGK..",
    "KKGGGGKKCFFFFFFFSKGGGGGGGGGGGGGGK.",
    "..KKKKGKCFSFFFFFFKGGGWEGGGGGWEGGK.",
    ".....KKKCFFFFFFFFKGGGEEGGGKGEEGGK.",
    ".......KCFFFFFSFFKGPPGGGGGGGGGPPK.",
    ".......KCCFSFFFFFKGPPGKGGKGGKGPPK.",
    "......KKCCCFFFFFFFKGGGKKKKKKKGGK..",
    ".....KKKKCCCCCCCCCCKGGGGGGGGGGK...",
    "....KGGGKKKKKKKKKKKKKKKKKKKKKK....",
    "....KGGK.KGGK......KGGK.KGGK......",
    "....KKK...KKK.......KKK..KKK......",
  ]),
  createSprite([
    "..................................",
    ".........KKKKKKKKKKKKKKKKK........",
    "........KCCCCCCCCCCCCCCCCCK.......",
    ".......KCCCFFFFFFFFFFFFFCCCK......",
    ".......KCCFFFFFFSFFSFFFFFCCK......",
    ".......KCFFSFFFFFFFKKFFFFFCK.KK...",
    ".......KCFFFFFFFFFKGGKFSFFCKKGGK..",
    ".......KCFFFFFFFFFKGGGKFFFCKGGGK..",
    "..KK...KCFFFFFFSFFKGGGGKKKKGGGGK..",
    ".KGGK..KCFFFFFFFFFKGGGGGGGGGGGGK..",
    ".KGGKKKKCFFFSFFFFKGGGGGGGGGGGGGGK.",
    "..KGGGGKCFFFFFFFSKGGGWEGGGGGWEGGK.",
    "...KKGGKCFSFFFFFFKGGGEEGGGKGEEGGK.",
    ".....KKKCFFFFFFFFKGPPGGGGGGGGGPPK.",
    ".......KCFFFFFSFFKGPPGKGGKGGKGPPK.",
    ".......KCCFSFFFFFFKGGGKKKKKKKGGK..",
    "......KKCCCFFFFFFFFKGGGGGGGGGGK...",
    ".....KGKKCCCCCCCCCCCKKKKKKKKKK....",
    "....KGGGKKKKKKKKKKKKKKKKKKGK......",
    "....KGGK.KGGK......KGGK.KGGK......",
    "....KKK..KKK.......KKK...KKK......",
  ]),
] as const;

const MINI_FRAMES = [
  createSprite([
    "....KKKKKKKKK......",
    "...KCCCCCCCCCK.....",
    "...KCFFSFFKFCK..K..",
    "KK.KCFFFFKGKCK.KGK.",
    "KGKKCFSFFKGGKKKGGK.",
    ".KGKCFFFFKGEGGGEGK.",
    "...KCFFSFKPGGKGGPK.",
    "...KCCCCCCKGGGGGK..",
    "....KKKKKKKKKKKK...",
    "..KGK.KGK..KGK.KGK.",
    "...................",
  ]),
  createSprite([
    "....KKKKKKKKK......",
    "...KCCCCCCCCCK.....",
    "...KCFFSFFFKCK...K.",
    "...KCFFFFFKGKK..KGK",
    "KKKKCFSFFFKGGKKKGGK",
    "KGGKCFFFFSKGEGGGEGK",
    "KKKKCFFSFFKPGGKGGPK",
    "...KCCCCCCCKGGGGGK.",
    "....KKKKKKKKKKKKK..",
    ".KGK.KGK..KGK.KGK..",
    "...................",
  ]),
  createSprite([
    "...................",
    "....KKKKKKKKK......",
    "...KCCCCCCCCCK.....",
    "...KCFFSFFFKCK...K.",
    "...KCFFFFFKGKK..KGK",
    ".KGKCFSFFFKGGKKKGGK",
    "KGKKCFFFFSKGEGGGEGK",
    "KK.KCFFSFFKPGGKGGPK",
    "...KCCCCCCCKGGGGGK.",
    "....KKKKKKKKKKKKK..",
    ".KGK.KGK..KGK.KGK..",
  ]),
  createSprite([
    "...................",
    "....KKKKKKKKK......",
    "...KCCCCCCCCCK.....",
    "...KCFFSFFFKCK...K.",
    "...KCFFFFFKGKK..KGK",
    "KKKKCFSFFFKGGKKKGGK",
    "KGGKCFFFFSKGEGGGEGK",
    "KKKKCFFSFFKPGGKGGPK",
    "...KCCCCCCCKGGGGGK.",
    "....KKKKKKKKKKKKK..",
    "..KGK.KGK..KGK.KGK.",
  ]),
  createSprite([
    "...................",
    "....KKKKKKKKK......",
    "...KCCCCCCCCCK.....",
    "...KCFFSFFKFCK..K..",
    "KK.KCFFFFKGKCK.KGK.",
    "KGKKCFSFFKGGKKKGGK.",
    ".KGKCFFFFKGEGGGEGK.",
    "...KCFFSFKPGGKGGPK.",
    "...KCCCCCCKGGGGGK..",
    "....KKKKKKKKKKKK...",
    "..KGK.KGK..KGK.KGK.",
  ]),
  createSprite([
    "...................",
    "....KKKKKKKKK......",
    "...KCCCCCCCCCK.....",
    "...KCFFSFFKFCK..K..",
    "...KCFFFFKGKCK.KGK.",
    "KKKKCFSFFKGGKKKGGK.",
    "KGGKCFFFFKGEGGGEGK.",
    "KKKKCFFSFKPGGKGGPK.",
    "...KCCCCCCKGGGGGK..",
    "....KKKKKKKKKKKK...",
    ".KGK.KGK..KGK.KGK..",
  ]),
] as const;

const STAR_FRAMES: readonly (readonly [x: number, y: number][])[] = [
  [[0, 0]],
  [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ],
  [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [0, 2],
    [0, -2],
    [2, 0],
    [-2, 0],
  ],
  [
    [0, 2],
    [0, -2],
    [2, 0],
    [-2, 0],
    [0, 3],
    [0, -3],
    [3, 0],
    [-3, 0],
  ],
  [
    [0, 3],
    [0, -3],
    [3, 0],
    [-3, 0],
    [2, 2],
    [2, -2],
    [-2, 2],
    [-2, -2],
  ],
  [
    [0, 3],
    [0, -3],
    [3, 0],
    [-3, 0],
  ],
  [],
];

const TABBY_HEAD_STRIPES: readonly [x: number, y: number][] = [
  [3, -2],
  [3, -1],
  [6, -2],
  [6, -1],
  [-3, 1],
  [10, 1],
];

export const nyanCatIds = ["original", "black", "tabby"] as const;

export type NyanCatId = (typeof nyanCatIds)[number];

export const nyanParams = {
  ...furParams,
  cat: z.enum(nyanCatIds).default("original"),
  speed: z.number().min(0.25).max(4).default(1),
  background: colorSchema.default("#000000"),
};

export type NyanParams = FurParams & { cat: NyanCatId };

function getTabbyFrame(sprite: Sprite): Sprite {
  const rows = sprite.rows.map((row) => row.split(""));
  const eyeY = rows.findIndex((row) => row.includes("W"));
  const eyeX = rows[eyeY]?.indexOf("W") ?? 0;
  for (const [dx, dy] of TABBY_HEAD_STRIPES) {
    const row = rows[eyeY + dy];
    if (row?.[eyeX + dx] === "G") {
      row[eyeX + dx] = "T";
    }
  }
  for (const [y, row] of rows.entries()) {
    for (let x = 0; x < NYAN_TART_LEFT; x++) {
      if (row[x] === "G" && y % 2 === 1) {
        row[x] = "T";
      }
    }
  }
  return createSprite(rows.map((row) => row.join("")));
}

const TABBY_FRAMES = ORIGINAL_FRAMES.map(getTabbyFrame);

function getMiniTabbyFrame(sprite: Sprite): Sprite {
  return createSprite(
    sprite.rows.map((row, y) =>
      row
        .split("")
        .map((pixel, x) => (pixel === "G" && x < 3 && y % 2 === 0 ? "T" : pixel))
        .join(""),
    ),
  );
}

const MINI_TABBY_FRAMES = MINI_FRAMES.map(getMiniTabbyFrame);

export function getNyanFrame(beat: number, speed = 1): number {
  return Math.floor(beat * NYAN_FRAMES_PER_BEAT * speed + 1e-6);
}

export function getNyanSprite(cat: NyanCatId, frame: number): Sprite {
  const frames = cat === "tabby" ? TABBY_FRAMES : ORIGINAL_FRAMES;
  const index = ((frame % frames.length) + frames.length) % frames.length;
  return frames[index] ?? ORIGINAL_FRAMES[0];
}

export function scaleColor([r, g, b]: Color, amount: number): Color {
  return [r * amount, g * amount, b * amount];
}

export function mixColor([ar, ag, ab]: Color, [br, bg, bb]: Color, amount: number): Color {
  return [ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount];
}

export function getNyanPalette(params: NyanParams, cat: NyanCatId = params.cat): Palette {
  const base: Record<string, Color> = {
    K: BLACK,
    C: parseColor("#ffcc99"),
    F: parseColor("#ff99ff"),
    S: parseColor("#ff3399"),
    G: parseColor("#999999"),
    W: WHITE,
    P: parseColor("#ff9999"),
    E: BLACK,
  };
  if (cat === "black") {
    return { ...base, G: parseColor(params.color), E: parseColor(params.eyeColor) };
  }
  if (cat === "tabby") {
    return {
      ...base,
      G: parseColor(params.tabbyColor),
      T: parseColor(params.tabbyStripeColor),
      E: parseColor(params.tabbyEyeColor),
    };
  }
  return base;
}

export function getShadedPalette(palette: Palette, amount: number, tint = BLACK): Palette {
  return Object.fromEntries(
    Object.entries(palette).map(([key, color]) => [key, mixColor(tint, color, amount)]),
  );
}

export function getSolidPalette(palette: Palette, color: Color, outline: Color = BLACK): Palette {
  return Object.fromEntries(
    Object.keys(palette).map((key) => [key, key === "K" ? outline : color]),
  );
}

export function drawScaledSprite(
  image: RgbaImage,
  sprite: Sprite,
  x: number,
  y: number,
  palette: Palette,
  scale = 1,
  flipX = false,
): void {
  const left = Math.round(x);
  const top = Math.round(y);
  for (const [row, line] of sprite.rows.entries()) {
    for (let column = 0; column < line.length; column++) {
      const color = palette[line[column] ?? "."];
      if (!color) {
        continue;
      }
      const sx = flipX ? sprite.width - 1 - column : column;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          setRgbaPixel(image, left + sx * scale + dx, top + row * scale + dy, color);
        }
      }
    }
  }
}

export type RainbowOptions = {
  scale?: number;
  colors?: readonly Color[];
  amount?: number;
  length?: number;
};

export type RainbowTrailOptions = {
  colors?: readonly Color[];
  amount?: number;
  length?: number;
  segment?: number;
  bandHeight?: number;
  amplitude?: number;
  getTop?: (x: number) => number;
};

export function getRainbowShape(frame: number): { shift: number; flip: boolean } {
  const phase = ((frame % 4) + 4) % 4;
  return { shift: phase % 2, flip: phase >= 2 };
}

export function drawRainbowTrail(
  image: RgbaImage,
  end: number,
  top: number,
  frame: number,
  {
    colors = RAINBOW_COLORS,
    amount = 1,
    length = Infinity,
    segment = 8,
    bandHeight = 3,
    amplitude = 1,
    getTop,
  }: RainbowTrailOptions = {},
): void {
  const right = Math.round(end);
  const { flip } = getRainbowShape(frame);
  const start = Math.max(0, Math.round(right - length));
  const bandColors = colors.map((color) => scaleColor(color, amount));
  for (let x = start; x < Math.min(WIDTH, right); x++) {
    const fromEnd = Math.floor((right - 1 - x) / segment);
    const isHigh = (fromEnd % 2 === 1) !== flip;
    const rowTop = Math.round(getTop ? getTop(x) : top) + (isHigh ? 0 : amplitude);
    for (const [band, color] of bandColors.entries()) {
      for (let row = 0; row < bandHeight; row++) {
        setRgbaPixel(image, x, rowTop + band * bandHeight + row, color);
      }
    }
  }
}

export function drawRainbow(
  image: RgbaImage,
  x: number,
  y: number,
  frame: number,
  { scale = 1, colors, amount, length }: RainbowOptions = {},
): void {
  const { shift } = getRainbowShape(frame);
  drawRainbowTrail(image, Math.round(x) + (14 - shift) * scale, y, frame, {
    colors,
    amount,
    length: length === undefined ? undefined : length * scale,
    segment: 8 * scale,
    bandHeight: 3 * scale,
    amplitude: scale,
  });
}

export function getMiniSprite(cat: NyanCatId, frame: number): Sprite {
  const frames = cat === "tabby" ? MINI_TABBY_FRAMES : MINI_FRAMES;
  const index = ((frame % frames.length) + frames.length) % frames.length;
  return frames[index] ?? MINI_FRAMES[0];
}

export function drawMiniRainbow(
  image: RgbaImage,
  x: number,
  y: number,
  frame: number,
  options: Omit<RainbowTrailOptions, "segment" | "bandHeight" | "amplitude"> = {},
): void {
  const { shift } = getRainbowShape(frame);
  drawRainbowTrail(image, Math.round(x) + 7 - shift, Math.round(y) + 1, frame, {
    ...options,
    length: options.length,
    segment: 4,
    bandHeight: 1,
    amplitude: 1,
  });
}

export function drawMiniNyan(
  image: RgbaImage,
  params: NyanParams,
  x: number,
  y: number,
  frame: number,
  {
    cat = params.cat,
    palette,
    flipX = false,
  }: { cat?: NyanCatId; palette?: Palette; flipX?: boolean } = {},
): void {
  drawScaledSprite(
    image,
    getMiniSprite(cat, frame),
    x,
    y,
    palette ?? getNyanPalette(params, cat),
    1,
    flipX,
  );
}

export function drawNyan(
  image: RgbaImage,
  params: NyanParams,
  x: number,
  y: number,
  frame: number,
  {
    scale = 1,
    cat = params.cat,
    palette,
  }: { scale?: number; cat?: NyanCatId; palette?: Palette } = {},
): void {
  drawScaledSprite(
    image,
    getNyanSprite(cat, frame),
    x,
    y,
    palette ?? getNyanPalette(params, cat),
    scale,
  );
}

export function drawStar(
  image: RgbaImage,
  x: number,
  y: number,
  starFrame: number,
  color: Color = WHITE,
  scale = 1,
): void {
  const points =
    STAR_FRAMES[((starFrame % STAR_FRAMES.length) + STAR_FRAMES.length) % STAR_FRAMES.length] ?? [];
  for (const [dx, dy] of points) {
    for (let sy = 0; sy < scale; sy++) {
      for (let sx = 0; sx < scale; sx++) {
        setRgbaPixel(
          image,
          Math.round(x) + dx * scale + sx,
          Math.round(y) + dy * scale + sy,
          color,
        );
      }
    }
  }
}

export type StarFieldOptions = {
  count?: number;
  seed?: number;
  scale?: number;
  color?: Color;
  top?: number;
  bottom?: number;
  direction?: 1 | -1;
};

const STAR_PASS_FRAMES = [16, 24, 48] as const;

export function drawStars(
  image: RgbaImage,
  frame: number,
  {
    count = 12,
    seed = 0x57a2,
    scale = 1,
    color = WHITE,
    top = 0,
    bottom = HEIGHT,
    direction = -1,
  }: StarFieldOptions = {},
): void {
  const margin = 4 * scale;
  const span = WIDTH + margin * 2;
  for (let star = 0; star < count; star++) {
    const random = createRandom(hashSeed(seed, star));
    const passFrames = STAR_PASS_FRAMES[Math.floor(random() * STAR_PASS_FRAMES.length)] ?? 24;
    const offset = Math.floor(random() * passFrames);
    const twinkle = Math.floor(random() * STAR_FRAMES.length);
    const local = frame + offset;
    const pass = Math.floor(local / passFrames);
    const step = local - pass * passFrames;
    const passRandom = createRandom(hashSeed(seed, star, pass));
    const travel = (step / passFrames) * span;
    const x = direction < 0 ? WIDTH + margin - travel : -margin + travel;
    const y = getRandomBetween(passRandom, top, bottom);
    drawStar(image, x, y, step + twinkle, color, scale);
  }
}

export function fillBackground(image: RgbaImage, color: Color): void {
  for (let offset = 0; offset < image.length; offset += 4) {
    image[offset] = color[0];
    image[offset + 1] = color[1];
    image[offset + 2] = color[2];
    image[offset + 3] = 255;
  }
}

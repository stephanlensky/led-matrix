import { z } from "zod";
import { parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import { fonts, drawText, measureText } from "../../fonts/index.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../../frame.ts";
import { type Sprite, drawSprite } from "../../sprite.ts";
import {
  ANGRY_PALETTE,
  CLOUD,
  CREEPER,
  DIAMOND_BLOCK,
  DIRT_BLOCK,
  DOGE,
  DOGE_PALETTE,
  EMOJI_PALETTE,
  EMOJI_SPRITES,
  FLAPPY_BIRD,
  FLAPPY_PALETTE,
  GRASS_BLOCK,
  GREEN_PIG,
  LEAF_BLOCK,
  LOG_BLOCK,
  MINECRAFT_PALETTE,
  PIG,
  RED_BIRD,
  SLINGSHOT,
  STONE_BLOCK,
  SUN,
} from "./nostalgia-sprites.ts";
import {
  drawNyan,
  drawRainbowTrail,
  drawStars,
  fillBackground,
  getNyanFrame,
  getRainbowShape,
  nyanParams,
} from "./shared.ts";

export const SCENE_WIDTH = 192;
const SCROLL_PER_FRAME = 2;
const CAT_X = 10;
const DEFAULT_Y = 21;
const BLOCK = 4;
const PIPE_WIDTH = 10;
const PIPE_GAP_ABOVE = 4;
const PIPE_GAP_BELOW = 24;
const FLAPPY_GROUND = 58;
const FLAPPY_PIPES = [
  { x: 64, y: 12 },
  { x: 128, y: 31 },
] as const;
const CAT_SPAN = 33;
const TERRAIN = [
  3, 3, 3, 4, 4, 4, 4, 3, 3, 2, 2, 2, 3, 3, 3, 3, 4, 5, 5, 4, 4, 3, 3, 3, 2, 2, 2, 2, 3, 3, 4, 4, 4,
  4, 3, 3, 3, 3, 3, 2, 2, 3, 3, 3, 3, 3, 3, 3,
] as const;
const DIAMONDS = new Set([11, 26, 40]);
const EMOJIS = [
  { x: 8, y: 6, sprite: 0 },
  { x: 30, y: 48, sprite: 1 },
  { x: 52, y: 2, sprite: 6 },
  { x: 70, y: 52, sprite: 2 },
  { x: 92, y: 9, sprite: 3 },
  { x: 112, y: 46, sprite: 4 },
  { x: 134, y: 4, sprite: 5 },
  { x: 152, y: 50, sprite: 7 },
  { x: 172, y: 8, sprite: 6 },
] as const;
const DOGE_WORDS = [
  { text: "wow", x: 4, y: 4 },
  { text: "such nyan", x: 16, y: 54 },
  { text: "very rainbow", x: 56, y: 3 },
  { text: "much fly", x: 100, y: 54 },
  { text: "so pop tart", x: 128, y: 6 },
  { text: "amaze", x: 168, y: 54 },
] as const;
const DOGE_COLORS: readonly Color[] = [
  parseColor("#ff40ff"),
  parseColor("#40ffff"),
  parseColor("#ffff40"),
  parseColor("#60ff40"),
  parseColor("#ff4040"),
  parseColor("#4080ff"),
];

export const nostalgiaSceneIds = ["minecraft", "flappy", "emoji", "doge", "angry"] as const;

type NostalgiaSceneId = (typeof nostalgiaSceneIds)[number];

type SceneInput = { image: RgbaImage; left: number; frame: number; beat: number; scroll: number };

function drawAt(
  input: SceneInput,
  sprite: Sprite,
  x: number,
  y: number,
  palette: Parameters<typeof drawSprite>[4],
): void {
  const screenX = input.left + x;
  if (screenX + sprite.width < 0 || screenX >= WIDTH) {
    return;
  }
  drawSprite(input.image, sprite, screenX, y, palette);
}

function fillRect(
  image: RgbaImage,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Color,
): void {
  for (let row = Math.max(0, y); row < Math.min(HEIGHT, y + height); row++) {
    for (let column = Math.max(0, x); column < Math.min(WIDTH, x + width); column++) {
      const offset = (row * WIDTH + column) * 4;
      image[offset] = color[0];
      image[offset + 1] = color[1];
      image[offset + 2] = color[2];
      image[offset + 3] = 255;
    }
  }
}

function drawMinecraft(input: SceneInput): void {
  drawAt(input, SUN, 150, 4, MINECRAFT_PALETTE);
  drawAt(input, CLOUD, 20, 3, MINECRAFT_PALETTE);
  drawAt(input, CLOUD, 104, 8, MINECRAFT_PALETTE);
  for (const [index, height] of TERRAIN.entries()) {
    const x = index * BLOCK;
    for (let level = 0; level < height; level++) {
      const y = HEIGHT - (level + 1) * BLOCK;
      const block =
        level === height - 1
          ? GRASS_BLOCK
          : level === 0 && DIAMONDS.has(index)
            ? DIAMOND_BLOCK
            : level < height - 2
              ? STONE_BLOCK
              : DIRT_BLOCK;
      drawAt(input, block, x, y, MINECRAFT_PALETTE);
    }
  }
  const treeIndex = 18;
  const groundY = HEIGHT - (TERRAIN[treeIndex] ?? 3) * BLOCK;
  for (let level = 1; level <= 3; level++) {
    drawAt(input, LOG_BLOCK, treeIndex * BLOCK, groundY - level * BLOCK, MINECRAFT_PALETTE);
  }
  for (let row = 0; row < 2; row++) {
    for (let column = -1 - (1 - row); column <= 1 + (1 - row); column++) {
      drawAt(
        input,
        LEAF_BLOCK,
        (treeIndex + column) * BLOCK,
        groundY - (5 - row) * BLOCK,
        MINECRAFT_PALETTE,
      );
    }
  }
  const creeperIndex = 31;
  drawAt(
    input,
    CREEPER,
    creeperIndex * BLOCK,
    HEIGHT - (TERRAIN[creeperIndex] ?? 3) * BLOCK - CREEPER.height,
    MINECRAFT_PALETTE,
  );
  const pigIndex = 42;
  const walk = Math.floor(input.frame / 3) % 2;
  drawAt(
    input,
    PIG,
    pigIndex * BLOCK + walk,
    HEIGHT - (TERRAIN[pigIndex] ?? 3) * BLOCK - PIG.height,
    MINECRAFT_PALETTE,
  );
}

function drawPipe(input: SceneInput, x: number, gapTop: number): void {
  const columns = ["K", "L", "L", "G", "G", "G", "G", "d", "d", "K"];
  const capColumns = ["K", "L", "L", "L", "G", "G", "G", "G", "G", "d", "d", "K"];
  const screenX = input.left + x;
  const top = gapTop - PIPE_GAP_ABOVE;
  const bottom = gapTop + PIPE_GAP_BELOW;
  for (const [column, key] of columns.entries()) {
    const color = FLAPPY_PALETTE[key] ?? [0, 0, 0];
    fillRect(input.image, screenX + column, 0, 1, top - 4, color);
    fillRect(input.image, screenX + column, bottom + 4, 1, FLAPPY_GROUND - bottom - 4, color);
  }
  for (const [column, key] of capColumns.entries()) {
    const color = FLAPPY_PALETTE[key] ?? [0, 0, 0];
    fillRect(input.image, screenX - 1 + column, top - 4, 1, 4, color);
    fillRect(input.image, screenX - 1 + column, bottom, 1, 4, color);
  }
  const outline = FLAPPY_PALETTE["K"] ?? [0, 0, 0];
  fillRect(input.image, screenX - 1, top - 1, 12, 1, outline);
  fillRect(input.image, screenX - 1, top - 4, 12, 1, outline);
  fillRect(input.image, screenX - 1, bottom, 12, 1, outline);
  fillRect(input.image, screenX - 1, bottom + 3, 12, 1, outline);
}

function drawFlappy(input: SceneInput): void {
  for (const pipe of FLAPPY_PIPES) {
    drawPipe(input, pipe.x, pipe.y);
  }
  const stripe = FLAPPY_PALETTE["G"] ?? [0, 0, 0];
  const light = FLAPPY_PALETTE["L"] ?? [0, 0, 0];
  const sand = FLAPPY_PALETTE["T"] ?? [0, 0, 0];
  fillRect(
    input.image,
    input.left,
    FLAPPY_GROUND,
    SCENE_WIDTH,
    1,
    FLAPPY_PALETTE["K"] ?? [0, 0, 0],
  );
  for (let x = 0; x < SCENE_WIDTH; x++) {
    const screenX = input.left + x;
    for (let row = 1; row < 4; row++) {
      fillRect(input.image, screenX, FLAPPY_GROUND + row, 1, 1, (x + row) % 6 < 3 ? light : stripe);
    }
    fillRect(input.image, screenX, FLAPPY_GROUND + 4, 1, HEIGHT - FLAPPY_GROUND - 4, sand);
  }
}

function drawEmoji(input: SceneInput): void {
  for (const [index, emoji] of EMOJIS.entries()) {
    const bob = Math.round(Math.sin((input.beat + index * 0.37) * Math.PI));
    drawAt(input, EMOJI_SPRITES[emoji.sprite], emoji.x, emoji.y + bob, EMOJI_PALETTE);
  }
}

function drawDoge(input: SceneInput): void {
  const font = fonts["spleen-5x8"];
  const hop = Math.round(Math.abs(Math.sin(input.beat * Math.PI)) * -1);
  drawAt(input, DOGE, 74, 46 + hop, DOGE_PALETTE);
  drawAt(input, DOGE, 148, 44 - hop, DOGE_PALETTE);
  for (const [index, word] of DOGE_WORDS.entries()) {
    const color = DOGE_COLORS[(index + Math.floor(input.beat)) % DOGE_COLORS.length] ?? [
      255, 255, 255,
    ];
    const x = input.left + word.x;
    if (x + measureText(font, word.text) < 0 || x >= WIDTH) {
      continue;
    }
    drawText(input.image, font, word.text, x, word.y, color);
  }
}

function drawAngry(input: SceneInput): void {
  const grass = parseColor("#5cb82c");
  const dirt = parseColor("#7a5230");
  fillRect(input.image, input.left, 58, SCENE_WIDTH, 2, grass);
  fillRect(input.image, input.left, 60, SCENE_WIDTH, 4, dirt);
  drawAt(input, SLINGSHOT, 24, 49, ANGRY_PALETTE);
  const plank = ANGRY_PALETTE["B"] ?? [0, 0, 0];
  const edge = ANGRY_PALETTE["b"] ?? [0, 0, 0];
  for (const [x, y, width, height] of [
    [140, 42, 3, 16],
    [156, 42, 3, 16],
    [138, 39, 23, 3],
    [146, 26, 3, 13],
  ] as const) {
    fillRect(input.image, input.left + x, y, width, height, edge);
    fillRect(input.image, input.left + x + 1, y + 1, width - 2, height - 2, plank);
  }
  drawAt(input, GREEN_PIG, 144, 30, ANGRY_PALETTE);
  drawAt(input, GREEN_PIG, 166, 49, ANGRY_PALETTE);
  const flight = (((input.beat % 4) + 4) % 4) / 4;
  const birdX = 28 + flight * 110;
  const birdY = 44 - Math.sin(flight * Math.PI) * 36;
  drawAt(input, RED_BIRD, Math.round(birdX), Math.round(birdY), ANGRY_PALETTE);
}

const SCENES: Readonly<Record<NostalgiaSceneId, (input: SceneInput) => void>> = {
  minecraft: drawMinecraft,
  flappy: drawFlappy,
  emoji: drawEmoji,
  doge: drawDoge,
  angry: drawAngry,
};

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function getFlappyY(local: number): number {
  const holds = FLAPPY_PIPES.map((pipe) => ({
    start: pipe.x - CAT_SPAN,
    end: pipe.x + PIPE_WIDTH + 1,
    y: pipe.y,
  }));
  let previous = { end: -Infinity, y: DEFAULT_Y };
  for (const hold of [...holds, { start: SCENE_WIDTH + 24, end: Infinity, y: DEFAULT_Y }]) {
    if (local < hold.start) {
      const from = Math.max(previous.end, hold.start - 40);
      return previous.y + (hold.y - previous.y) * smoothstep((local - from) / (hold.start - from));
    }
    if (local <= hold.end) {
      return hold.y;
    }
    previous = hold;
  }
  return DEFAULT_Y;
}

function getSceneId(scene: NostalgiaSceneId | "tour", tile: number): NostalgiaSceneId {
  if (scene !== "tour") {
    return scene;
  }
  const count = nostalgiaSceneIds.length;
  return nostalgiaSceneIds[((tile % count) + count) % count] ?? "minecraft";
}

function getPathY(scene: NostalgiaSceneId | "tour", world: number): number {
  const tile = Math.floor(world / SCENE_WIDTH);
  const local = world - tile * SCENE_WIDTH;
  const id = getSceneId(scene, tile);
  const nextIsFlappy = getSceneId(scene, tile + 1) === "flappy";
  if (id === "flappy") {
    return Math.round(getFlappyY(local));
  }
  if (nextIsFlappy && local > SCENE_WIDTH - 40) {
    return Math.round(getFlappyY(local - SCENE_WIDTH));
  }
  return DEFAULT_Y;
}

export const nyanNostalgia = defineEffect({
  id: "nyan-nostalgia",
  name: "Nyan nostalgia",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...nyanParams,
    scene: z.enum([...nostalgiaSceneIds, "tour"]).default("tour"),
    stars: z.number().int().min(0).max(40).default(6),
  }),
  render(image, { params, beat }) {
    fillBackground(image, parseColor(params.background));
    const frame = getNyanFrame(beat, params.speed);
    const scroll = frame * SCROLL_PER_FRAME;
    drawStars(image, frame, { count: params.stars, bottom: 40 });
    const firstTile = Math.floor(scroll / SCENE_WIDTH);
    for (let tile = firstTile; tile * SCENE_WIDTH - scroll < WIDTH; tile++) {
      SCENES[getSceneId(params.scene, tile)]({
        image,
        left: tile * SCENE_WIDTH - scroll,
        frame,
        beat,
        scroll,
      });
    }
    const catY = getPathY(params.scene, scroll + CAT_X);
    const { shift } = getRainbowShape(frame);
    const end = CAT_X + 14 - shift;
    drawRainbowTrail(image, end, catY, frame, {
      getTop: (x) => getPathY(params.scene, scroll + x - 14),
    });
    if (getSceneId(params.scene, Math.floor((scroll + CAT_X + 40) / SCENE_WIDTH)) === "flappy") {
      const birdWorld = scroll + CAT_X + 44;
      drawSprite(
        image,
        FLAPPY_BIRD[Math.floor(frame / 2) % 2] ?? FLAPPY_BIRD[0],
        CAT_X + 44,
        getPathY(params.scene, birdWorld) + 6,
        FLAPPY_PALETTE,
      );
    }
    drawNyan(image, params, CAT_X, catY, frame);
  },
});

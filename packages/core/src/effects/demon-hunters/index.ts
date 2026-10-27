import { z } from "zod";
import { defineEffect } from "../../effect.ts";
import { type Color, type RgbaImage, HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { hashSeed } from "../../random.ts";
import { type Palette, drawSprite, getAnimationFrame } from "../../sprite.ts";
import { LEVEL_TOP, TILE_SIZE, hunters, level } from "./scene.ts";
import {
  EXPLOSION_TICKS,
  type GameState,
  type HunterState,
  getDemonBox,
  simulate,
} from "./simulation.ts";
import {
  WATER_COLOR,
  batFrames,
  bruteFrames,
  bulletSprite,
  digitSprites,
  explosionFrames,
  explosionPalette,
  gunSprites,
  hairStyles,
  hunterBallFrames,
  hunterRunFrames,
  impFrames,
  medalSprite,
  muzzleFlash,
  tilePalette,
  tileSprites,
  towerSprite,
} from "./sprites.ts";

const SKY_TOP: Color = [4, 2, 18];
const SKY_BOTTOM: Color = [28, 8, 52];
const HORIZON = 48;
const STAR_SEED = 0xdea0;
const STAR_COUNT = 22;
const SKYLINE_SEED = 0xdea1;
const SKYLINE_PARALLAX = 0.5;
const SKYLINE_WIDTH = 96;
const BUILDING_WIDTH = 6;
const BUILDING_COLOR: Color = [46, 22, 86];
const WINDOW_COLOR: Color = [150, 105, 40];
const HILL_COLOR: Color = [38, 16, 72];
const TOWER_X = 40;
const MOON_X = 53;
const MOON_Y = 13;
const MOON_RADIUS = 4.5;
const MOON_COLOR: Color = [255, 240, 210];
const MOON_SHADE: Color = [200, 180, 170];
const HUD_TEXT: Color = [255, 255, 255];
const HUD_RIBBON: Color = [235, 235, 245];
const HUD_SPACING = 21;
const HUNTER_HEIGHT = 12;
const RUN_TICKS = 4;
const WHITE: Color = [255, 255, 255];

const demonPalette: Palette = {
  r: [200, 30, 110],
  d: [110, 10, 60],
  e: [255, 230, 40],
  k: [240, 220, 200],
  m: [255, 255, 255],
  w: [90, 30, 150],
};

const demonFrames = { imp: impFrames, bat: batFrames, brute: bruteFrames };

const towerPalette: Palette = {
  t: [255, 50, 70],
  T: [120, 85, 180],
  l: [210, 180, 255],
};

function getMix(from: Color, to: Color, amount: number): Color {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

function getScaledColor([r, g, b]: Color, scale: number): Color {
  return [r * scale, g * scale, b * scale];
}

function drawSky(image: RgbaImage, beat: number): void {
  for (let y = 0; y < HEIGHT; y++) {
    const color = getMix(SKY_TOP, SKY_BOTTOM, Math.min(1, y / HORIZON));
    for (let x = 0; x < WIDTH; x++) {
      setRgbaPixel(image, x, y, color);
    }
  }
  for (let index = 0; index < STAR_COUNT; index++) {
    const x = hashSeed(STAR_SEED, index, 0) % WIDTH;
    const y = 8 + (hashSeed(STAR_SEED, index, 1) % 32);
    const twinkle = (hashSeed(STAR_SEED, index, Math.floor(beat)) % 4) / 3;
    setRgbaPixel(image, x, y, getScaledColor([200, 200, 255], 0.3 + 0.5 * twinkle));
  }
  for (let y = -5; y <= 5; y++) {
    for (let x = -5; x <= 5; x++) {
      const distance = Math.hypot(x, y);
      if (distance > MOON_RADIUS) {
        continue;
      }
      const isShade = Math.hypot(x + 1.5, y - 1) < 1.3 || Math.hypot(x - 1.5, y + 2) < 1;
      setRgbaPixel(image, MOON_X + x, MOON_Y + y, isShade ? MOON_SHADE : MOON_COLOR);
    }
  }
}

function drawSkyline(image: RgbaImage, scroll: number, beat: number): void {
  const offset = Math.round(scroll * SKYLINE_PARALLAX);
  for (let x = 0; x < WIDTH; x++) {
    const column = (((x + offset) % SKYLINE_WIDTH) + SKYLINE_WIDTH) % SKYLINE_WIDTH;
    const hill = Math.round(HORIZON - 14 + ((column - TOWER_X - 2) / 14) ** 2 * 14);
    for (let y = Math.max(hill, HORIZON - 14); y < HEIGHT; y++) {
      setRgbaPixel(image, x, y, HILL_COLOR);
    }
  }
  const towerColumn = (((TOWER_X - offset) % SKYLINE_WIDTH) + SKYLINE_WIDTH) % SKYLINE_WIDTH;
  const isBlinking = Math.floor(beat) % 2 === 0;
  for (const left of [towerColumn, towerColumn - SKYLINE_WIDTH]) {
    drawSprite(image, towerSprite, left, HORIZON - 14 - towerSprite.height + 1, {
      ...towerPalette,
      t: isBlinking ? (towerPalette.t ?? WHITE) : (towerPalette.T ?? WHITE),
    });
  }
  for (let x = 0; x < WIDTH; x++) {
    const column = (((x + offset) % SKYLINE_WIDTH) + SKYLINE_WIDTH) % SKYLINE_WIDTH;
    const building = Math.floor(column / BUILDING_WIDTH);
    const within = column % BUILDING_WIDTH;
    if (within === 0) {
      continue;
    }
    const height = 5 + (hashSeed(SKYLINE_SEED, building) % 14);
    const top = HORIZON - height;
    for (let y = top; y < HEIGHT; y++) {
      const isWindow =
        within % 2 === 1 &&
        (y - top) % 3 === 1 &&
        hashSeed(SKYLINE_SEED, building, within, y) % 3 === 0;
      setRgbaPixel(image, x, y, isWindow ? WINDOW_COLOR : BUILDING_COLOR);
    }
  }
}

function drawLevel(image: RgbaImage, state: GameState): void {
  const scroll = Math.round(state.scroll);
  const firstColumn = Math.floor(scroll / TILE_SIZE);
  const columns = level[0]?.length ?? 1;
  for (let column = firstColumn; column <= firstColumn + WIDTH / TILE_SIZE; column++) {
    const wrapped = ((column % columns) + columns) % columns;
    const left = column * TILE_SIZE - scroll;
    for (const [row, line] of level.entries()) {
      const tile = line[wrapped] ?? ".";
      const top = LEVEL_TOP + row * TILE_SIZE;
      const variants = tileSprites[tile];
      if (!variants) {
        continue;
      }
      if (tile === "~") {
        for (let y = 0; y < TILE_SIZE; y++) {
          for (let x = 0; x < TILE_SIZE; x++) {
            setRgbaPixel(image, left + x, top + y, WATER_COLOR);
          }
        }
        if (level[row - 1]?.[wrapped] === "~") {
          continue;
        }
      }
      const variant =
        tile === "~"
          ? Math.floor(state.tick / 8) + wrapped
          : hashSeed(wrapped, row) % variants.length;
      const sprite = variants[variant % variants.length];
      if (sprite) {
        drawSprite(image, sprite, left, top, tilePalette);
      }
    }
  }
}

function drawHunter(image: RgbaImage, state: HunterState, tick: number, scroll: number): void {
  if (state.hurtTicks > 0 && Math.floor(state.hurtTicks / 2) % 2 === 1) {
    return;
  }
  const left = Math.round(state.x - scroll);
  const top = Math.round(state.y) - HUNTER_HEIGHT;
  const { palette, hair } = state.hunter;
  if (!state.isGrounded) {
    const ball = getAnimationFrame(hunterBallFrames, state.airTicks, 1 / RUN_TICKS);
    drawSprite(image, ball, left + 1, top + 3, palette);
    return;
  }
  const runFrame = Math.floor(tick / RUN_TICKS) % hunterRunFrames.length;
  const body = hunterRunFrames[runFrame];
  if (body) {
    drawSprite(image, body, left, top + (runFrame === 1 ? 0 : 1), palette);
  }
  const style = hairStyles[hair];
  const hairSprite = style.frames[runFrame % style.frames.length];
  if (hairSprite) {
    drawSprite(image, hairSprite, left + style.offsetX, top + (runFrame === 1 ? 0 : 1), palette);
  }
  const gun = gunSprites[state.aim];
  drawSprite(image, gun.sprite, left + gun.x, top + gun.y + (runFrame === 1 ? 0 : 1), palette);
  if (state.flashTicks > 0) {
    drawSprite(
      image,
      muzzleFlash,
      left + gun.x + gun.sprite.width - 1,
      top + gun.y + (state.aim === "up" ? -2 : state.aim === "down" ? 2 : -1),
      explosionPalette,
    );
  }
}

function drawEntities(image: RgbaImage, state: GameState): void {
  const scroll = state.scroll;
  for (const demon of state.demons) {
    const box = getDemonBox(demon);
    const sprite = getAnimationFrame(demonFrames[demon.type], demon.age, 1 / 8);
    drawSprite(image, sprite, box.left - scroll, box.top, demonPalette, {
      tint: demon.hitTicks > 0 ? WHITE : undefined,
    });
  }
  for (const hunter of state.hunters) {
    drawHunter(image, hunter, state.tick, scroll);
  }
  for (const bullet of state.bullets) {
    drawSprite(image, bulletSprite, bullet.x - scroll - 1, bullet.y - 1, {
      c: bullet.hunter.palette.c ?? WHITE,
      W: WHITE,
    });
  }
  for (const explosion of state.explosions) {
    if (explosion.age < 0) {
      continue;
    }
    const frame = Math.floor((explosion.age / EXPLOSION_TICKS) * explosionFrames.length);
    const sprite = explosionFrames[frame];
    if (sprite) {
      drawSprite(image, sprite, explosion.x - scroll - 3, explosion.y - 3, explosionPalette);
    }
  }
}

function drawHud(image: RgbaImage): void {
  for (const [index, hunter] of hunters.entries()) {
    const left = 1 + index * HUD_SPACING;
    const digit = digitSprites[String(index + 1)];
    const player = digitSprites.P;
    if (digit && player) {
      drawSprite(image, digit, left, 1, { "#": HUD_TEXT });
      drawSprite(image, player, left + digit.width + 1, 1, { "#": HUD_TEXT });
    }
    for (let medal = 0; medal < 3; medal++) {
      drawSprite(image, medalSprite, left + 7 + medal * 4, 1, {
        c: HUD_RIBBON,
        m: hunter.palette.h ?? WHITE,
        M: hunter.palette.H ?? WHITE,
      });
    }
  }
}

export const demonHunters = defineEffect({
  id: "demon-hunters",
  name: "Demon hunters",
  kind: "pixel",
  params: z.object({
    hud: z.boolean().default(true),
  }),
  render(image, { params, beat }) {
    const state = simulate(beat);
    drawSky(image, beat);
    drawSkyline(image, state.scroll, beat);
    drawLevel(image, state);
    drawEntities(image, state);
    if (params.hud) {
      drawHud(image);
    }
  },
});

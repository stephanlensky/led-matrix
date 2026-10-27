import { z } from "zod";
import { defineEffect } from "../../effect.ts";
import { type Color, type RgbaImage, WIDTH, setRgbaPixel } from "../../frame.ts";
import { hashSeed } from "../../random.ts";
import { type Palette, drawSprite, getAnimationFrame } from "../../sprite.ts";
import { compositeRaster, createRaster, getRotation } from "../../mesh.ts";
import { getSolidCoat, getTabbyCoat, drawCat } from "../cat-model.ts";
import { type Hunter, LEVEL_TOP, TILE_SIZE, cats, hunters, level } from "./scene.ts";
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
} from "./sprites.ts";

const HUD_TEXT: Color = [255, 255, 255];
const HUD_RIBBON: Color = [235, 235, 245];
const HUD_SPACING = 21;
const HUNTER_HEIGHT = 12;
const RUN_TICKS = 4;
const WHITE: Color = [255, 255, 255];
const CAT_SIZE = 4;
const CAT_FEET = 1.14;
const CAT_YAW = Math.PI / 2 - 0.45;
const CAT_FLIP_TICKS = 12;
const tabbyCoat = getTabbyCoat([140, 142, 148], [42, 43, 48], [208, 208, 212], [240, 176, 32]);
const blackCoat = getSolidCoat([75, 29, 122], [48, 232, 48]);

const demonPalette: Palette = {
  r: [200, 30, 110],
  d: [110, 10, 60],
  e: [255, 230, 40],
  k: [240, 220, 200],
  m: [255, 255, 255],
  w: [90, 30, 150],
};

const demonFrames = { imp: impFrames, bat: batFrames, brute: bruteFrames };

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
  if (isBlinking(state)) {
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
  drawGun(image, state, left, top + (runFrame === 1 ? 0 : 1));
}

function drawDemons(image: RgbaImage, state: GameState): void {
  for (const demon of state.demons) {
    const box = getDemonBox(demon);
    const sprite = getAnimationFrame(demonFrames[demon.type], demon.age, 1 / 8);
    drawSprite(image, sprite, box.left - state.scroll, box.top, demonPalette, {
      tint: demon.hitTicks > 0 ? WHITE : undefined,
    });
  }
}

function isBlinking(state: HunterState): boolean {
  return state.hurtTicks > 0 && Math.floor(state.hurtTicks / 2) % 2 === 1;
}

function drawCats(image: RgbaImage, state: GameState): void {
  const raster = createRaster();
  for (const [index, player] of state.hunters.entries()) {
    if (isBlinking(player)) {
      continue;
    }
    const stride = Math.sin((state.tick / (RUN_TICKS * 2)) * Math.PI) * 0.7;
    const flip = player.isGrounded ? 0 : (player.airTicks / CAT_FLIP_TICKS) * Math.PI * 2;
    const tuck = player.isGrounded ? 0 : 1.1;
    const bob = player.isGrounded ? Math.abs(stride) * 0.6 : 0;
    drawCat(
      raster,
      {
        x: player.x - state.scroll + 4,
        y: player.y - CAT_FEET * CAT_SIZE - bob - (player.isGrounded ? 0 : 1.5),
        size: CAT_SIZE,
        rotate: getRotation(0.2, CAT_YAW, -flip),
        pose: {
          frontLeftLeg: getRotation(stride - tuck, 0, 0),
          frontRightLeg: getRotation(-stride - tuck, 0, 0),
          backLeftLeg: getRotation(-stride + tuck, 0, 0),
          backRightLeg: getRotation(stride + tuck, 0, 0),
          tail: getRotation(-0.9 + stride * 0.3, 0, 0),
        },
      },
      index === 0 ? tabbyCoat : blackCoat,
    );
  }
  compositeRaster(raster, image);
  for (const player of state.hunters) {
    if (isBlinking(player) || !player.isGrounded) {
      continue;
    }
    drawGun(
      image,
      player,
      Math.round(player.x - state.scroll),
      Math.round(player.y) - HUNTER_HEIGHT + 2,
    );
  }
}

function drawGun(image: RgbaImage, state: HunterState, left: number, top: number): void {
  const gun = gunSprites[state.aim];
  const { palette } = state.hunter;
  drawSprite(image, gun.sprite, left + gun.x, top + gun.y, palette);
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

function drawProjectiles(image: RgbaImage, state: GameState): void {
  const scroll = state.scroll;
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

function drawHud(image: RgbaImage, players: readonly Hunter[]): void {
  for (const [index, hunter] of players.entries()) {
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
    players: z.enum(["hunters", "cats"]).default("hunters"),
  }),
  render(image, { params, beat }) {
    const players = params.players === "cats" ? cats : hunters;
    const state = simulate(beat, players);
    drawLevel(image, state);
    drawDemons(image, state);
    if (params.players === "cats") {
      drawCats(image, state);
    } else {
      for (const hunter of state.hunters) {
        drawHunter(image, hunter, state.tick, state.scroll);
      }
    }
    drawProjectiles(image, state);
    if (params.hud) {
      drawHud(image, players);
    }
  },
});

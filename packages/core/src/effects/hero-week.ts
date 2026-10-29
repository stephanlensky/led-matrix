import { z } from "zod";
import { colorSchema, getBackgroundColor, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import {
  type Color,
  HEIGHT,
  type RgbaImage,
  WIDTH,
  createRgbaImage,
  fillRgbaImage,
} from "../frame.ts";
import { drawText, fonts, measureText } from "../fonts/index.ts";
import { easings } from "../keyframes.ts";
import { type Vector, compositeRaster, createRaster, getRotation } from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { type Palette, createSprite, drawSprite } from "../sprite.ts";
import { TAU, clamp, furParams, getSpan, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import { drawEyes } from "./cat-face.ts";
import { mix, scale } from "./cat-model.ts";
import {
  type Character,
  DARK_PHONE,
  LIGHT_PHONE,
  type PhoneCat,
  SCREEN_OFF,
  drawExclamation,
  drawPhoneCharacter,
  drawVibration,
  getLockScreen,
} from "./cat-phone.ts";
import { getOvershoot } from "./cat-wands.ts";
import { getCharacterHead } from "./character-heads.ts";
import { type HeroId, type HeroPlacement, drawHero, heroIds } from "./frieren-model.ts";
import { HERO_EYE_COLORS, getHeroEyes } from "./hero-love.ts";
import { drawDeskHero, getDeskPlacement } from "./hero-desk.ts";
import { blendPixel, drawHeart } from "./heart.ts";
import { drawFloatingHearts, drawSparkles } from "./heart-particles.ts";
import { getBeatKick } from "./heart-pulse.ts";
import { drawSleepingHero, getSleepingHead } from "./himmel-sleep.ts";
import { drawThought, getThoughtTiming } from "./thought-bubble.ts";

const SCENE_BEATS = 8;
const WEEK_BEATS = SCENE_BEATS * 8;
const DRAW = [-1.5, -0.5] as const;
const OPEN = [-0.5, 0.5] as const;
const ERASE = [0.5, 1] as const;
const WHITE: Color = [255, 255, 255];
const YELLOW: Color = [255, 220, 60];
const ICE: Color = [150, 210, 255];
const GREY: Color = [96, 96, 112];
const RED: Color = [255, 60, 60];
const CHAT_BLUE: Color = [40, 130, 255];
const CHAT_GREY: Color = [70, 70, 84];
const SKY: Color = [120, 190, 255];
const defaultFur = z.object(furParams).parse({});

const partners: Readonly<Record<HeroId, HeroId>> = { frieren: "himmel", himmel: "frieren" };

type Scene = {
  beat: number;
  story: number;
  kick: number;
  heart: Color;
  waiter: HeroId;
  slow: HeroId;
};

function getCharacter(hero: HeroId): Character {
  return { type: "hero", hero };
}

type Transition =
  | { type: "scissor"; angle: number }
  | { type: "slit"; angle: number }
  | { type: "shatter" };

const transitions: readonly Transition[] = [
  { type: "scissor", angle: -45 },
  { type: "slit", angle: 45 },
  { type: "scissor", angle: 0 },
  { type: "slit", angle: -45 },
  { type: "scissor", angle: 45 },
  { type: "scissor", angle: 90 },
  { type: "shatter" },
];

function drawDay(image: RgbaImage, day: string, x: number, color: Color, kick: number): void {
  const font = fonts["spleen-5x8"];
  const width = measureText(font, day);
  drawText(image, font, day, x, 1, WHITE);
  const flash = mix(color, WHITE, 0.6 * kick);
  for (let column = -1; column <= width; column++) {
    blendPixel(image, x + column, 10, flash);
    blendPixel(image, x + column, 11, flash, kick);
  }
}

const noteSprite = createSprite(["..##", "..#.", "..#.", "###.", "##.."]);

function drawNotes(
  image: RgbaImage,
  beat: number,
  [x, y]: readonly [number, number],
  color: Color,
): void {
  for (let index = Math.floor(beat) - 1; index <= Math.floor(beat); index++) {
    const age = beat - index;
    if (age < 0 || age >= 1.6) {
      continue;
    }
    const side = index % 2 === 0 ? 1 : -1;
    const left = Math.round(x + side * (2 + 3 * age) + Math.sin(age * 5) * 1.5);
    const top = Math.round(y - 4 - 10 * easings.easeOutQuad(age / 1.6));
    const fade = clamp((1.6 - age) * 2);
    drawSprite(image, noteSprite, left, top, { "#": scale(color, fade) });
  }
}

function getHeroCharacter(
  character: Character,
  x: number,
  y: number,
  pose: Partial<PhoneCat>,
): PhoneCat {
  return {
    character,
    side: 1,
    x,
    y,
    size: 19,
    head: { pitch: 10 },
    hold: { pitch: -35, roll: 5 },
    free: { pitch: -20, roll: 40 },
    tail: 0,
    phone: {
      offset: [0, 0],
      rotate: { pitch: -10, yaw: -5 },
      color: DARK_PHONE,
      screen: () => SCREEN_OFF,
    },
    eyes: "open",
    ...pose,
  };
}

function drawDreaming(image: RgbaImage, { beat, story, kick, heart, waiter, slow }: Scene): void {
  const inhale = 0.5 - 0.5 * Math.cos(getCycle(beat / 4) * TAU);
  const placement = {
    x: WIDTH / 2 + 8,
    y: HEIGHT / 2 + 2,
    size: 15,
    rotate: getRotation(toRadians(38), toRadians(-35), 0),
  };
  drawSparkles(image, beat, [mix(heart, WHITE, 0.5), WHITE], 0.7, { count: 8, bottom: 40 });
  const raster = createRaster();
  drawSleepingHero(raster, waiter, placement, inhale);
  compositeRaster(raster, image);
  const [headX, headY] = getSleepingHead(placement);
  const head = getCharacterHead(slow, defaultFur);
  const timing = getThoughtTiming(story, [1, 99]);
  const thought = {
    x: 2,
    y: 12,
    head,
    anchor: [headX - 3, headY - 3] as const,
    timing: { ...timing, scale: timing.scale * (1 + 0.1 * kick) },
    bob: kick > 0.4 ? 1 : 0,
  };
  drawThought(image, thought);
  if (timing.scale > 0.5) {
    drawFloatingHearts(image, beat, [14, 22], [heart, mix(heart, WHITE, 0.5)], 12, {
      rise: 14,
      sizes: [4, 6],
    });
  }
  drawSnore(image, beat, [headX + 3, headY - 4]);
  drawDay(image, "MON", 44, heart, kick);
}

function drawSnore(image: RgbaImage, beat: number, [x, y]: readonly [number, number]): void {
  const font = fonts["spleen-5x8"];
  for (let index = Math.floor(beat) - 1; index <= Math.floor(beat); index++) {
    const age = (beat - index) / 2;
    if (age < 0 || age >= 1) {
      continue;
    }
    const fade = Math.sin(age * Math.PI);
    drawText(
      image,
      font,
      index % 2 === 0 ? "Z" : "z",
      Math.round(x + age * 10 + Math.sin(age * TAU) * 2),
      Math.round(y - age * 12),
      scale(SKY, fade),
    );
  }
}

function drawPing(
  image: RgbaImage,
  [x, y]: readonly [number, number],
  phase: number,
  color: Color,
): void {
  const radius = 3 + 12 * easings.easeOutCubic(phase);
  const fade = 1 - phase;
  for (let step = 0; step < 40; step++) {
    const angle = (step / 40) * TAU;
    blendPixel(
      image,
      Math.round(x + Math.cos(angle) * radius),
      Math.round(y + Math.sin(angle) * radius * 0.8),
      color,
      fade,
    );
  }
}

function drawWaiting(image: RgbaImage, { beat, story, kick, heart, waiter }: Scene): void {
  const check = Math.sin(Math.PI * getCycle(beat)) ** 2;
  const raster = createRaster();
  const points = drawPhoneCharacter(
    raster,
    getHeroCharacter(getCharacter(waiter), 34, 44 - 1.5 * kick, {
      side: -1,
      squash: 0.05 * kick,
      head: { pitch: 22 + 10 * check, yaw: -10, roll: 6 * Math.sin(beat * Math.PI) },
      hold: { pitch: -8 - 6 * check, roll: 5 },
      free: { pitch: -20, roll: 40 },
      phone: {
        offset: [0, 0],
        rotate: { pitch: 20 - 15 * check, yaw: -5 },
        color: LIGHT_PHONE,
        screen: getLockScreen(SKY, 0.4 + 0.6 * check),
      },
    }),
  );
  const bar = getCycle(story / 4) * 4;
  drawPing(image, [points.phone[0], points.phone[1]], getCycle(beat), mix(SKY, WHITE, 0.3));
  compositeRaster(raster, image);
  if (bar >= 3 && bar < 3.5) {
    drawVibration(image, points.phone, 16, Math.floor(bar * 8) % 2 === 0 ? 1 : 0.4);
  }
  const pop = bar < 3.8 ? getSpan(bar, 2, 2.4) : 0;
  if (pop > 0) {
    drawQuestion(image, [points.top[0] + 8, points.top[1] - 2], pop);
  }
  drawDay(image, "TUE", 3, heart, kick);
}

const questionMark = createSprite([".###.", "#...#", "...#.", "..#..", "..#..", ".....", "..#.."]);

function drawQuestion(image: RgbaImage, [x, y]: readonly [number, number], pop: number): void {
  const rise = 3 * (1 - getOvershoot(clamp(pop * 2)));
  drawSprite(image, questionMark, x - 2, y - 7 + rise, { "#": YELLOW });
}

function fillRoundRect(
  image: RgbaImage,
  [left, top, width, height]: readonly [number, number, number, number],
  color: Color,
  amount = 1,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isCorner = (x === 0 || x === width - 1) && (y === 0 || y === height - 1);
      if (!isCorner) {
        blendPixel(image, Math.round(left) + x, Math.round(top) + y, color, amount);
      }
    }
  }
}

function drawChatBubble(
  image: RgbaImage,
  text: string,
  [right, top]: readonly [number, number],
  color: Color,
  pop: number,
): void {
  if (pop <= 0) {
    return;
  }
  const font = fonts["spleen-5x8"];
  const width = measureText(font, text) + 4;
  const grow = getOvershoot(clamp(pop));
  const shown = Math.max(3, Math.round(width * grow));
  fillRoundRect(image, [right - shown, top, shown, 10], color);
  if (grow > 0.8) {
    drawText(image, font, text, right - width + 2, top + 1, WHITE);
  }
}

function drawUnread(image: RgbaImage, { beat, story, kick, heart, slow }: Scene): void {
  const frame: Color = mix(LIGHT_PHONE, WHITE, 0.3);
  const [left, top, width, height] = [4, 3, 40, 64];
  for (let y = top; y < height; y++) {
    for (const x of [left, left + 1, left + width - 2, left + width - 1]) {
      blendPixel(image, x, y, frame);
    }
  }
  for (let x = left + 1; x < left + width - 1; x++) {
    blendPixel(image, x, top, frame);
    blendPixel(image, x, top + 1, frame);
  }
  const head = getCharacterHead(slow, defaultFur);
  const bob = kick > 0.4 ? 1 : 0;
  drawSprite(image, head.sprite, left + width / 2 - 7, top + 3 - bob, head.palette);
  for (let x = left + 2; x < left + width - 2; x++) {
    blendPixel(image, x, top + 17, GREY);
  }
  const right = left + width - 4;
  const glow = mix(CHAT_BLUE, WHITE, 0.25 * kick);
  drawChatBubble(image, "HEY", [right, 23], glow, 1);
  drawChatBubble(image, "HI?", [right, 35], glow, getSpan(story, 1, 1.4));
  drawChatBubble(image, "??", [right, 47], glow, getSpan(story, 6.5, 6.9));
  const typing = getSpan(story, 3, 3.3) * (1 - getSpan(story, 5.4, 5.6));
  if (typing > 0) {
    const grow = getOvershoot(typing);
    const bubbleWidth = Math.round(17 * grow);
    fillRoundRect(image, [left + 4, 47, bubbleWidth, 9], CHAT_GREY);
    if (grow > 0.8) {
      for (let dot = 0; dot < 3; dot++) {
        const lift = getCycle(beat * 2 - dot / 3) < 0.35 ? 1 : 0;
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const) {
          blendPixel(
            image,
            left + 6 + dot * 5 + dx,
            49 - lift + dy,
            lift ? WHITE : mix(GREY, WHITE, 0.4),
          );
        }
      }
    }
  }
  const gone = getSpan(story, 5.6, 6.2);
  if (gone > 0) {
    for (const [index, [dx, dy]] of (
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const
    ).entries()) {
      const reach = 3 + 6 * easings.easeOutCubic(gone);
      blendPixel(
        image,
        left + 12 + dx * reach,
        51 + dy * reach * 0.7,
        index % 2 ? WHITE : GREY,
        1 - gone,
      );
    }
  }
  drawDay(image, "WED", 48, heart, kick);
}

function drawClock(
  image: RgbaImage,
  [x, y]: readonly [number, number],
  size: number,
  beat: number,
  kick: number,
): void {
  const radius = size + kick;
  for (let step = 0; step < 48; step++) {
    const angle = (step / 48) * TAU;
    blendPixel(
      image,
      Math.round(x + Math.cos(angle) * radius),
      Math.round(y + Math.sin(angle) * radius),
      WHITE,
    );
  }
  for (let hour = 0; hour < 12; hour += 3) {
    const angle = (hour / 12) * TAU;
    blendPixel(
      image,
      Math.round(x + Math.cos(angle) * (radius - 2)),
      Math.round(y + Math.sin(angle) * (radius - 2)),
      GREY,
    );
  }
  const tick = Math.floor(beat) + getOvershoot(clamp(getCycle(beat) * 5));
  const hands: [number, number, Color][] = [
    [tick / 48, size - 4, WHITE],
    [tick / 12, size - 2, mix(YELLOW, WHITE, kick)],
  ];
  for (const [turns, length, color] of hands) {
    const angle = turns * TAU - Math.PI / 2;
    for (let step = 0; step <= length; step++) {
      blendPixel(
        image,
        Math.round(x + Math.cos(angle) * step),
        Math.round(y + Math.sin(angle) * step),
        color,
      );
    }
  }
}

function drawBored(image: RgbaImage, { beat, story, kick, heart, waiter }: Scene): void {
  const breath = 0.5 - 0.5 * Math.cos(getCycle(story / 4) * TAU);
  const placement = getDeskPlacement(
    waiter,
    {
      x: WIDTH / 2 + 6,
      y: HEIGHT / 2 + 8,
      size: 16,
      rotate: getRotation(toRadians(25), toRadians(-45), 0),
    },
    breath,
    kick,
  );
  const raster = createRaster();
  drawDeskHero(raster, waiter, placement);
  compositeRaster(raster, image);
  drawClock(image, [13, 15], 10, beat, kick);
  const font = fonts["spleen-5x8"];
  const sigh = getCycle(story / 4);
  if (sigh < 0.4) {
    const fade = Math.sin((Math.PI * sigh) / 0.4);
    drawText(image, font, "...", 36 + 8 * sigh, 18 - 8 * sigh, scale(WHITE, fade));
  }
  drawDay(image, "WED", 47, heart, kick);
}

function drawHeartMeter(
  image: RgbaImage,
  [x, y]: readonly [number, number],
  size: number,
  level: number,
  heart: Color,
): void {
  const empty = createRgbaImage();
  drawHeart(empty, { x, y, size, color: scale(GREY, 0.6), outline: GREY });
  const full = createRgbaImage();
  drawHeart(full, { x, y, size, color: heart, outline: mix(heart, WHITE, 0.5) });
  const surface = y + size * 0.5 - size * 1.05 * level;
  for (let py = 0; py < HEIGHT; py++) {
    const source = py >= surface ? full : empty;
    for (let px = 0; px < WIDTH; px++) {
      const offset = (py * WIDTH + px) * 4;
      const alpha = (source[offset + 3] ?? 0) / 255;
      if (alpha > 0) {
        blendPixel(
          image,
          px,
          py,
          [source[offset] ?? 0, source[offset + 1] ?? 0, source[offset + 2] ?? 0],
          alpha,
        );
      }
    }
  }
}

function drawFading(image: RgbaImage, { story, kick, heart, waiter }: Scene): void {
  const away = easings.easeInOutCubic(getSpan(story, 1, 3));
  const raster = createRaster();
  drawPhoneCharacter(
    raster,
    getHeroCharacter(getCharacter(waiter), 42, 44 - kick, {
      side: -1,
      turn: toRadians(-50) * away,
      head: { pitch: 22 - 26 * away, yaw: -30 * away, roll: 0 },
      hold: { pitch: -8, roll: 5 },
      free: { pitch: -20, roll: 40 },
      phone: {
        offset: [0, 0],
        rotate: { pitch: -10 + 50 * away, yaw: -5 },
        color: LIGHT_PHONE,
        screen: getLockScreen(SKY, 1 - away),
      },
    }),
  );
  compositeRaster(raster, image);
  const level = 1 - clamp(Math.floor(story / 1.5) / 4);
  const drip = story < 7.5 ? Math.exp(-getCycle(story / 1.5) * 6) : 0;
  drawHeartMeter(
    image,
    [15, 34 + drip],
    20 * (1 + 0.12 * kick * level),
    level,
    mix(heart, GREY, 1 - level),
  );
  if (level === 0 && kick > 0.3) {
    drawText(image, fonts["spleen-5x8"], "LOW", 8, 48, RED);
  }
  drawDay(image, "THU", 3, heart, kick);
}

const SNOW_SEED = 0x5170;

function drawSnow(image: RgbaImage, beat: number, count: number, gust: number): void {
  for (let flake = 0; flake < count; flake++) {
    const random = createRandom(hashSeed(SNOW_SEED, flake));
    const x = getRandomBetween(random, 0, WIDTH);
    const speed = getRandomBetween(random, 6, 12);
    const y = (getRandomBetween(random, 0, HEIGHT) + beat * speed) % (HEIGHT + 4);
    const sway = Math.sin(beat * 2 + flake) * 2 + gust * (8 + (flake % 5) * 2);
    blendPixel(
      image,
      Math.round(x + sway),
      Math.round(y),
      flake % 3 === 0 ? WHITE : ICE,
      flake % 3 === 0 ? 1 : 0.7,
    );
  }
}

function drawCold(image: RgbaImage, { beat, kick, slow }: Scene): void {
  const gust =
    easings.easeOutCubic(clamp(getCycle(beat / 4) * 4)) * Math.exp(-getCycle(beat / 4) * 6);
  drawSnow(image, beat, 26, gust);
  const shiver = Math.sin(beat * 70) * (0.3 + 1.2 * kick);
  const raster = createRaster();
  const points = drawPhoneCharacter(
    raster,
    getHeroCharacter(getCharacter(slow), 28 + shiver, 46, {
      side: 1,
      head: { pitch: 20, yaw: 6, roll: 3 * Math.sin(beat * 40) },
      hold: { pitch: -45, roll: 5 },
      free: { pitch: -50, roll: 75 },
      phone: {
        offset: [0, 0],
        rotate: { pitch: -15, yaw: -5 },
        color: DARK_PHONE,
        screen: getLockScreen(ICE, 0.7),
      },
    }),
  );
  compositeRaster(raster, image);
  for (let x = 0; x < WIDTH; x++) {
    blendPixel(image, x, HEIGHT - 2 + (x % 7 === 0 ? -1 : 0), WHITE, 0.9);
    blendPixel(image, x, HEIGHT - 1, ICE, 0.8);
  }
  const puff = getCycle(beat);
  if (puff < 0.6) {
    const [mouthX, mouthY] = [points.top[0] + 5, points.top[1] + 12];
    const fade = 1 - puff / 0.6;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, -1],
      [2, -1],
      [1, -1],
    ] as const) {
      blendPixel(
        image,
        Math.round(mouthX + dx + puff * 8),
        Math.round(mouthY + dy - puff * 4),
        WHITE,
        fade * 0.8,
      );
    }
  }
  drawDay(image, "FRI", 46, ICE, kick);
}

type CalendarPage = { day: string; color: Color };

function drawCalendarPage(
  image: RgbaImage,
  { day, color }: CalendarPage,
  [x, y]: readonly [number, number],
  angle: number,
  amount: number,
): void {
  const [width, height] = [28, 26];
  const [sin, cos] = [Math.sin(angle), Math.cos(angle)];
  const page = createRgbaImage();
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      blendPixel(page, px, py, py < 7 ? color : WHITE);
    }
  }
  const font = fonts["spleen-8x16"];
  drawText(page, font, day, (width - measureText(font, day)) / 2, 8, scale(color, 0.85));
  const reach = Math.ceil(Math.hypot(width, height));
  for (let py = Math.floor(y - reach); py <= y + reach; py++) {
    for (let px = Math.floor(x - reach); px <= x + reach; px++) {
      const [dx, dy] = [px + 0.5 - x, py + 0.5 - y];
      const u = Math.floor(dx * cos + dy * sin + width / 2);
      const v = Math.floor(-dx * sin + dy * cos);
      if (u < 0 || v < 0 || u >= width || v >= height) {
        continue;
      }
      const offset = (v * WIDTH + u) * 4;
      blendPixel(
        image,
        px,
        py,
        [page[offset] ?? 0, page[offset + 1] ?? 0, page[offset + 2] ?? 0],
        amount,
      );
    }
  }
}

const calendarPages: readonly CalendarPage[] = [
  { day: "SAT", color: SKY },
  { day: "SUN", color: [255, 140, 60] },
  { day: "MON", color: RED },
];

function drawMissed(image: RgbaImage, { story, kick, slow }: Scene): void {
  const tears = [2, 5];
  const [pinX, pinY] = [44, 12];
  for (let index = calendarPages.length - 1; index >= 0; index--) {
    const page = calendarPages[index];
    const tear = tears[index];
    if (!page) {
      continue;
    }
    const fall = tear === undefined ? 0 : getSpan(story, tear, tear + 0.9);
    if (fall >= 1) {
      continue;
    }
    drawCalendarPage(
      image,
      page,
      [pinX - 18 * fall, pinY + 50 * easings.easeInQuad(fall) - (fall === 0 && kick > 0.4 ? 1 : 0)],
      -1.6 * easings.easeOutQuad(fall),
      1,
    );
  }
  for (const x of [pinX - 8, pinX + 8]) {
    blendPixel(image, x, pinY - 1, GREY);
    blendPixel(image, x, pinY - 2, WHITE);
  }
  const notice = easings.easeOutCubic(getSpan(story, 5.2, 5.6));
  const raster = createRaster();
  const points = drawPhoneCharacter(
    raster,
    getHeroCharacter(getCharacter(slow), 14, 46 - kick, {
      side: 1,
      size: 17,
      head: { pitch: 16 - 20 * notice, yaw: 10 + 10 * notice, roll: 0 },
      hold: { pitch: -35, roll: 5 },
      free: { pitch: -20 - 30 * notice, roll: 40 },
      phone: {
        offset: [0, 0],
        rotate: { pitch: -10, yaw: -5 },
        color: DARK_PHONE,
        screen: getLockScreen(SKY, 0.6),
      },
    }),
  );
  compositeRaster(raster, image);
  if (story >= 5.2) {
    drawExclamation(
      image,
      [points.top[0] + 4, points.top[1] - 1 - 2 * kick, 0],
      (story - 5.2) * 3,
      1,
    );
  }
}

const snail = createSprite([".SS..", "SsSS.", "SSsS.", ".SS.ee", "BBBBBB"]);

function getWalkPose(phase: number, stride: number, reach: number): HeroPlacement["pose"] {
  const swing = Math.sin(phase * TAU);
  const lift = (side: number) => Math.max(0, Math.sin(phase * TAU + (side > 0 ? 0 : Math.PI)));
  return {
    torso: getRotation(toRadians(6 * stride), 0, 0),
    head: getRotation(toRadians(-4), 0, toRadians(3 * swing)),
    hair: getRotation(toRadians(-10 * stride), 0, toRadians(4 * swing)),
    cape: getRotation(toRadians(-25 * stride), 0, 0),
    leftLeg: getRotation(toRadians(-28 * stride * swing), 0, 0),
    rightLeg: getRotation(toRadians(28 * stride * swing), 0, 0),
    leftShin: getRotation(toRadians(40 * stride * lift(-1)), 0, 0),
    rightShin: getRotation(toRadians(40 * stride * lift(1)), 0, 0),
    leftArm: getRotation(toRadians(30 * stride * swing - 70 * reach), 0, toRadians(-8)),
    rightArm: getRotation(toRadians(-30 * stride * swing), 0, toRadians(8)),
  };
}

function drawLeaving(image: RgbaImage, { beat, story, heart, waiter, slow }: Scene): void {
  const raster = createRaster();
  const walkerX = 32 + 50 * easings.easeInQuad(getSpan(story, 0.5, 7.5));
  const walker: HeroPlacement = {
    x: walkerX,
    y: 37 - 1.5 * Math.abs(Math.sin(getCycle(beat) * TAU)),
    size: 14,
    rotate: getRotation(VIEW_PITCH, toRadians(55), 0),
    eyes: "hidden",
    pose: getWalkPose(beat, 1, 0),
  };
  const followerX = -4 + 22 * easings.easeOutQuad(getSpan(story, -0.5, 8));
  const follower: HeroPlacement = {
    x: followerX,
    y: 41,
    size: 11,
    rotate: getRotation(VIEW_PITCH, toRadians(60), 0),
    eyes: "open",
    pose: getWalkPose(beat / 4, 0.4, clamp(story / 4)),
  };
  drawHero(raster, waiter, walker);
  drawHero(raster, slow, follower);
  compositeRaster(raster, image);
  drawEyes(
    image,
    {
      eyes: getHeroEyes(waiter, walker),
      isFacing: true,
      isVisible: [true, true],
      top: [0, 0, 0],
    },
    "happy",
    HERO_EYE_COLORS[waiter],
    heart,
    1,
    2.5,
  );
  const snailX = followerX + 8 + 1.2 * story;
  const palette: Palette = {
    S: [200, 140, 60],
    s: [120, 80, 40],
    e: [140, 220, 120],
    B: [140, 220, 120],
  };
  drawSprite(image, snail, snailX, 53, palette);
  for (let x = 0; x < WIDTH; x++) {
    blendPixel(image, x, 58, GREY, 0.8);
  }
  if (walkerX < WIDTH + 4) {
    drawNotes(image, beat, [walkerX + 4, 22], SKY);
  }
}

const sceneBackgrounds: readonly string[] = [
  "#140c2c",
  "#0a1430",
  "#0c0c24",
  "#1c1206",
  "#121218",
  "#04182a",
  "#2a0a0a",
  "#08201a",
];

const sceneDrawings: readonly ((image: RgbaImage, scene: Scene) => void)[] = [
  drawDreaming,
  drawWaiting,
  drawUnread,
  drawBored,
  drawFading,
  drawCold,
  drawMissed,
  drawLeaving,
];

type Week = { story: number; beat: number; heart: Color; waiter: HeroId; background: boolean };

function drawScene(
  image: RgbaImage,
  index: number,
  { story, beat, heart, waiter, background }: Week,
): void {
  const draw = sceneDrawings[index];
  if (!draw) {
    return;
  }
  const { kick } = getBeatKick(beat, 1);
  const color = getBackgroundColor({ background, color: sceneBackgrounds[index] ?? "#000000" });
  fillRgbaImage(image, scale(color, 1 + 0.5 * kick));
  draw(image, {
    beat,
    story: story - index * SCENE_BEATS,
    kick,
    heart,
    waiter,
    slow: partners[waiter],
  });
}

function getAxes(angle: number): { along: Vector; across: Vector; reach: number; depth: number } {
  const radians = toRadians(angle);
  const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
  return {
    along: [cos, sin, 0],
    across: [-sin, cos, 0],
    reach: (WIDTH / 2) * (Math.abs(cos) + Math.abs(sin)) + 2,
    depth: (WIDTH / 2) * (Math.abs(sin) + Math.abs(cos)) + 2,
  };
}

function getPixel(image: RgbaImage, x: number, y: number): Color | undefined {
  const [px, py] = [Math.round(x), Math.round(y)];
  if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) {
    return undefined;
  }
  const offset = (py * WIDTH + px) * 4;
  return [image[offset] ?? 0, image[offset + 1] ?? 0, image[offset + 2] ?? 0];
}

function getClampedPixel(image: RgbaImage, x: number, y: number): Color | undefined {
  return getPixel(image, Math.min(WIDTH - 1, Math.max(0, x)), Math.min(HEIGHT - 1, Math.max(0, y)));
}

function setPixel(image: RgbaImage, x: number, y: number, color: Color | undefined): void {
  const offset = (y * WIDTH + x) * 4;
  const [r, g, b] = color ?? [0, 0, 0];
  image[offset] = r;
  image[offset + 1] = g;
  image[offset + 2] = b;
  image[offset + 3] = color ? 255 : 0;
}

function drawLine(image: RgbaImage, angle: number, offset: number, from: number, to: number): void {
  const { along, across } = getAxes(angle);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const [dx, dy] = [x + 0.5 - WIDTH / 2, y + 0.5 - HEIGHT / 2];
      const position = dx * along[0] + dy * along[1];
      const distance = dx * across[0] + dy * across[1] - offset;
      if (distance >= -1 && distance < 1 && position >= from && position <= to) {
        blendPixel(image, x, y, WHITE);
      }
    }
  }
}

function drawScissor(
  image: RgbaImage,
  previous: RgbaImage,
  next: RgbaImage,
  angle: number,
  open: number,
): void {
  const { along, across, reach } = getAxes(angle);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const [dx, dy] = [x + 0.5 - WIDTH / 2, y + 0.5 - HEIGHT / 2];
      const position = dx * along[0] + dy * along[1];
      const side = dx * across[0] + dy * across[1] < 0 ? -1 : 1;
      const shift = side * 2 * reach * (1 - open);
      const isNext = side > 0 ? position - shift > -reach : position - shift < reach;
      setPixel(
        image,
        x,
        y,
        isNext
          ? getClampedPixel(next, x - along[0] * shift, y - along[1] * shift)
          : getPixel(previous, x, y),
      );
    }
  }
}

function drawSlit(
  image: RgbaImage,
  previous: RgbaImage,
  next: RgbaImage,
  angle: number,
  open: number,
): number {
  const { across, depth } = getAxes(angle);
  const gap = depth * open;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const [dx, dy] = [x + 0.5 - WIDTH / 2, y + 0.5 - HEIGHT / 2];
      const distance = Math.abs(dx * across[0] + dy * across[1]);
      setPixel(image, x, y, getPixel(distance < gap ? next : previous, x, y));
    }
  }
  return gap;
}

const SHATTER_PIECES = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

function getPiece(x: number, y: number): number {
  const [dx, dy] = [x - WIDTH / 2, y - HEIGHT / 2];
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy < 0 ? 0 : 2;
  }
  return dx > 0 ? 1 : 3;
}

function drawShatter(image: RgbaImage, previous: RgbaImage, next: RgbaImage, open: number): void {
  const distance = 40 * easings.easeInQuad(open);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let color = getPixel(next, x, y);
      for (const [piece, [ux, uy]] of SHATTER_PIECES.entries()) {
        const [sx, sy] = [x + 0.5 - ux * distance, y + 0.5 - uy * distance];
        if (sx < 0 || sy < 0 || sx >= WIDTH || sy >= HEIGHT || getPiece(sx, sy) !== piece) {
          continue;
        }
        const [dx, dy] = [sx - WIDTH / 2, sy - HEIGHT / 2];
        const isEdge = Math.abs(Math.abs(dx) - Math.abs(dy)) < 1.2;
        color = isEdge ? WHITE : getPixel(previous, sx, sy);
      }
      setPixel(image, x, y, color);
    }
  }
}

function drawTransition(image: RgbaImage, transition: Transition, index: number, week: Week): void {
  const local = week.story - index * SCENE_BEATS;
  const drawn = easings.easeInOutCubic(getSpan(local, ...DRAW));
  const open = easings.easeInOutCubic(getSpan(local, ...OPEN));
  const erased = easings.easeInOutCubic(getSpan(local, ...ERASE));
  if (open <= 0) {
    drawScene(image, index - 1, week);
    if (transition.type === "shatter") {
      const { reach } = getAxes(45);
      drawLine(image, 45, 0, -reach * drawn, reach * drawn);
      drawLine(image, -45, 0, -reach * drawn, reach * drawn);
      return;
    }
    const { reach } = getAxes(transition.angle);
    drawLine(image, transition.angle, 0, -reach, -reach + 2 * reach * drawn);
    return;
  }
  const previous = createRgbaImage();
  const next = createRgbaImage();
  drawScene(previous, index - 1, week);
  drawScene(next, index, week);
  if (open >= 1 && (transition.type !== "scissor" || erased >= 1)) {
    image.set(next);
    return;
  }
  if (transition.type === "shatter") {
    drawShatter(image, previous, next, open);
    return;
  }
  const { reach } = getAxes(transition.angle);
  if (transition.type === "slit") {
    const gap = drawSlit(image, previous, next, transition.angle, open);
    drawLine(image, transition.angle, gap, -reach, reach);
    drawLine(image, transition.angle, -gap, -reach, reach);
    return;
  }
  drawScissor(image, previous, next, transition.angle, open);
  drawLine(image, transition.angle, 0, -reach + 2 * reach * erased, reach);
}

function getTransition(story: number): { transition: Transition; index: number } | undefined {
  const index = Math.round(story / SCENE_BEATS);
  const transition = transitions[index - 1];
  const local = story - index * SCENE_BEATS;
  if (!transition || local < DRAW[0] || local >= ERASE[1]) {
    return undefined;
  }
  return { transition, index };
}

export const heroWeek = defineEffect({
  id: "hero-week",
  name: "Frieren and Himmel too slow",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    waiter: z.enum(heroIds).default("himmel"),
    heartColor: colorSchema.default("#ff3c78"),
    background: z.boolean().default(false),
  }),
  render(image, { params, beat, progress }) {
    const week: Week = {
      story: progress * WEEK_BEATS,
      beat,
      heart: parseColor(params.heartColor),
      waiter: params.waiter,
      background: params.background,
    };
    const active = getTransition(week.story);
    if (active) {
      drawTransition(image, active.transition, active.index, week);
      return;
    }
    drawScene(image, Math.min(7, Math.floor(week.story / SCENE_BEATS)), week);
  },
});

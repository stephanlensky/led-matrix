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
import { drawText, fonts, getLineHeight, measureText } from "../fonts/index.ts";
import { easings } from "../keyframes.ts";
import {
  type Raster,
  type Rotation,
  type Vector,
  addBox,
  compositeRaster,
  createMesh,
  createRaster,
  drawMesh,
  getMatrix,
  getRotation,
} from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, catIds, clamp, furParams, getCoat, getSpan, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { getSquashedRotation } from "./cat-laptop.ts";
import {
  type CatJoint,
  type CatPlacement,
  type Coat,
  SIT,
  TUCK,
  UNSIT,
  drawCat,
  getCatPoint,
  getCatProjector,
  getNormalShader,
  mix,
  scale,
  setScaledColor,
} from "./cat-model.ts";
import { getOvershoot } from "./cat-wands.ts";
import {
  type HeroId,
  type HeroPlacement,
  drawHero,
  getHeroPoint,
  heroIds,
} from "./frieren-model.ts";
import { HAND, HERO_EYE_COLORS, getArm, getHeroEyeModel, getHeroFace } from "./hero-love.ts";
import { type CatFace, type EyeStyle, drawEyes, getCatFace, getEyelessCoat } from "./cat-face.ts";
import { type CharacterHead, getCharacterHead } from "./character-heads.ts";
import { blendPixel, drawHeart, getHeartCoverage } from "./heart.ts";
import { HEART_SEED, drawFloatingHearts, drawSparkle, drawSparkles } from "./heart-particles.ts";

type PhonePart = "case" | "screen";

type PhoneScreen = (u: number, v: number) => Color;

type Angles = { pitch: number; yaw?: number; roll?: number };

const characterIds = [...catIds, ...heroIds] as const;

type CharacterId = (typeof characterIds)[number];

const partners: Readonly<Record<CharacterId, CharacterId>> = {
  tabby: "black",
  black: "tabby",
  frieren: "himmel",
  himmel: "frieren",
};

type Character = { type: "cat"; coat: Coat } | { type: "hero"; hero: HeroId };

type PhoneCat = {
  character: Character;
  side: number;
  x: number;
  y: number;
  size: number;
  turn?: number;
  squash?: number;
  head: Angles;
  hold: Angles;
  free: Angles;
  tail: number;
  phone: {
    offset: readonly [number, number];
    rotate: Angles;
    color: Color;
    screen: PhoneScreen;
  };
  eyes: EyeStyle;
};

type PhoneCatPoints = CatFace & { phone: Vector; eyeSize: number };

type View = { x: number; y: number; zoom: number };

const FULL_VIEW: View = { x: 0, y: 0, zoom: 1 };

const PHONE_HALF: Vector = [0.22, 0.36, 0.05];
const SCREEN_HALF: Vector = [0.17, 0.29, 0.01];
const PAW_TIP: Vector = [0.3, -0.92, 0.35];
const VIEW_PITCH = toRadians(10);
const CAT_YAW = 25;
const TYPING_BEATS = 48;
const SEND_BEATS = 8;
const SPLIT_ROW = 31;
const SPLIT_DRAW = [14, 15] as const;
const SPLIT_OPEN = [15, 16] as const;
const SPLIT_CLOSE = [30, 31] as const;
const SPLIT_ERASE = [31, 32] as const;
const SENDER_THOUGHT = [3, 11.5] as const;
const RECEIVER_THOUGHT = [19, 27] as const;
const LIFT_MAX = 18;
const LIFT_NUDGE = [16.5, 16.8] as const;
const LIFT_SETTLE = [16.8, 17.3] as const;
const LIFT_SHOVE = [17.6, 18.2] as const;
const LIFT_DROP = [28, 29] as const;
const HOP_NUDGE = [16.4, 17] as const;
const HOP_SHOVE = [17.45, 18.2] as const;
const DAYDREAM_VIEW: View = { x: -6, y: 5, zoom: 0.9 };
const SENDER_SPLIT_VIEW: View = { x: 0, y: -9, zoom: 0.75 };
const RECEIVER_SPLIT_VIEW: View = { x: -4, y: 24, zoom: 0.75 };
const BUZZ_BEATS = 8;
const SWOOSH_SLOPE = 0.45;
const WHITE: Color = [255, 255, 255];
const BLACK: Color = [0, 0, 0];
const YELLOW: Color = [255, 220, 60];
const DARK_PHONE: Color = [40, 40, 52];
const LIGHT_PHONE: Color = [232, 222, 236];
const SCREEN_OFF: Color = [14, 14, 22];

function createPhoneMesh() {
  const mesh = createMesh<PhonePart>();
  addBox(mesh, [0, 0.2, 0], PHONE_HALF, "case");
  addBox(mesh, [0, 0.2, PHONE_HALF[2] + 0.005], SCREEN_HALF, "screen");
  return mesh;
}

const phoneMesh = createPhoneMesh();

function getAngles({ pitch, yaw = 0, roll = 0 }: Angles, side: number): Rotation {
  return getRotation(toRadians(pitch), toRadians(yaw * side), toRadians(roll * side));
}

function drawPhone(raster: Raster, placement: CatPlacement, color: Color, screen: PhoneScreen) {
  drawMesh(raster, phoneMesh, {
    project: getCatProjector(placement),
    getShade: getNormalShader(getMatrix(placement.rotate)),
    getColor: (part, [x, y], shade, out) =>
      part === "screen"
        ? screen((x / SCREEN_HALF[0] + 1) / 2, 1 - ((y - 0.2) / SCREEN_HALF[1] + 1) / 2)
        : setScaledColor(out, color, shade),
  });
}

function drawPhoneCharacter(raster: Raster, cat: PhoneCat, view = FULL_VIEW): PhoneCatPoints {
  const { character } = cat;
  return character.type === "cat"
    ? drawPhoneCat(raster, cat, character.coat, view)
    : drawPhoneHero(raster, cat, character.hero, view);
}

function drawPhoneCat(raster: Raster, cat: PhoneCat, coat: Coat, view: View): PhoneCatPoints {
  const { side } = cat;
  const size = cat.size * view.zoom;
  const camera = getRotation(VIEW_PITCH, toRadians(CAT_YAW * side) + (cat.turn ?? 0), 0);
  const head = getAngles(cat.head, side);
  const holdJoint: CatJoint = side > 0 ? "frontRightLeg" : "frontLeftLeg";
  const freeJoint: CatJoint = side > 0 ? "frontLeftLeg" : "frontRightLeg";
  const placement: CatPlacement = {
    x: (cat.x - WIDTH / 2) * view.zoom + WIDTH / 2 + view.x,
    y: cat.y * view.zoom + view.y,
    size,
    rotate: getSquashedRotation((vector) => camera(SIT(vector)), cat.squash ?? 0, -0.8),
    pose: {
      head: (vector) => UNSIT(head(vector)),
      [holdJoint]: getAngles(cat.hold, side),
      [freeJoint]: getAngles(cat.free, side),
      backLeftLeg: TUCK,
      backRightLeg: TUCK,
      tail: getRotation(toRadians(60), toRadians(30 * cat.tail), 0),
    },
  };
  drawCat(raster, placement, cat.eyes === "open" ? coat : getEyelessCoat(coat));
  const [pawX, pawY, pawDepth] = getCatPoint(
    placement,
    [side * PAW_TIP[0], PAW_TIP[1], PAW_TIP[2]],
    holdJoint,
  );
  const phone: Vector = [
    pawX + cat.phone.offset[0] * side * size,
    pawY + cat.phone.offset[1] * size,
    pawDepth - 0.3,
  ];
  drawPhone(
    raster,
    {
      x: phone[0],
      y: phone[1],
      depth: phone[2],
      size: size * 1.05,
      rotate: getAngles(cat.phone.rotate, side),
    },
    cat.phone.color,
    cat.phone.screen,
  );
  return { ...getCatFace(placement), phone, eyeSize: 5.5 };
}

const HERO_SCALE = 0.8;
const HERO_GROUND = -1.12;
const OVERHEAD: Vector = [0.85, 0.8, 0.15];

function getMix([ax, ay, az]: Vector, [bx, by, bz]: Vector, amount: number): Vector {
  return [ax + (bx - ax) * amount, ay + (by - ay) * amount, az + (bz - az) * amount];
}

function getSided([x, y, depth]: Vector, side: number): Vector {
  return [x * side, y, depth];
}

function drawPhoneHero(raster: Raster, cat: PhoneCat, hero: HeroId, view: View): PhoneCatPoints {
  const { side } = cat;
  const size = cat.size * view.zoom * HERO_SCALE;
  const camera = getRotation(VIEW_PITCH, toRadians(CAT_YAW * side) + (cat.turn ?? 0), 0);
  const raise = clamp((-cat.hold.pitch - 8) / 30);
  const holdOverhead = clamp((-cat.hold.pitch - 60) / 90);
  const hold = getMix(
    getMix(getSided([0.22, 0.2, 0.4], side), getSided([0.18, 0.42, 0.5], side), raise),
    getSided(OVERHEAD, side),
    holdOverhead,
  );
  const reach = clamp((-cat.free.pitch - 20) / 42);
  const freeOverhead = clamp((-cat.free.pitch - 100) / 40);
  const free = getMix(
    getMix(
      getSided([0.45, 0.05, 0.15], -side),
      [hold[0] - side * 0.12, hold[1] + 0.05, hold[2] + 0.08],
      reach,
    ),
    getSided(OVERHEAD, -side),
    freeOverhead,
  );
  const placement: HeroPlacement = {
    x: (cat.x - WIDTH / 2) * view.zoom + WIDTH / 2 + view.x,
    y: (cat.y + 0.5 * cat.size) * view.zoom + view.y + HERO_GROUND * size,
    size,
    rotate: getSquashedRotation(camera, cat.squash ?? 0, HERO_GROUND),
    pose: {
      head: getAngles({ ...cat.head, pitch: cat.head.pitch * 0.7 }, side),
      hair: getRotation(0, 0, toRadians(10 * cat.tail)),
      cape: getRotation(toRadians(-10 * Math.abs(cat.tail)), 0, 0),
      ...getArm(side, hold, [side, -1, -0.3]),
      ...getArm(-side, free, [-side, -1, -0.3]),
    },
  };
  drawHero(raster, hero, { ...placement, eyes: getHeroEyeModel(hero, placement, cat.eyes) });
  const [handX, handY, handDepth] = getHeroPoint(
    hero,
    placement,
    getSided(HAND, side),
    side > 0 ? "rightForearm" : "leftForearm",
  );
  const phoneSize = size;
  const phone: Vector = [handX, handY - 0.15 * phoneSize, handDepth + 0.05];
  drawPhone(
    raster,
    {
      x: phone[0],
      y: phone[1],
      depth: phone[2],
      size: phoneSize,
      rotate: getAngles(cat.phone.rotate, side),
    },
    cat.phone.color,
    cat.phone.screen,
  );
  return {
    ...getHeroFace(hero, placement),
    phone,
    eyeSize: 3,
  };
}

function getTypingScreen(glow: Color, beat: number, flash: number): PhoneScreen {
  const lit = ((Math.floor(beat) % 3) + 3) % 3;
  return (u, v) => {
    const background = mix(scale(glow, 0.55 + 0.25 * v), WHITE, flash);
    const dot = Math.floor(u * 3);
    const isDot = Math.abs(v - 0.55) < 0.1 && Math.abs(getCycle(u * 3) - 0.5) < 0.28;
    if (!isDot) {
      return background;
    }
    return dot === lit ? WHITE : mix(background, WHITE, 0.35);
  };
}

function getHeartScreen(glow: Color, heart: Color, beat: number, light: number): PhoneScreen {
  const grow = 0.75 + 0.15 * Math.exp(-getCycle(beat) * 5);
  const aspect = SCREEN_HALF[1] / SCREEN_HALF[0];
  return (u, v) => {
    const background = mix(SCREEN_OFF, scale(glow, 0.6 + 0.3 * v), light);
    const coverage = getHeartCoverage((u - 0.5) / grow + 0.5, ((v - 0.5) * aspect) / grow + 0.5);
    return coverage > 0 ? mix(background, mix(heart, WHITE, 0.2), light) : background;
  };
}

type BubbleMask = { width: number; height: number; tipX: number; cells: Uint8Array };

const BUBBLE_PAD = 3;
const BUBBLE_TAIL = 5;
const bubbleMasks = new Map<string, BubbleMask>();

function isInsideBubble(x: number, y: number, width: number, body: number): boolean {
  const radius = 4;
  if (y < body) {
    const dx = Math.max(radius - x, x - (width - radius), 0);
    const dy = Math.max(radius - y, y - (body - radius), 0);
    return x >= 0 && x <= width && y >= 0 && Math.hypot(dx, dy) <= radius;
  }
  const t = (y - body) / BUBBLE_TAIL;
  return t <= 1 && x >= 3 - 1 * t && x <= 11 - 9 * t;
}

function getBubbleMask(message: string): BubbleMask {
  const cached = bubbleMasks.get(message);
  if (cached) {
    return cached;
  }
  const lines = message.trim().toUpperCase().split(/\s+/);
  const longest = Math.max(...lines.map((line) => line.length));
  const font = longest <= 5 ? fonts["spleen-8x16"] : fonts["spleen-6x12"];
  const text = createRgbaImage();
  const step = font.ascent;
  const textWidth = Math.max(...lines.map((line) => measureText(font, line)));
  for (const [index, line] of lines.entries()) {
    drawText(text, font, line, (textWidth - measureText(font, line)) / 2, index * step, WHITE);
  }
  let [minX, minY, maxX, maxY] = [WIDTH, HEIGHT, -1, -1];
  for (let y = 0; y < Math.min(HEIGHT, lines.length * getLineHeight(font)); y++) {
    for (let x = 0; x < WIDTH; x++) {
      if ((text[(y * WIDTH + x) * 4 + 3] ?? 0) > 0) {
        [minX, minY, maxX, maxY] = [
          Math.min(minX, x),
          Math.min(minY, y),
          Math.max(maxX, x),
          Math.max(maxY, y),
        ];
      }
    }
  }
  const body = maxY - minY + 1 + BUBBLE_PAD * 2 + 1;
  const width = maxX - minX + 1 + BUBBLE_PAD * 2 + 1;
  const height = body + BUBBLE_TAIL;
  const cells = new Uint8Array(width * height);
  const isInside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && isInsideBubble(x + 0.5, y + 0.5, width, body);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInside(x, y)) {
        continue;
      }
      const textX = x - BUBBLE_PAD - 1 + minX;
      const textY = y - BUBBLE_PAD - 1 + minY;
      const isText =
        textX >= minX &&
        textY >= minY &&
        textX <= maxX &&
        textY <= maxY &&
        (text[(textY * WIDTH + textX) * 4 + 3] ?? 0) > 0;
      const isEdge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => !isInside(x + dx, y + dy));
      cells[y * width + x] = isText ? 3 : isEdge ? 2 : 1;
    }
  }
  const mask = { width, height, tipX: 2, cells };
  bubbleMasks.set(message, mask);
  return mask;
}

type Bubble = { x: number; y: number; scale: number; fill: Color; ink: Color };

function drawBubble(image: RgbaImage, mask: BubbleMask, bubble: Bubble): void {
  if (bubble.scale <= 0.05) {
    return;
  }
  const colors = [undefined, bubble.fill, bubble.ink, bubble.ink];
  const left = bubble.x - mask.tipX * bubble.scale;
  const top = bubble.y - mask.height * bubble.scale;
  for (let py = Math.floor(top); py <= top + mask.height * bubble.scale; py++) {
    for (let px = Math.floor(left); px <= left + mask.width * bubble.scale; px++) {
      const x = Math.floor((px + 0.5 - left) / bubble.scale);
      const y = Math.floor((py + 0.5 - top) / bubble.scale);
      if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) {
        continue;
      }
      const color = colors[mask.cells[y * mask.width + x] ?? 0];
      if (color) {
        blendPixel(image, px, py, color);
      }
    }
  }
}

function drawSwoosh(image: RgbaImage, front: number, back: number, color: Color): void {
  for (let y = 0; y < HEIGHT; y++) {
    const band = Math.floor(y / 3);
    const random = createRandom(hashSeed(HEART_SEED, band));
    const lead = getRandomBetween(random, 0, 12);
    const trail = getRandomBetween(random, 0, 12);
    const shade = band % 2 === 0 ? 1 : 0.82;
    for (let x = 0; x < WIDTH; x++) {
      const position = x + SWOOSH_SLOPE * (y - HEIGHT / 2);
      const ahead = front - lead - position;
      const behind = position - (back - trail);
      if (ahead < 0 || behind < 0) {
        continue;
      }
      const edge = Math.min(ahead, behind);
      blendPixel(image, x, y, edge < 2 ? mix(color, WHITE, 0.6) : scale(color, shade));
    }
  }
  for (const [index, offset] of [18, 40, 62].entries()) {
    const y = 14 + index * 18;
    const x = front - offset - SWOOSH_SLOPE * (y - HEIGHT / 2);
    if (x + SWOOSH_SLOPE * (y - HEIGHT / 2) > back + 6) {
      drawHeart(image, { x, y, size: 9, color: mix(color, WHITE, 0.7) });
    }
  }
}

function drawSpeedLines(image: RgbaImage, [x, y]: Vector, amount: number, color: Color): void {
  for (const [index, dy] of [-6, -1, 4].entries()) {
    const length = 6 + index * 3;
    for (let step = 0; step < length; step++) {
      blendPixel(
        image,
        x - 22 - step - index * 2,
        y + dy + step * 0.45,
        color,
        amount * (1 - step / length),
      );
    }
  }
}

function drawVibration(image: RgbaImage, [x, y]: Vector, size: number, amount: number): void {
  const reach = PHONE_HALF[0] * size + 2;
  for (const side of [-1, 1]) {
    for (const [ring, distance] of [0, 3].entries()) {
      const color = ring === 0 ? WHITE : YELLOW;
      for (const [dx, dy] of [
        [0, -3],
        [1, -2],
        [1, -1],
        [1, 0],
        [1, 1],
        [0, 2],
      ] as const) {
        blendPixel(image, x + side * (reach + distance + dx), y - 3 + dy, color, amount);
      }
    }
  }
}

function drawExclamation(image: RgbaImage, [x, y]: Vector, pop: number, amount: number): void {
  const size = getOvershoot(clamp(pop));
  const height = Math.round(7 * size);
  const left = Math.round(x);
  const bottom = Math.round(y - 3);
  for (let row = 0; row < height + 3; row++) {
    if (row === 1) {
      continue;
    }
    for (let column = -1; column <= 1; column++) {
      blendPixel(image, left + column, bottom - row, YELLOW, amount * (column === 1 ? 0.6 : 1));
    }
  }
}

type ThoughtMask = { width: number; height: number; cells: Uint8Array };

const THOUGHT_PAD = [5, 4] as const;
const THOUGHT_BUMP = 3.2;
const thoughtMasks = new Map<string, ThoughtMask>();

function isInsideCloud(x: number, y: number, width: number, height: number): boolean {
  const [centerX, centerY] = [width / 2, height / 2];
  const [radiusX, radiusY] = [centerX - THOUGHT_BUMP, centerY - THOUGHT_BUMP];
  if (((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <= 1) {
    return true;
  }
  const bumps = Math.round((Math.PI * (radiusX + radiusY)) / 5);
  for (let bump = 0; bump < bumps; bump++) {
    const angle = (bump / bumps) * TAU + 0.3;
    const bumpX = centerX + Math.cos(angle) * radiusX;
    const bumpY = centerY + Math.sin(angle) * radiusY;
    if (Math.hypot(x - bumpX, y - bumpY) <= THOUGHT_BUMP) {
      return true;
    }
  }
  return false;
}

function getThoughtMask(head: CharacterHead): ThoughtMask {
  const width = head.sprite.width + THOUGHT_PAD[0] * 2;
  const height = head.sprite.height + THOUGHT_PAD[1] * 2;
  const key = `${width}x${height}`;
  const cached = thoughtMasks.get(key);
  if (cached) {
    return cached;
  }
  const isInside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && isInsideCloud(x + 0.5, y + 0.5, width, height);
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInside(x, y)) {
        continue;
      }
      const isEdge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => !isInside(x + dx, y + dy));
      cells[y * width + x] = isEdge ? 2 : 1;
    }
  }
  const mask = { width, height, cells };
  thoughtMasks.set(key, mask);
  return mask;
}

type ThoughtTiming = { dots: number; scale: number };

type Thought = {
  x: number;
  y: number;
  head: CharacterHead;
  anchor: readonly [number, number];
  timing: ThoughtTiming;
  bob: number;
};

const THOUGHT_DOTS = [
  { at: 0.3, rows: ["##", "##"] },
  { at: 0.65, rows: [".##.", "####", "####", ".##."] },
] as const;

function getThoughtTiming(story: number, [start, end]: readonly [number, number]): ThoughtTiming {
  const appear = story - start;
  const leave = story - end;
  if (appear < 0) {
    return { dots: 0, scale: 0 };
  }
  if (leave < 0) {
    return {
      dots: appear < 0.25 ? 1 : 2,
      scale: appear < 0.5 ? 0 : getOvershoot(getSpan(appear, 0.5, 1.1)),
    };
  }
  return {
    dots: leave < 0.45 ? 2 : leave < 0.6 ? 1 : 0,
    scale: 1 - easings.easeInCubic(getSpan(leave, 0, 0.35)),
  };
}

function getThoughtColor(
  mask: ThoughtMask,
  thought: Thought,
  x: number,
  y: number,
): Color | undefined {
  const cell = mask.cells[y * mask.width + x] ?? 0;
  if (cell !== 1) {
    return cell === 2 ? WHITE : undefined;
  }
  const { sprite, palette } = thought.head;
  const row = sprite.rows[y - THOUGHT_PAD[1] + thought.bob];
  return palette[row?.[x - THOUGHT_PAD[0]] ?? "."] ?? BLACK;
}

function drawThought(image: RgbaImage, thought: Thought): void {
  const mask = getThoughtMask(thought.head);
  const { dots, scale: size } = thought.timing;
  const [anchorX, anchorY] = thought.anchor;
  const targetX = anchorX < thought.x ? thought.x + 4 : thought.x + mask.width - 4;
  const targetY = thought.y + mask.height - 3;
  for (const { at, rows } of THOUGHT_DOTS.slice(0, dots)) {
    const left = Math.round(anchorX + (targetX - anchorX) * at - rows.length / 2);
    const top = Math.round(anchorY + (targetY - anchorY) * at - rows.length / 2);
    for (const [row, line] of rows.entries()) {
      for (let column = 0; column < line.length; column++) {
        if (line[column] === "#") {
          blendPixel(image, left + column, top + row, WHITE);
        }
      }
    }
  }
  if (size <= 0.05) {
    return;
  }
  const left = thought.x + (mask.width / 2) * (1 - size);
  const top = thought.y + (mask.height / 2) * (1 - size);
  for (let py = Math.floor(top); py <= top + mask.height * size; py++) {
    for (let px = Math.floor(left); px <= left + mask.width * size; px++) {
      const x = Math.floor((px + 0.5 - left) / size);
      const y = Math.floor((py + 0.5 - top) / size);
      if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) {
        continue;
      }
      const color = getThoughtColor(mask, thought, x, y);
      if (color) {
        blendPixel(image, px, py, color);
      }
    }
  }
}

const sceneNames = ["typing", "send", "buzz", "joy", "arrive", "duet"] as const;

const phoneParams = {
  ...furParams,
  scene: z.enum(sceneNames).default("typing"),
  sender: z.enum(characterIds).default("tabby"),
  message: z.string().max(24).default("CALL ME?"),
  every: z.number().min(0.25).max(4).default(1),
  heartColor: colorSchema.default("#ff3c78"),
  screenColor: colorSchema.default("#3a8cff"),
  background: z.boolean().default(false),
  backgroundColor: colorSchema.default("#140c2c"),
  replyBackgroundColor: colorSchema.default("#2a0a26"),
};

type PhoneParams = z.output<z.ZodObject<typeof phoneParams>>;

function fillBackground(
  image: RgbaImage,
  params: PhoneParams,
  color: string,
  brightness: number,
): void {
  fillRgbaImage(
    image,
    scale(getBackgroundColor({ background: params.background, color }), brightness),
  );
}

type Pulse = { pulse: number; phase: number; since: number; kick: number };

function getPulse(beat: number, every: number): Pulse {
  const pulse = beat / every;
  const phase = getCycle(pulse);
  const since = phase * every;
  return { pulse, phase, since, kick: Math.exp(-since * 6) };
}

type PhoneCharacter = { character: Character; eyeColor: Color };

function getPhoneCharacter(params: PhoneParams, id: CharacterId): PhoneCharacter {
  if (id === "frieren" || id === "himmel") {
    return { character: { type: "hero", hero: id }, eyeColor: HERO_EYE_COLORS[id] };
  }
  return {
    character: { type: "cat", coat: getCoat({ ...params, cat: id }) },
    eyeColor: parseColor(id === "tabby" ? params.tabbyEyeColor : params.eyeColor),
  };
}

function drawCharacterEyes(
  image: RgbaImage,
  points: PhoneCatPoints,
  style: EyeStyle,
  eyeColor: Color,
  heart: Color,
  pop: number,
): void {
  drawEyes(image, points, style, eyeColor, heart, pop, points.eyeSize);
}

type Sender = { story: number; rate: number; look: number; recoil: number };

function drawSender(
  image: RgbaImage,
  params: PhoneParams,
  character: Character,
  beat: number,
  { story, rate, look, recoil }: Sender,
  view = FULL_VIEW,
): PhoneCatPoints {
  const { pulse, phase, kick } = getPulse(beat * rate, params.every);
  const tap = Math.exp(-phase * 8);
  const sent = clamp((story - 2) * 4);
  const flash = story >= 2 && story < 2.6 ? 1 - (story - 2) / 0.6 : 0.35 * tap * (1 - sent);
  const glow = parseColor(params.screenColor);
  fillBackground(image, params, params.backgroundColor, 1 + 0.5 * kick);
  const raster = createRaster();
  const size = 19 - 4 * recoil;
  const points = drawPhoneCharacter(
    raster,
    {
      character,
      side: 1,
      x: 24 - 6 * recoil,
      y: 42 + 4 * recoil - 1.5 * kick,
      size,
      squash: 0.04 * kick,
      head: { pitch: 16 - 6 * tap * (1 - look) - 36 * look, yaw: 4 - 14 * look },
      hold: { pitch: -35 - 10 * look, roll: 5 },
      free: { pitch: -62 + 22 * tap * (1 - sent), roll: 80 },
      tail: Math.sin(pulse * Math.PI * 0.5),
      phone: {
        offset: [-0.26, -0.26],
        rotate: { pitch: -10, yaw: -5, roll: -6 },
        color: DARK_PHONE,
        screen:
          sent > 0
            ? getHeartScreen(glow, parseColor(params.heartColor), pulse, 1)
            : getTypingScreen(glow, pulse, flash),
      },
      eyes: "open",
    },
    view,
  );
  compositeRaster(raster, image);
  return points;
}

function drawSend(
  image: RgbaImage,
  params: PhoneParams,
  character: Character,
  beat: number,
  story: number,
): void {
  const heart = parseColor(params.heartColor);
  const pop = easings.easeOutCubic(clamp((story - 2) / 0.6));
  const points = drawSender(image, params, character, beat, {
    story,
    rate: story < 2 ? 2 : 1,
    look: easings.easeInOutSine(getSpan(story, 2.2, 3)) * (1 - getSpan(story, 6, 7)),
    recoil: pop,
  });
  if (story >= 2) {
    const { kick } = getPulse(beat, params.every);
    const fly = easings.easeInCubic(getSpan(story, 5, 6.2));
    const mask = getBubbleMask(params.message);
    const restX = Math.min(25, WIDTH - 1 - mask.width + mask.tipX);
    const restY = 39;
    const x = points.phone[0] + (restX - points.phone[0]) * pop + 70 * fly;
    const y = points.phone[1] - 6 + (restY - points.phone[1] + 6) * pop - 34 * fly;
    const size = getOvershoot(clamp((story - 2) / 0.6)) * (1 + 0.04 * kick * (1 - fly));
    if (fly > 0) {
      drawSpeedLines(image, [x + 18, y - 14, 0], clamp(fly * 4) * (1 - fly), WHITE);
    }
    drawBubble(image, mask, {
      x,
      y: y + kick * (1 - fly),
      scale: size,
      fill: WHITE,
      ink: heart,
    });
  }
  const sweep = easings.easeInQuad(getSpan(story, 6.2, SEND_BEATS));
  if (sweep > 0) {
    drawSwoosh(image, -30 + 130 * sweep, -200, heart);
  }
}

function drawReceiver(
  image: RgbaImage,
  params: PhoneParams,
  { character, eyeColor }: PhoneCharacter,
  beat: number,
  story: number,
): void {
  const heart = parseColor(params.heartColor);
  const glow = parseColor(params.screenColor);
  const { pulse, kick } = getPulse(beat, params.every);
  const buzz = story >= 2 && story < 4.2 ? 1 : 0;
  const buzzKick = buzz * Math.exp(-getCycle(story) * 3);
  const startle = story >= 2 ? Math.exp(-(story - 2) * 5) : 0;
  const raise = easings.easeInOutCubic(getSpan(story, 4, 5));
  const love = story >= 6 ? 1 : 0;
  const crouch = easings.easeInOutSine(getSpan(story, 6.8, BUZZ_BEATS));
  const notice = easings.easeOutCubic(getSpan(story, 2, 2.4));
  fillBackground(image, params, params.replyBackgroundColor, 1 + 0.5 * kick + 0.5 * love);
  const raster = createRaster();
  const shake = buzz * Math.sin(story * 60) * (0.5 + buzzKick);
  const lit = story >= 2 ? 1 : 0;
  const glowing = buzz * (Math.floor(story * 4) % 2) * 0.4;
  const points = drawPhoneCharacter(raster, {
    character,
    side: -1,
    x: 40 - 8 * crouch,
    y: 42 - 1.2 * kick - 5 * startle + 3 * crouch,
    size: 19 - 2 * crouch,
    squash: 0.04 * kick + 0.12 * crouch,
    head: {
      pitch: 4 + 22 * notice - 10 * raise - 8 * love * kick,
      yaw: -18 + 22 * notice,
      roll: (1 - notice) * 8 * Math.sin(pulse * Math.PI) + love * 10 * Math.sin(pulse * Math.PI),
    },
    hold: { pitch: -8 - 30 * raise, roll: 5 },
    free: { pitch: -20 - 45 * raise - 20 * startle, roll: 40 + 40 * raise },
    tail: Math.sin(pulse * Math.PI * (story < 2 ? 0.5 : 1)),
    phone: {
      offset: [-0.26 + shake / 19, -0.26],
      rotate: { pitch: -10 + 50 * (1 - raise), yaw: -5, roll: -6 + 6 * shake },
      color: LIGHT_PHONE,
      screen: getHeartScreen(mix(glow, heart, glowing), heart, pulse, lit),
    },
    eyes: love ? "hearts" : "open",
  });
  compositeRaster(raster, image);
  if (buzz) {
    drawVibration(image, points.phone, 20, Math.floor(story * 6) % 2 === 0 ? 1 : 0.4);
  }
  if (story >= 2 && story < 4) {
    drawExclamation(image, points.top, (story - 2) * 3, clamp((4 - story) * 2));
  }
  drawCharacterEyes(
    image,
    points,
    love ? "hearts" : "open",
    eyeColor,
    heart,
    getOvershoot(clamp((story - 6) * 3)) * (1 + 0.2 * kick),
  );
  if (love) {
    drawFloatingHearts(
      image,
      story - 6,
      [points.top[0], points.top[1] + 4],
      [heart, mix(heart, WHITE, 0.5)],
      8,
    );
  }
  const reveal = easings.easeOutQuad(getSpan(story, 0, 1.2));
  if (reveal < 1) {
    drawSwoosh(image, 400, -25 + 125 * reveal, heart);
  }
}

type Dance = Pulse & { index: number; isBig: boolean };

function getDance(beat: number, every: number): Dance {
  const pulse = getPulse(beat, every);
  const index = Math.floor(pulse.pulse);
  return { ...pulse, index, isBig: ((index % 4) + 4) % 4 === 3 };
}

type Dancer = {
  character: Character;
  side: number;
  x: number;
  size: number;
  turn: number;
  spin: number;
  lean: number;
  phone: Color;
  screen: PhoneScreen;
};

function getDancingCat(
  { pulse, phase, since, kick, index, isBig }: Dance,
  { character, side, x, size, turn, spin, lean, phone, screen }: Dancer,
): PhoneCat {
  const height = isBig ? 13 : 7;
  const hop = height * 4 * phase * (1 - phase);
  const reach = lean * Math.sin(Math.PI * phase);
  const wave = Math.sin(pulse * TAU) * (1 - reach);
  const flip = index % 2 === 0 ? 1 : -1;
  return {
    character,
    side,
    x: x + side * 4 * reach,
    y: 46 - hop,
    size,
    turn: turn + side * TAU * spin * easings.easeInOutCubic(phase),
    squash: 0.16 * Math.exp(-since * 9) * Math.cos(since * 25),
    head: {
      pitch: -12 - 8 * kick + 10 * reach,
      yaw: 0,
      roll: 12 * flip * Math.sin(phase * Math.PI) * (1 - reach),
    },
    hold: { pitch: -150 + 12 * wave + 50 * reach, roll: -25 },
    free: { pitch: -140 - 12 * wave, roll: 30 },
    tail: wave,
    phone: {
      offset: [0.05, -0.4],
      rotate: { pitch: 0, yaw: -10, roll: 10 * wave },
      color: phone,
      screen,
    },
    eyes: "happy",
  };
}

function drawDanceFloor(image: RgbaImage, params: PhoneParams, pulse: number, kick: number): void {
  const heart = parseColor(params.heartColor);
  fillBackground(image, params, params.replyBackgroundColor, 1 + 0.6 * kick);
  if (params.background) {
    drawHeart(image, {
      x: WIDTH / 2,
      y: 28,
      size: 54 * (1 + 0.07 * kick),
      color: scale(heart, 0.28 + 0.2 * kick),
    });
  }
  drawSparkles(image, pulse, [mix(heart, WHITE, 0.4)], 0.8);
}

function getHeartColors(heart: Color): Color[] {
  return [heart, mix(heart, WHITE, 0.5), [255, 90, 60]];
}

function drawJoy(
  image: RgbaImage,
  params: PhoneParams,
  { character, eyeColor }: PhoneCharacter,
  beat: number,
): void {
  const heart = parseColor(params.heartColor);
  const glow = parseColor(params.screenColor);
  const dance = getDance(beat, params.every);
  drawDanceFloor(image, params, dance.pulse, dance.kick);
  const raster = createRaster();
  const points = drawPhoneCharacter(
    raster,
    getDancingCat(dance, {
      character,
      side: -1,
      x: WIDTH / 2,
      size: 17,
      turn: toRadians(15),
      spin: dance.isBig ? 1 : 0,
      lean: 0,
      phone: LIGHT_PHONE,
      screen: getHeartScreen(glow, heart, dance.pulse, 1),
    }),
  );
  drawFloatingHearts(image, dance.pulse, [WIDTH / 2, 44], getHeartColors(heart), 24);
  compositeRaster(raster, image);
  drawCharacterEyes(image, points, dance.isBig ? "hearts" : "happy", eyeColor, heart, 1);
}

const DUET_BEATS = 8;
const DUET_SIZE = 14;
const DUET_X = 15;
const DUET_TURN = toRadians(5);

function isTouching(dance: Dance, beat: number): boolean {
  return dance.isBig && getCycle(beat / DUET_BEATS) >= 0.5;
}

function drawBurst(image: RgbaImage, beat: number, every: number, y: number, heart: Color): void {
  const age = getCycle((beat - DUET_BEATS + every / 2) / DUET_BEATS) * DUET_BEATS;
  if (age >= 2) {
    return;
  }
  const fade = clamp((2 - age) * 1.5);
  drawHeart(image, {
    x: WIDTH / 2,
    y: y - 4 * age,
    size: 11 * getOvershoot(clamp(age * 3)),
    color: mix(heart, WHITE, 0.3),
    outline: WHITE,
    amount: fade,
  });
  for (let ray = 0; ray < 8; ray++) {
    const angle = (ray / 8) * TAU;
    const distance = 9 + 14 * easings.easeOutCubic(clamp(age / 1.2));
    drawSparkle(
      image,
      [
        Math.round(WIDTH / 2 + Math.cos(angle) * distance),
        Math.round(y + Math.sin(angle) * distance * 0.8),
      ],
      ray % 2 === 0 ? YELLOW : heart,
      fade,
      1,
    );
  }
}

function getDanceEyes(dance: Dance): EyeStyle {
  return dance.isBig ? "hearts" : "happy";
}

type DuetPlacement = {
  senderX: number;
  receiverX: number;
  receiverSize: number;
  turn: number;
  hasBurst: boolean;
};

function drawDuetCats(
  image: RgbaImage,
  params: PhoneParams,
  senderCharacter: PhoneCharacter,
  receiverCharacter: PhoneCharacter,
  beat: number,
  placement: DuetPlacement,
  senderDance = getDance(beat, params.every),
): void {
  const heart = parseColor(params.heartColor);
  const glow = parseColor(params.screenColor);
  const dance = getDance(beat, params.every);
  const touch = isTouching(dance, beat);
  const getMove = (move: Dance) => ({
    spin: move.isBig && !isTouching(move, beat) ? 1 : 0,
    lean: isTouching(move, beat) ? 1 : 0,
  });
  drawDanceFloor(image, params, dance.pulse, dance.kick);
  const raster = createRaster();
  const sender = drawPhoneCharacter(
    raster,
    getDancingCat(senderDance, {
      character: senderCharacter.character,
      side: 1,
      x: placement.senderX,
      size: DUET_SIZE,
      turn: -placement.turn,
      ...getMove(senderDance),
      phone: DARK_PHONE,
      screen: getHeartScreen(glow, heart, dance.pulse, 1),
    }),
  );
  const receiver = drawPhoneCharacter(
    raster,
    getDancingCat(dance, {
      character: receiverCharacter.character,
      side: -1,
      x: placement.receiverX,
      size: placement.receiverSize,
      turn: placement.turn,
      ...getMove(dance),
      phone: LIGHT_PHONE,
      screen: getHeartScreen(glow, heart, dance.pulse, 1),
    }),
  );
  const colors = getHeartColors(heart);
  drawFloatingHearts(image, dance.pulse, [placement.senderX, 44], colors, 10);
  drawFloatingHearts(image, dance.pulse + 0.5, [placement.receiverX, 44], colors, 10, {
    seed: hashSeed(HEART_SEED, 2),
  });
  compositeRaster(raster, image);
  drawCharacterEyes(
    image,
    sender,
    getDanceEyes(senderDance),
    senderCharacter.eyeColor,
    heart,
    1 + 0.2 * Number(touch),
  );
  drawCharacterEyes(
    image,
    receiver,
    getDanceEyes(dance),
    receiverCharacter.eyeColor,
    heart,
    1 + 0.2 * Number(touch),
  );
  if (placement.hasBurst) {
    drawBurst(image, beat, params.every, (sender.phone[1] + receiver.phone[1]) / 2 - 12, heart);
  }
}

function drawArrive(
  image: RgbaImage,
  params: PhoneParams,
  senderCharacter: PhoneCharacter,
  receiverCharacter: PhoneCharacter,
  beat: number,
): void {
  const slide = easings.easeInOutCubic(getSpan(beat, 0.5, 3));
  const enter = easings.easeOutCubic(getSpan(beat, 0, 4));
  const senderDance = beat < 4 ? { ...getDance(beat * 2, params.every), isBig: false } : undefined;
  drawDuetCats(
    image,
    params,
    senderCharacter,
    receiverCharacter,
    beat,
    {
      senderX: -16 + (WIDTH / 2 - DUET_X + 16) * enter,
      receiverX: WIDTH / 2 + DUET_X * slide,
      receiverSize: 17 - (17 - DUET_SIZE) * slide,
      turn: toRadians(15) - (toRadians(15) - DUET_TURN) * slide,
      hasBurst: beat >= 4,
    },
    senderDance,
  );
}

function drawDuet(
  image: RgbaImage,
  params: PhoneParams,
  senderCharacter: PhoneCharacter,
  receiverCharacter: PhoneCharacter,
  beat: number,
): void {
  drawDuetCats(image, params, senderCharacter, receiverCharacter, beat, {
    senderX: WIDTH / 2 - DUET_X,
    receiverX: WIDTH / 2 + DUET_X,
    receiverSize: DUET_SIZE,
    turn: DUET_TURN,
    hasBurst: true,
  });
}

function getLockScreen(glow: Color, light: number): PhoneScreen {
  return (_u, v) => mix(SCREEN_OFF, scale(glow, 0.4 + 0.3 * v), light);
}

type Waiting = { hop: number; dream: number };

function drawWaiting(
  image: RgbaImage,
  params: PhoneParams,
  character: Character,
  beat: number,
  view: View,
  { hop, dream }: Waiting,
): PhoneCatPoints {
  const { pulse, kick } = getPulse(beat, params.every);
  const check = getCycle(beat / 8) * 8;
  const look =
    easings.easeInOutSine(getSpan(check, 4, 5)) * (1 - getSpan(check, 6.5, 7.5)) * (1 - dream);
  const sigh = Math.sin(Math.PI * getSpan(check, 6.5, 8)) * (1 - dream);
  fillBackground(image, params, params.replyBackgroundColor, 1 + 0.5 * kick);
  const raster = createRaster();
  const points = drawPhoneCharacter(
    raster,
    {
      character,
      side: -1,
      x: 40,
      y: 42 - 1.2 * kick + sigh - hop,
      size: 19,
      squash: 0.04 * kick + 0.06 * sigh,
      head: {
        pitch: 4 + 26 * look + 10 * sigh - 16 * dream,
        yaw: -18 + 22 * look,
        roll: 8 * (1 - look) * Math.sin(pulse * Math.PI),
      },
      hold: { pitch: -8 - 18 * look, roll: 5 },
      free: { pitch: -20, roll: 40 },
      tail: 0.6 * Math.sin(pulse * Math.PI * 0.5),
      phone: {
        offset: [-0.26, -0.26],
        rotate: { pitch: 40 - 25 * look, yaw: -5, roll: -6 },
        color: LIGHT_PHONE,
        screen: getLockScreen(parseColor(params.screenColor), look),
      },
      eyes: "open",
    },
    view,
  );
  compositeRaster(raster, image);
  return points;
}

function getView(from: View, to: View, amount: number): View {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    zoom: from.zoom + (to.zoom - from.zoom) * amount,
  };
}

function copyRows(image: RgbaImage, source: RgbaImage, top: number, left: number): void {
  const start = Math.max(0, Math.round(left));
  for (let y = top; y < HEIGHT; y++) {
    for (let x = start; x < WIDTH; x++) {
      const target = (y * WIDTH + x) * 4;
      const from = (y * WIDTH + x - start) * 4;
      image.set(source.subarray(from, from + 4), target);
    }
  }
}

function drawDivider(image: RgbaImage, from: number, to: number, row: number): void {
  for (let x = Math.round(from); x < Math.round(to); x++) {
    blendPixel(image, x, row, WHITE);
    blendPixel(image, x, row + 1, WHITE);
  }
}

function getBump(story: number, start: number, end: number): number {
  return Math.sin(Math.PI * getSpan(story, start, end));
}

function getDividerLift(story: number): number {
  const nudge =
    5 * easings.easeOutCubic(getSpan(story, ...LIFT_NUDGE)) -
    3 * easings.easeInOutSine(getSpan(story, ...LIFT_SETTLE));
  const shove = (LIFT_MAX - 2) * getOvershoot(getSpan(story, ...LIFT_SHOVE));
  const fall = getSpan(story, ...LIFT_DROP);
  const drop =
    fall < 0.6
      ? easings.easeInQuad(fall / 0.6)
      : 1 - 0.15 * Math.sin((Math.PI * (fall - 0.6)) / 0.4);
  return Math.round((nudge + shove) * (1 - drop));
}

type Thinker = { character: Character; head: CharacterHead };

function drawTyping(
  image: RgbaImage,
  params: PhoneParams,
  sender: Thinker,
  receiver: Thinker,
  beat: number,
  story: number,
): void {
  const open =
    easings.easeOutCubic(getSpan(story, ...SPLIT_OPEN)) *
    (1 - easings.easeInCubic(getSpan(story, ...SPLIT_CLOSE)));
  const bob = getPulse(beat, params.every).kick > 0.4 ? 1 : 0;
  const daydream =
    easings.easeInOutSine(getSpan(story, SENDER_THOUGHT[0], SENDER_THOUGHT[0] + 1)) *
    (1 - easings.easeInOutSine(getSpan(story, SENDER_THOUGHT[1], SENDER_THOUGHT[1] + 1)));
  const typing = { story: 0, rate: 1, look: 0.3 * daydream, recoil: 0 };
  const senderPoints = drawSender(
    image,
    params,
    sender.character,
    beat,
    typing,
    getView(getView(FULL_VIEW, DAYDREAM_VIEW, daydream), SENDER_SPLIT_VIEW, open),
  );
  const senderThought = getThoughtTiming(story, SENDER_THOUGHT);
  if (senderThought.dots > 0) {
    drawThought(image, {
      x: WIDTH - 2 - getThoughtMask(receiver.head).width,
      y: 1,
      head: receiver.head,
      anchor: [senderPoints.top[0] + 10, senderPoints.top[1] + 2],
      timing: senderThought,
      bob,
    });
  }
  const lift = getDividerLift(story);
  const row = SPLIT_ROW - lift;
  if (open > 0) {
    const receiverImage = createRgbaImage();
    const dream =
      easings.easeInOutSine(getSpan(story, RECEIVER_THOUGHT[0] - 0.5, RECEIVER_THOUGHT[0] + 0.5)) *
      (1 - easings.easeInOutSine(getSpan(story, RECEIVER_THOUGHT[1], RECEIVER_THOUGHT[1] + 1)));
    const receiverPoints = drawWaiting(
      receiverImage,
      params,
      receiver.character,
      beat,
      RECEIVER_SPLIT_VIEW,
      {
        hop: 8 * getBump(story, ...HOP_NUDGE) + 10 * getBump(story, ...HOP_SHOVE),
        dream,
      },
    );
    const receiverThought = getThoughtTiming(story, RECEIVER_THOUGHT);
    if (receiverThought.dots > 0) {
      drawThought(receiverImage, {
        x: 1,
        y: SPLIT_ROW - LIFT_MAX + 3,
        head: sender.head,
        anchor: [receiverPoints.top[0] - 5, receiverPoints.top[1] + 2],
        timing: receiverThought,
        bob,
      });
    }
    copyRows(image, receiverImage, row, WIDTH * (1 - open));
  }
  const drawn = easings.easeInOutCubic(getSpan(story, ...SPLIT_DRAW));
  const erased = easings.easeInOutCubic(getSpan(story, ...SPLIT_ERASE));
  if (drawn > erased) {
    drawDivider(image, WIDTH * erased, WIDTH * drawn, row);
  }
}

export const heartWipe = defineEffect({
  id: "heart-wipe",
  name: "Heart wipe",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default("#ff3c78"),
    coverAt: z.number().min(0).max(64).default(0),
    revealAt: z.number().min(0).max(64).default(1.8),
    endAt: z.number().min(0).max(64).default(3),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    if (beat < params.revealAt) {
      const sweep = easings.easeInQuad(getSpan(beat, params.coverAt, params.revealAt));
      if (sweep > 0) {
        drawSwoosh(image, -30 + 130 * sweep, -200, color);
      }
      return;
    }
    const reveal = easings.easeOutQuad(getSpan(beat, params.revealAt, params.endAt));
    if (reveal < 1) {
      drawSwoosh(image, 400, -25 + 125 * reveal, color);
    }
  },
});

export const catPhone = defineEffect({
  id: "cat-phone",
  name: "Cat phone",
  kind: "pixel",
  params: z.object(phoneParams),
  render(image, { params, beat, progress }) {
    const sender = getPhoneCharacter(params, params.sender);
    const receiver = getPhoneCharacter(params, partners[params.sender]);
    if (params.scene === "typing") {
      drawTyping(
        image,
        params,
        { character: sender.character, head: getCharacterHead(params.sender, params) },
        {
          character: receiver.character,
          head: getCharacterHead(partners[params.sender], params),
        },
        beat,
        progress * TYPING_BEATS,
      );
    } else if (params.scene === "send") {
      drawSend(image, params, sender.character, beat, progress * SEND_BEATS);
    } else if (params.scene === "buzz") {
      drawReceiver(image, params, receiver, beat, progress * BUZZ_BEATS);
    } else if (params.scene === "joy") {
      drawJoy(image, params, receiver, beat);
    } else if (params.scene === "arrive") {
      drawArrive(image, params, sender, receiver, beat);
    } else {
      drawDuet(image, params, sender, receiver, beat);
    }
  },
});

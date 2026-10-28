import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH, setRgbaPixel } from "../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { getCycle } from "./cat-dance.ts";
import { mix, scale } from "./cat-model.ts";
import { blendPixel } from "./heart.ts";
import { getBeatKick } from "./heart-pulse.ts";

const WHITE: Color = [255, 255, 255];
const BLACK: Color = [0, 0, 0];
const TAU = Math.PI * 2;
const SEED = 0x7a3a;

const SHELL_HALF_HEIGHT = 24;
const SHELL_HALF_WIDTH = 20;
const SHELL_TAPER = 0.12;
const LCD_COLUMNS = 22;
const LCD_ROWS = 15;
const LCD_LEFT = -11;
const LCD_TOP = -12;
const DEVICE_HEIGHT = 56;

const PET_SPRITES = {
  idle: [
    ".#......#.",
    ".##....##.",
    "..######..",
    ".#......#.",
    "#..#..#..#",
    "#........#",
    "#...##...#",
    ".#......#.",
    "..######..",
    "..#....#..",
  ],
  blink: [
    ".#......#.",
    ".##....##.",
    "..######..",
    ".#......#.",
    "#........#",
    "#.##..##.#",
    "#...##...#",
    ".#......#.",
    "..######..",
    "..#....#..",
  ],
  happy: [
    ".#......#.",
    ".##....##.",
    "..######..",
    ".#......#.",
    "#.#....#.#",
    "##.#..#.##",
    "#.######.#",
    ".#.####.#.",
    "..######..",
    "..#....#..",
  ],
  angry: [
    "#........#",
    "##......##",
    ".########.",
    "#.#....#.#",
    "#..#..#..#",
    "#.##..##.#",
    "#........#",
    "#..####..#",
    ".#......#.",
    "..##..##..",
  ],
  scream: [
    "#........#",
    "##......##",
    ".########.",
    "#.#....#.#",
    "#..#..#..#",
    "#.##..##.#",
    "#.######.#",
    "#.#....#.#",
    ".#.####.#.",
    "..##..##..",
  ],
} as const;

const HEART_SPRITE = [".#.#.", "#####", ".###.", "..#.."];
const VEIN_SPRITE = [".#.#.", "##.##", ".....", "##.##", ".#.#."];
const NOTE_SPRITE = ["..##", "..#.", "..#.", "###.", "##.."];

const CRACKS: readonly (readonly [number, number, number, number])[] = [
  [-17, -8, -13, -4],
  [-13, -4, -15, 1],
  [-13, -4, -9, -2],
  [16, 4, 12, 9],
  [12, 9, 13, 15],
  [12, 9, 8, 12],
  [4, -22, 2, -17],
  [2, -17, 6, -15],
];

type Sprite = readonly string[];

type DeviceState = {
  anger: number;
  kick: number;
  flash: number;
  shell: Color;
  outline: Color;
  bezel: Color;
  button: Color;
  screen: Color;
  ink: Color;
  pet: Sprite;
  petColumn: number;
  petRow: number;
  icon: Sprite | undefined;
  iconColumn: number;
  iconRow: number;
};

function isSpritePixel(sprite: Sprite, column: number, row: number): boolean {
  return sprite[row]?.[column] === "#";
}

function getShellDistance(u: number, v: number, inset: number): number {
  const halfWidth = SHELL_HALF_WIDTH * (1 + (SHELL_TAPER * v) / SHELL_HALF_HEIGHT) - inset;
  const halfHeight = SHELL_HALF_HEIGHT - inset;
  return (u / halfWidth) ** 2 + (v / halfHeight) ** 2;
}

function getSegmentDistance(
  u: number,
  v: number,
  [x1, y1, x2, y2]: readonly [number, number, number, number],
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((u - x1) * dx + (v - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(u - x1 - dx * t, v - y1 - dy * t);
}

function isInRoundedRect(
  u: number,
  v: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  radius: number,
): boolean {
  const dx = Math.max(left + radius - u, 0, u - (right - radius));
  const dy = Math.max(top + radius - v, 0, v - (bottom - radius));
  return u >= left && u <= right && v >= top && v <= bottom && dx * dx + dy * dy <= radius * radius;
}

function getLcdColor(state: DeviceState, column: number, row: number): Color {
  const isPet = isSpritePixel(state.pet, column - state.petColumn, row - state.petRow);
  const isIcon =
    state.icon !== undefined &&
    isSpritePixel(state.icon, column - state.iconColumn, row - state.iconRow);
  const isGround = row === LCD_ROWS - 1 && column % 2 === 0;
  return isPet || isIcon || isGround ? state.ink : state.screen;
}

function getDeviceColor(state: DeviceState, u: number, v: number): Color | undefined {
  const ring = Math.hypot(u, v + SHELL_HALF_HEIGHT + 3.5);
  if (ring >= 2.4 && ring <= 4) {
    return state.button;
  }
  const shell = getShellDistance(u, v, 0);
  if (shell > 1) {
    return undefined;
  }
  if (state.anger > 0.6) {
    const visible = (state.anger - 0.6) / 0.4;
    const cracks = CRACKS.slice(0, Math.ceil(visible * CRACKS.length));
    if (cracks.some((crack) => getSegmentDistance(u, v, crack) < 0.7)) {
      return BLACK;
    }
  }
  if (getShellDistance(u, v, 1.6) > 1) {
    return state.outline;
  }
  if (isInRoundedRect(u, v, LCD_LEFT, LCD_TOP, LCD_LEFT + LCD_COLUMNS, LCD_TOP + LCD_ROWS, 0)) {
    return getLcdColor(state, Math.floor(u - LCD_LEFT), Math.floor(v - LCD_TOP));
  }
  if (
    isInRoundedRect(
      u,
      v,
      LCD_LEFT - 2.5,
      LCD_TOP - 2.5,
      -LCD_LEFT + 2.5,
      LCD_TOP + LCD_ROWS + 2.5,
      3,
    )
  ) {
    return state.bezel;
  }
  for (const [x, y] of [
    [-8, 11],
    [0, 13],
    [8, 11],
  ] as const) {
    const distance = Math.hypot(u - x, v - y);
    if (distance <= 2.6) {
      return distance > 1.8 ? scale(state.button, 0.5) : state.button;
    }
  }
  const highlight = ((u + 9) / 5) ** 2 + ((v + 15) / 3) ** 2;
  if (highlight < 1) {
    return mix(state.shell, WHITE, 0.55);
  }
  const shade = Math.max(0, (u * 0.4 + v * 0.8) / SHELL_HALF_HEIGHT - 0.3);
  return scale(state.shell, 1 - 0.35 * shade);
}

function getPetSprite(anger: number, beat: number, kick: number): Sprite {
  if (anger >= 0.75) {
    return kick > 0.35 ? PET_SPRITES.scream : PET_SPRITES.angry;
  }
  if (anger >= 0.4) {
    return PET_SPRITES.angry;
  }
  if (getCycle(beat / 8) > 0.93) {
    return PET_SPRITES.blink;
  }
  return getCycle(beat / 16) > 0.75 ? PET_SPRITES.happy : PET_SPRITES.idle;
}

function getShake(beat: number, amount: number, step: number): [number, number, number] {
  if (amount <= 0) {
    return [0, 0, 0];
  }
  const random = createRandom(hashSeed(SEED, Math.floor(beat * step)));
  return [
    getRandomBetween(random, -1, 1) * amount,
    getRandomBetween(random, -1, 1) * amount,
    getRandomBetween(random, -1, 1) * amount,
  ];
}

export const tamagotchi = defineEffect({
  id: "tamagotchi",
  name: "Tamagotchi",
  kind: "pixel",
  params: z.object({
    shellColor: colorSchema.default("#ff4fa8"),
    buttonColor: colorSchema.default("#ffd23f"),
    screenColor: colorSchema.default("#7fc860"),
    rageColor: colorSchema.default("#ff1a10"),
    anger: z.number().min(0).max(1).default(0),
    every: z.number().min(0.25).max(4).default(1),
    pulse: z.number().min(0).max(1).default(1),
    shake: z.number().min(0).max(1).default(1),
    size: z.number().min(24).max(64).default(56),
    x: z.number().min(0).max(64).default(32),
    y: z.number().min(0).max(64).default(34),
  }),
  render(image, { params, beat }) {
    const anger = params.anger;
    const calm = 1 - anger;
    const { kick } = getBeatKick(beat, params.every);
    const hit = kick * anger * params.pulse;
    const rage = parseColor(params.rageColor);
    const shell = mix(parseColor(params.shellColor), rage, anger * 0.3);
    const flash = hit * 0.4;
    const pet = getPetSprite(anger, beat, kick);
    const isRaging = anger >= 0.75;
    const hop = isRaging
      ? Math.round(getCycle(beat * 2) < 0.5 ? -2 : 0)
      : getCycle(beat / 2) < 0.25 && anger < 0.4
        ? -1
        : 0;
    const wander = isRaging ? 0 : Math.round(4 * Math.sin((beat * Math.PI) / 8));
    const showsHeart = anger < 0.4 && getCycle(beat / 4) < 0.5;
    const state: DeviceState = {
      anger,
      kick,
      flash,
      shell: mix(shell, WHITE, flash),
      outline: mix(scale(shell, 0.4), WHITE, flash * 0.5),
      bezel: mix([28, 24, 40], scale(rage, 0.35), anger),
      button: mix(parseColor(params.buttonColor), WHITE, flash),
      screen: scale(
        mix(parseColor(params.screenColor), rage, anger),
        0.75 + 0.25 * Math.min(1, kick * (0.3 + anger)),
      ),
      ink: mix([16, 40, 12], BLACK, anger),
      pet,
      petColumn: 6 + wander,
      petRow: 4 + hop,
      icon:
        anger >= 0.4
          ? getCycle(beat) < 0.5
            ? VEIN_SPRITE
            : undefined
          : showsHeart
            ? HEART_SPRITE
            : NOTE_SPRITE,
      iconColumn: anger >= 0.4 ? 16 : wander < 0 ? 15 : 2,
      iconRow: anger >= 0.4 ? 1 : getCycle(beat / 4) < 0.5 ? 1 : 0,
    };
    const [shakeX, shakeY, shakeAngle] = getShake(beat, params.shake * anger * (0.4 + kick), 8);
    const bob = Math.round(calm * 1.5 * Math.sin((beat * Math.PI) / 2));
    const size = (params.size / DEVICE_HEIGHT) * (1 + hit * 0.22);
    const angle = shakeAngle * 0.12;
    const centerX = params.x + shakeX * 3;
    const centerY = params.y + bob + shakeY * 3;
    const [sin, cos] = [Math.sin(-angle), Math.cos(-angle)];
    const samples = [0.25, 0.75];
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        let [r, g, b, hits] = [0, 0, 0, 0];
        for (const offsetY of samples) {
          for (const offsetX of samples) {
            const dx = (x + offsetX - centerX) / size;
            const dy = (y + offsetY - centerY) / size;
            const color = getDeviceColor(state, dx * cos - dy * sin, dx * sin + dy * cos);
            if (color) {
              r += color[0];
              g += color[1];
              b += color[2];
              hits++;
            }
          }
        }
        if (hits > 0) {
          setRgbaPixel(image, x, y, [r / hits, g / hits, b / hits], (hits / 4) * 255);
        }
      }
    }
  },
});

function drawSprite(
  image: RgbaImage,
  sprite: Sprite,
  x: number,
  y: number,
  color: Color,
  amount: number,
): void {
  for (const [row, line] of sprite.entries()) {
    for (let column = 0; column < line.length; column++) {
      if (line[column] === "#") {
        blendPixel(image, Math.round(x) + column, Math.round(y) + row, color, amount);
      }
    }
  }
}

export const tamagotchiTwinkle = defineEffect({
  id: "tamagotchi-twinkle",
  name: "Tamagotchi twinkle",
  kind: "pixel",
  params: z.object({
    color1: colorSchema.default("#ff9ec8"),
    color2: colorSchema.default("#8fd8ff"),
    stars: z.number().int().min(0).max(40).default(18),
    floaters: z.number().int().min(0).max(8).default(4),
    amount: z.number().min(0).max(1).default(1),
  }),
  render(image, { params, beat }) {
    if (params.amount <= 0) {
      return;
    }
    const colors = [parseColor(params.color1), parseColor(params.color2)];
    for (let index = 0; index < params.stars; index++) {
      const random = createRandom(hashSeed(SEED, 1, index));
      const x = Math.floor(random() * WIDTH);
      const y = Math.floor(random() * HEIGHT);
      const period = getRandomBetween(random, 3, 7);
      const twinkle = Math.max(0, Math.sin(((beat / period + random()) % 1) * TAU)) ** 3;
      const color = colors[index % colors.length] ?? WHITE;
      blendPixel(image, x, y, color, twinkle * params.amount * 0.8);
      if (twinkle > 0.8) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          blendPixel(image, x + dx, y + dy, color, (twinkle - 0.8) * 2 * params.amount);
        }
      }
    }
    const lifetime = 8;
    for (let index = 0; index < params.floaters; index++) {
      const start = (index * lifetime) / params.floaters;
      const time = beat - start;
      const generation = Math.floor(time / lifetime);
      const age = getCycle(time / lifetime);
      const random = createRandom(hashSeed(SEED, 2, index, generation));
      const side =
        random() < 0.5 ? getRandomBetween(random, 1, 8) : getRandomBetween(random, 52, 59);
      const x = side + 2 * Math.sin(age * TAU * 1.5 + index);
      const y = HEIGHT + 2 - age * (HEIGHT + 10);
      const fade = Math.min(1, age * 5, (1 - age) * 4) * params.amount;
      const sprite = random() < 0.5 ? HEART_SPRITE : NOTE_SPRITE;
      drawSprite(image, sprite, x, y, colors[index % colors.length] ?? WHITE, fade * 0.85);
    }
  },
});

function drawRing(
  image: RgbaImage,
  centerX: number,
  centerY: number,
  radius: number,
  width: number,
  color: Color,
  amount: number,
): void {
  if (amount <= 0) {
    return;
  }
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const distance = Math.hypot(x + 0.5 - centerX, (y + 0.5 - centerY) * 0.85);
      const edge = 1 - Math.abs(distance - radius) / width;
      if (edge > 0) {
        blendPixel(image, x, y, color, Math.min(1, edge * 1.6) * amount);
      }
    }
  }
}

export const tamagotchiBurst = defineEffect({
  id: "tamagotchi-burst",
  name: "Tamagotchi rage burst",
  kind: "pixel",
  params: z.object({
    color1: colorSchema.default("#ff1a10"),
    color2: colorSchema.default("#ffd23f"),
    every: z.number().min(0.25).max(4).default(1),
    rays: z.number().int().min(0).max(24).default(14),
    rings: z.number().min(0).max(1).default(1),
    sparks: z.number().int().min(0).max(40).default(18),
    veins: z.number().int().min(0).max(4).default(2),
    radius: z.number().min(0).max(40).default(27),
    x: z.number().min(0).max(64).default(32),
    y: z.number().min(0).max(64).default(34),
  }),
  render(image, { params, beat }) {
    const colors = [parseColor(params.color1), parseColor(params.color2)] as const;
    const { pulse, kick } = getBeatKick(beat, params.every);
    const age = getCycle(pulse);
    const generation = Math.floor(pulse);
    if (params.rays > 0) {
      const spin = beat * 0.08;
      const reach = params.radius - 6 + 8 * kick;
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const dx = x + 0.5 - params.x;
          const dy = y + 0.5 - params.y;
          const distance = Math.hypot(dx, dy * 0.85);
          if (distance < reach) {
            continue;
          }
          const slot = getCycle(Math.atan2(dy, dx) / TAU + spin) * params.rays;
          const width = Math.abs(getCycle(slot) - 0.5) * 2;
          const ray = Math.floor(slot);
          const edge = (width - 0.72) / 0.28;
          if (edge > 0) {
            const color = colors[ray % 2] ?? WHITE;
            const fade = Math.min(1, (distance - reach) / 4) * (0.35 + 0.65 * kick);
            blendPixel(
              image,
              x,
              y,
              ray % 2 === 0 ? color : scale(color, 0.7),
              Math.min(1, edge * 2) * fade,
            );
          }
        }
      }
    }
    if (params.rings > 0) {
      const radius = params.radius + 2 + age * 40;
      drawRing(
        image,
        params.x,
        params.y,
        radius,
        1.6,
        mix(colors[1], WHITE, kick * 0.5),
        (1 - age) * params.rings,
      );
      drawRing(
        image,
        params.x,
        params.y,
        radius * 0.6 + 12,
        1.1,
        colors[0],
        (1 - age) * 0.7 * params.rings,
      );
    }
    for (let index = 0; index < params.sparks; index++) {
      const random = createRandom(hashSeed(SEED, 3, generation, index));
      const angle = random() * TAU;
      const speed = getRandomBetween(random, 30, 60);
      const travel = params.radius * 0.8 + speed * (1 - (1 - age) ** 2) * 0.8;
      const color = random() < 0.6 ? colors[1] : WHITE;
      const fade = 1 - age;
      for (let trail = 0; trail < 3; trail++) {
        const distance = travel - trail * 2;
        blendPixel(
          image,
          params.x + Math.cos(angle) * distance,
          params.y + Math.sin(angle) * distance,
          color,
          fade * (1 - trail * 0.3),
        );
      }
    }
    for (let index = 0; index < params.veins; index++) {
      const random = createRandom(hashSeed(SEED, 4, generation, index));
      const corner = (generation * 3 + index * 2) % 4;
      const x =
        corner % 2 === 0 ? getRandomBetween(random, 1, 10) : getRandomBetween(random, 49, 58);
      const y = corner < 2 ? getRandomBetween(random, 1, 12) : getRandomBetween(random, 46, 58);
      const pop = age < 0.15 ? 1.4 : 1;
      const fade = Math.min(1, (1 - age) * 2.5);
      for (const [row, line] of VEIN_SPRITE.entries()) {
        for (let column = 0; column < line.length; column++) {
          if (line[column] !== "#") {
            continue;
          }
          const px = x + (column - 2) * pop;
          const py = y + (row - 2) * pop;
          blendPixel(image, px, py, colors[0], fade);
          if (pop > 1) {
            blendPixel(image, px + 1, py, colors[0], fade);
          }
        }
      }
    }
  },
});

import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import {
  type ColorBuffer,
  type Rotation,
  type Vector,
  createRaster,
  getRotation,
  resolveRaster,
} from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import { TAU, catIds, clamp, furParams, getCoat, getSpan, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { addGlow, fillDesk } from "./cat-laptop.ts";
import { type LaptopScreen, drawLaptop, getLaptopScreenPoint } from "./cat-laptop-props.ts";
import {
  type CatPlacement,
  type CatPose,
  type Coat,
  SIT,
  TUCK,
  UNSIT,
  drawCat,
  getCatOffset,
  getCatProjector,
  mix,
  scale,
  setMixedColor,
  setScaledColor,
} from "./cat-model.ts";

const VIEW_PITCH = toRadians(14);
const CAT_YAW = toRadians(-55);
const LAPTOP_YAW = toRadians(40);
const CAT_POSITION: Vector = [0.95, 0.25, -0.15];
const LAPTOP_POSITION: Vector = [-0.75, 0, 0.2];
const DESK_Y = 50;
const SIZE = 12;
const STORY_BEATS = 16;
const HORIZON = 40;
const GRID_DEPTH = 22;
const GRID_COLUMN = 0.45;
const GRID_ROW = 0.5;
const RAIN_SEED = 0x51de;
const RAIN_COLUMNS = 14;
const RAIN_LENGTH = 40;
const GLITCH_SEED = 0x6c17;
const SPARK_SEED = 0x5a4c;
const TUCK_ANGLE = toRadians(62) - Math.PI / 2;
const CYBER_SIZE = 11;
const WHITE: Color = [255, 255, 255];
const SKY: Color = [44, 0, 70];
const FLOOR: Color = [14, 0, 26];
const CODE_BACKGROUND: Color = [6, 16, 40];
const CUBES = [
  { x: 9, y: 11, size: 5, spin: 1, bob: 0 },
  { x: 55, y: 15, size: 6, spin: -1, bob: 0.5 },
  { x: 50, y: 4, size: 4, spin: 2, bob: 0.25 },
] as const;
const CUBE_EDGES = [
  [0, 1],
  [1, 3],
  [3, 2],
  [2, 0],
  [4, 5],
  [5, 7],
  [7, 6],
  [6, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

const cyberParams = {
  ...furParams,
  cat: z.enum(catIds).default("black"),
  neonColor: colorSchema.default("#00f0ff"),
  gridColor: colorSchema.default("#ff28c8"),
  codeColor: colorSchema.default("#30ff60"),
  every: z.number().min(0.25).max(4).default(1),
};

type CyberParams = z.infer<z.ZodObject<typeof cyberParams>>;

type Pulse = { index: number; phase: number; since: number; kick: number };

function getPulse(beat: number, every: number): Pulse {
  const pulse = beat / every;
  const phase = getCycle(pulse);
  const since = phase * every;
  return { index: Math.floor(pulse), phase, since, kick: Math.exp(-since * 7) };
}

function addPixel(image: RgbaImage, x: number, y: number, color: Color, amount = 1): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || amount <= 0) {
    return;
  }
  const offset = (y * WIDTH + x) * 4;
  for (const [channel, value] of color.entries()) {
    image[offset + channel] = Math.min(255, (image[offset + channel] ?? 0) + value * amount);
  }
  image[offset + 3] = 255;
}

function setPixel(image: RgbaImage, x: number, y: number, color: Color): void {
  const offset = (y * WIDTH + x) * 4;
  image[offset] = color[0];
  image[offset + 1] = color[1];
  image[offset + 2] = color[2];
  image[offset + 3] = 255;
}

function addLine(image: RgbaImage, [ax, ay]: Vector, [bx, by]: Vector, color: Color): void {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2) + 1;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const offset = (Math.floor(y) * WIDTH + Math.floor(x)) * 4;
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
      continue;
    }
    for (const [channel, value] of color.entries()) {
      image[offset + channel] = Math.max(image[offset + channel] ?? 0, value);
    }
    image[offset + 3] = 255;
  }
}

function drawSky(image: RgbaImage, gridColor: Color, kick: number): void {
  for (let y = 0; y < HORIZON; y++) {
    const glow = Math.exp((y - HORIZON) / (3 + 2 * kick));
    const color = mix(scale(SKY, (y / HORIZON) ** 2), gridColor, glow * (0.5 + 0.4 * kick));
    for (let x = 0; x < WIDTH; x++) {
      setPixel(image, x, y, color);
    }
  }
}

function drawGrid(image: RgbaImage, beat: number, gridColor: Color, kick: number): void {
  const scroll = getCycle(beat);
  const lineColor = mix(gridColor, WHITE, 0.35 * kick);
  for (let y = HORIZON; y < HEIGHT; y++) {
    const height = y + 0.5 - HORIZON;
    const depth = GRID_DEPTH / height;
    const fade = Math.min(1, height / 6) * (0.55 + 0.45 * kick);
    const row = (Math.round(depth / GRID_ROW + scroll) - scroll) * GRID_ROW;
    const rowDistance = row > 0 ? Math.abs(height - GRID_DEPTH / row) : Infinity;
    for (let x = 0; x < WIDTH; x++) {
      const column = Math.round(((x + 0.5 - WIDTH / 2) * depth) / (GRID_COLUMN * GRID_DEPTH));
      const columnX = WIDTH / 2 + (column * GRID_COLUMN * GRID_DEPTH) / depth;
      const line = Math.max(
        clamp(1.1 - rowDistance),
        clamp(1.1 - Math.abs(x + 0.5 - columnX)) * 0.8,
      );
      setPixel(image, x, y, mix(FLOOR, lineColor, line * fade));
    }
  }
}

function drawRain(image: RgbaImage, beat: number, codeColor: Color, kick: number): void {
  for (let column = 0; column < RAIN_COLUMNS; column++) {
    const random = createRandom(hashSeed(RAIN_SEED, column));
    const x = Math.floor((column + getRandomBetween(random, 0.1, 0.9)) * (WIDTH / RAIN_COLUMNS));
    const speed = random() < 0.5 ? 5 : 10;
    const offset = random() * RAIN_LENGTH;
    const trail = Math.floor(getRandomBetween(random, 4, 9));
    const head = Math.floor((((offset + beat * speed) % RAIN_LENGTH) + RAIN_LENGTH) % RAIN_LENGTH);
    for (let index = 0; index <= trail; index++) {
      const y = head - index;
      if (y < 0 || y >= HORIZON - 2) {
        continue;
      }
      const flicker = createRandom(hashSeed(RAIN_SEED, column, y, Math.floor(beat * 4)))();
      if (index > 0 && flicker < 0.25) {
        continue;
      }
      const fade = (1 - index / (trail + 1)) * (0.45 + 0.55 * kick);
      addPixel(image, x, y, index === 0 ? mix(codeColor, WHITE, 0.6) : codeColor, fade);
    }
  }
}

function drawCubes(image: RgbaImage, beat: number, color: Color, kick: number): void {
  for (const cube of CUBES) {
    const angle = (beat / 8) * TAU * cube.spin;
    const rotate = getRotation(angle + 0.6, angle, 0.3);
    const bob = Math.sin((beat / 4 + cube.bob) * TAU) * 1.5;
    const size = cube.size * (1 + 0.25 * kick);
    const corners = Array.from({ length: 8 }, (_, index): Vector => {
      const [x, y, depth] = rotate([index & 1 ? 1 : -1, index & 2 ? 1 : -1, index & 4 ? 1 : -1]);
      const perspective = 4 / (4 - depth);
      return [
        cube.x + x * size * 0.6 * perspective,
        cube.y + bob - y * size * 0.6 * perspective,
        0,
      ];
    });
    const lineColor = mix(scale(color, 0.7), WHITE, 0.4 * kick);
    for (const [a, b] of CUBE_EDGES) {
      addLine(image, corners[a] ?? [0, 0, 0], corners[b] ?? [0, 0, 0], lineColor);
    }
  }
}

function getNeonCoat(coat: Coat, fur: Color, neon: Color, kick: number): Coat {
  const brightness = 230 / Math.max(1, ...fur);
  const light: ColorBuffer = [0, 0, 0];
  return (part, position, shade, out) => {
    const color = coat(part, position, 1, out);
    if (part === "eye") {
      return setMixedColor(out, color, WHITE, 0.3 + 0.5 * kick);
    }
    const base = setMixedColor(out, setScaledColor(out, color, brightness), neon, 0.1);
    setMixedColor(light, base, WHITE, 0.3);
    return setMixedColor(out, setScaledColor(out, base, 0.35), light, clamp(shade - 0.35));
  };
}

function getFloatPose(beat: number, kick: number): CatPose {
  const paddle = Math.sin(beat * Math.PI);
  return {
    head: getRotation(toRadians(-8 + 12 * kick), toRadians(10 * paddle), 0),
    frontLeftLeg: getRotation(toRadians(-50 + 30 * paddle), 0, toRadians(-25)),
    frontRightLeg: getRotation(toRadians(-50 - 30 * paddle), 0, toRadians(25)),
    backLeftLeg: getRotation(toRadians(30 - 25 * paddle), 0, toRadians(-20)),
    backRightLeg: getRotation(toRadians(30 + 25 * paddle), 0, toRadians(20)),
    tail: getRotation(toRadians(-20), toRadians(40 * Math.sin((beat / 2) * Math.PI)), 0),
  };
}

function getGlitch(pulse: Pulse): number {
  const isBig = ((pulse.index % 4) + 4) % 4 === 3;
  return Math.exp(-pulse.since * (isBig ? 5 : 12)) * (isBig ? 1 : 0.45);
}

function drawGlitchedCat(
  image: RgbaImage,
  cat: RgbaImage,
  neon: Color,
  glitch: number,
  index: number,
): void {
  const split = Math.round(2.5 * glitch);
  const slices = Array.from({ length: HEIGHT / 4 }, (_, slice) => {
    const random = createRandom(hashSeed(GLITCH_SEED, index, slice));
    return random() < 0.4 ? Math.round(getRandomBetween(random, -7, 7) * glitch) : 0;
  });
  const isSolid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT && (cat[(y * WIDTH + x) * 4 + 3] ?? 0) > 110;
  for (let y = 0; y < HEIGHT; y++) {
    const shift = slices[y >> 2] ?? 0;
    for (let x = 0; x < WIDTH; x++) {
      const sourceX = x - shift;
      const red = sourceX + split;
      const blue = sourceX - split;
      const solid = isSolid(sourceX, y);
      const edge =
        !solid &&
        (isSolid(sourceX - 1, y) ||
          isSolid(sourceX + 1, y) ||
          isSolid(sourceX, y - 1) ||
          isSolid(sourceX, y + 1));
      if (edge) {
        setPixel(image, x, y, mix(neon, WHITE, 0.2));
        continue;
      }
      if (!isSolid(red, y) && !solid && !isSolid(blue, y)) {
        continue;
      }
      const offset = (y * WIDTH + x) * 4;
      const sample = (sx: number, channel: number) =>
        isSolid(sx, y)
          ? (cat[(y * WIDTH + sx) * 4 + channel] ?? 0)
          : (image[offset + channel] ?? 0);
      image[offset] = sample(red, 0);
      image[offset + 1] = solid
        ? (cat[(y * WIDTH + sourceX) * 4 + 1] ?? 0)
        : (image[offset + 1] ?? 0);
      image[offset + 2] = sample(blue, 2);
      image[offset + 3] = 255;
    }
  }
}

function drawCyberspace(image: RgbaImage, params: CyberParams, beat: number, appear: number): void {
  const pulse = getPulse(beat, params.every);
  const neon = parseColor(params.neonColor);
  const gridColor = parseColor(params.gridColor);
  drawSky(image, gridColor, pulse.kick);
  drawRain(image, beat, parseColor(params.codeColor), pulse.kick);
  drawGrid(image, beat, gridColor, pulse.kick);
  drawCubes(image, beat, neon, pulse.kick);
  if (appear <= 0) {
    return;
  }
  const fur = parseColor(params.cat === "tabby" ? params.tabbyColor : params.color);
  const bob = Math.sin((beat / 4) * TAU) * 2;
  const pop = easings.easeOutCubic(clamp(appear)) * (1 + 0.15 * Math.sin(clamp(appear) * Math.PI));
  const raster = createRaster();
  drawCat(
    raster,
    {
      x: WIDTH / 2,
      y: 29 + bob - 2 * pulse.kick,
      size: CYBER_SIZE * pop * (1 + 0.08 * pulse.kick),
      rotate: getRotation(
        toRadians(12),
        toRadians(35 * Math.sin((beat / 8) * TAU)),
        toRadians(10 * Math.sin((beat / 4) * TAU)),
      ),
      pose: getFloatPose(beat, pulse.kick),
    },
    getNeonCoat(getCoat(params), fur, neon, pulse.kick),
  );
  const cat = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  resolveRaster(raster, cat);
  drawGlitchedCat(
    image,
    cat,
    neon,
    Math.max(getGlitch(pulse), 1 - clamp(appear * 1.5)),
    pulse.index,
  );
}

function getCodeScreen(beat: number, code: Color): LaptopScreen {
  const scroll = beat * 1.5;
  return (u, v) => {
    const line = (1 - v) * 6 + scroll;
    const index = Math.floor(line);
    const random = createRandom(hashSeed(RAIN_SEED, index));
    const indent = Math.floor(random() * 3) * 0.12;
    const length = indent + getRandomBetween(random, 0.25, 0.75);
    const inText = line - index < 0.55 && u > 0.08 + indent && u < length;
    return inText ? scale(code, 0.85) : CODE_BACKGROUND;
  };
}

function getSwirlScreen(base: LaptopScreen, beat: number, swirl: number, colors: [Color, Color]) {
  return (u: number, v: number): Color => {
    const x = (u - 0.5) * 1.6;
    const y = v - 0.5;
    const radius = Math.hypot(x, y);
    const angle = Math.atan2(y, x);
    const band = Math.sin(angle * 2 + radius * 22 - beat * 6) * 0.5 + 0.5;
    const color = mix(mix(colors[0], colors[1], band), WHITE, clamp(1 - radius * 4) * swirl);
    return mix(base(u, v), color, clamp(swirl * (1.6 - radius * 1.2)));
  };
}

function getTypingPose(phase: number, beat: number): CatPose {
  const nod = Math.exp(-phase * 5);
  const tap = Math.floor(beat) % 2 === 0 ? 1 : -1;
  return {
    head: (vector) => UNSIT(getRotation(toRadians(-5 + 20 * nod), toRadians(25), 0)(vector)),
    frontLeftLeg: getRotation(toRadians(-80 - 25 * Math.max(0, tap) * nod), 0, toRadians(-12)),
    frontRightLeg: getRotation(toRadians(-80 - 25 * Math.max(0, -tap) * nod), 0, toRadians(12)),
    backLeftLeg: TUCK,
    backRightLeg: TUCK,
    tail: getRotation(toRadians(60), 0, 0),
  };
}

function getPulledPose(beat: number, pull: number): CatPose {
  const flail = Math.sin(beat * Math.PI * 4) * pull;
  return {
    head: (vector) => UNSIT(getRotation(toRadians(-25 * pull), toRadians(30), 0)(vector)),
    frontLeftLeg: getRotation(toRadians(-80 - 70 * pull + 25 * flail), 0, toRadians(-20)),
    frontRightLeg: getRotation(toRadians(-80 - 70 * pull - 25 * flail), 0, toRadians(20)),
    backLeftLeg: getRotation(TUCK_ANGLE + toRadians(60 * pull), 0, 0),
    backRightLeg: getRotation(TUCK_ANGLE + toRadians(50 * pull), 0, 0),
    tail: getRotation(toRadians(60 + 60 * pull), toRadians(30 * flail), 0),
  };
}

function getStretchedRotation(rotate: Rotation, [dx, dy]: Vector, stretch: number): Rotation {
  const length = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / length, -dy / length];
  const squeeze = 1 / Math.sqrt(stretch);
  return (vector) => {
    const [x, y, depth] = rotate(vector);
    const along = x * ux + y * uy;
    const [px, py] = [x - along * ux, y - along * uy];
    return [
      px * squeeze + along * ux * stretch,
      py * squeeze + along * uy * stretch,
      depth * squeeze,
    ];
  };
}

function drawSparks(
  image: RgbaImage,
  [centerX, centerY]: Vector,
  story: number,
  amount: number,
  colors: [Color, Color],
): void {
  for (let index = 0; index < 18; index++) {
    const random = createRandom(hashSeed(SPARK_SEED, index));
    const life = getCycle(story * 0.5 + random());
    const radius = (1 - life) * getRandomBetween(random, 14, 30);
    const angle = random() * TAU + life * 5;
    const color = mix(index % 2 ? colors[0] : colors[1], WHITE, life);
    addPixel(
      image,
      Math.floor(centerX + Math.cos(angle) * radius),
      Math.floor(centerY + Math.sin(angle) * radius * 0.7),
      color,
      amount * Math.min(1, life * 4),
    );
  }
}

function drawPortal(image: RgbaImage, params: CyberParams, beat: number, story: number): void {
  const pulse = getPulse(beat, params.every);
  const neon = parseColor(params.neonColor);
  const gridColor = parseColor(params.gridColor);
  const colors: [Color, Color] = [gridColor, neon];
  const coat = getCoat(params);
  const swirl = getSpan(story, 3, 7) * (1 + 0.3 * pulse.kick);
  const pull = getSpan(story, 4, 8);
  const suckSteps = clamp((story - 8) / 5) * 5;
  const suck = Math.min(1, (Math.floor(suckSteps) + easings.easeOutCubic(getCycle(suckSteps))) / 5);
  const view = getRotation(VIEW_PITCH, 0, 0);
  const raster = createRaster();
  fillDesk(raster, DESK_Y);

  const [laptopX, laptopY, laptopDepth] = getCatOffset(view, LAPTOP_POSITION, SIZE);
  const laptopPlacement: CatPlacement = {
    x: WIDTH / 2 + laptopX,
    y: DESK_Y + laptopY - SIZE * 0.25,
    size: SIZE,
    rotate: getRotation(VIEW_PITCH, LAPTOP_YAW, 0),
    depth: laptopDepth,
  };
  const code = parseColor(params.codeColor);
  drawLaptop(raster, laptopPlacement, {
    getScreenColor: getSwirlScreen(getCodeScreen(beat, code), beat, swirl, colors),
  });
  const screen = getCatProjector(laptopPlacement)(getLaptopScreenPoint(0.5, 0.5));

  if (suck < 1) {
    const [catX, catY, catDepth] = getCatOffset(view, CAT_POSITION, SIZE);
    const seatX = WIDTH / 2 + catX;
    const seatY = DESK_Y + catY - SIZE * 0.25;
    const tug = pull * Math.exp(-pulse.since * 6) * (story < 8 ? 1 : 0);
    const lean = pull * 2.5 + tug * 2;
    const lurch = suck > 0 && suck < 1 ? Math.exp(-pulse.since * 6) : 0;
    const stretch = 1 + 0.25 * pull + 0.3 * tug + 0.5 * Math.sin(suck * Math.PI) + 0.3 * lurch;
    const reach = (stretch - 1) * SIZE * 0.5 * (1 - suck);
    const [toX, toY] = [screen[0] - seatX, screen[1] - seatY];
    const distance = Math.hypot(toX, toY) || 1;
    const x = seatX + toX * suck + (toX / distance) * reach - lean;
    const y = seatY + toY * suck + (toY / distance) * reach - pull * 2;
    const seated = getRotation(VIEW_PITCH, CAT_YAW + suck * 2, 0);
    const spin = getRotation(0, 0, suck * suck * TAU * 2);
    const phase = getCycle(beat / params.every);
    drawCat(
      raster,
      {
        x,
        y,
        size: SIZE * (1 - suck) ** 0.7,
        rotate: getStretchedRotation(
          (vector) => spin(seated(SIT(vector))),
          [screen[0] - x, screen[1] - y, 0],
          stretch,
        ),
        depth: suck > 0 ? laptopDepth - 3 : catDepth,
        pose: story < 4 ? getTypingPose(phase, beat / params.every) : getPulledPose(beat, pull),
        flash: 0.4 * suck,
        flashColor: neon,
      },
      coat,
    );
  }
  resolveRaster(raster, image);
  const glow = mix(gridColor, neon, 0.5 + 0.5 * Math.sin(beat * Math.PI));
  addGlow(
    image,
    screen[0],
    screen[1],
    SIZE * (1.2 + 1.2 * swirl + 0.6 * pulse.kick * swirl),
    scale(glow, 0.1 + 0.3 * swirl + 0.2 * clamp((story - 12) / 2)),
  );
  drawSparks(image, screen, story, swirl * (1 - clamp(story - 13)), colors);
}

export const catLaptopPortal = defineEffect({
  id: "cat-laptop-portal",
  name: "Cat laptop portal",
  kind: "pixel",
  params: z.object(cyberParams),
  render(image, { params, progress, beat }) {
    const length = progress > 0 ? beat / progress : STORY_BEATS;
    const story = progress * STORY_BEATS;
    if (story < 14) {
      drawPortal(image, params, beat, story);
    } else {
      drawCyberspace(image, params, beat - length, clamp((story - 14.4) / 1.4));
    }
    const flash = story < 14 ? clamp((story - 13) / 1) ** 2 : clamp(1 - (story - 14) / 1.5);
    if (flash <= 0) {
      return;
    }
    for (let offset = 0; offset < image.length; offset += 4) {
      for (let channel = 0; channel < 3; channel++) {
        image[offset + channel] =
          (image[offset + channel] ?? 0) + (255 - (image[offset + channel] ?? 0)) * flash;
      }
      image[offset + 3] = 255;
    }
  },
});

export const catCyberspace = defineEffect({
  id: "cat-cyberspace",
  name: "Cat cyberspace",
  kind: "pixel",
  params: z.object(cyberParams),
  render(image, { params, beat }) {
    drawCyberspace(image, params, beat, 1);
  },
});

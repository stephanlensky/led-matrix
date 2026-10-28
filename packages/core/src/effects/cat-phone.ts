import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
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
  getRotation,
} from "../mesh.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import {
  type CatId,
  TAU,
  catIds,
  clamp,
  furParams,
  getCoat,
  getSpan,
  toRadians,
} from "./cat-duo.ts";
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
  getShade,
  mix,
  scale,
} from "./cat-model.ts";
import { getOvershoot } from "./cat-wands.ts";
import { type CatFace, type EyeStyle, drawEyes, getCatFace, getEyelessCoat } from "./cat-face.ts";
import { blendPixel, drawHeart, getHeartCoverage } from "./heart.ts";
import { HEART_SEED, drawFloatingHearts, drawSparkles } from "./heart-particles.ts";

type PhonePart = "case" | "screen";

type PhoneScreen = (u: number, v: number) => Color;

type Angles = { pitch: number; yaw?: number; roll?: number };

type PhoneCat = {
  coat: Coat;
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

type PhoneCatPoints = CatFace & { phone: Vector };

const PHONE_HALF: Vector = [0.22, 0.36, 0.05];
const SCREEN_HALF: Vector = [0.17, 0.29, 0.01];
const PAW_TIP: Vector = [0.3, -0.92, 0.35];
const VIEW_PITCH = toRadians(10);
const CAT_YAW = 25;
const SEND_BEATS = 8;
const BUZZ_BEATS = 8;
const SWOOSH_SLOPE = 0.45;
const WHITE: Color = [255, 255, 255];
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
    getShade: (normal) => getShade(placement.rotate(normal)),
    getColor: (part, [x, y], shade) =>
      part === "screen"
        ? screen((x / SCREEN_HALF[0] + 1) / 2, 1 - ((y - 0.2) / SCREEN_HALF[1] + 1) / 2)
        : scale(color, shade),
  });
}

function drawPhoneCat(raster: Raster, cat: PhoneCat): PhoneCatPoints {
  const { side, size } = cat;
  const view = getRotation(VIEW_PITCH, toRadians(CAT_YAW * side) + (cat.turn ?? 0), 0);
  const head = getAngles(cat.head, side);
  const holdJoint: CatJoint = side > 0 ? "frontRightLeg" : "frontLeftLeg";
  const freeJoint: CatJoint = side > 0 ? "frontLeftLeg" : "frontRightLeg";
  const placement: CatPlacement = {
    x: cat.x,
    y: cat.y,
    size,
    rotate: getSquashedRotation((vector) => view(SIT(vector)), cat.squash ?? 0, -0.8),
    pose: {
      head: (vector) => UNSIT(head(vector)),
      [holdJoint]: getAngles(cat.hold, side),
      [freeJoint]: getAngles(cat.free, side),
      backLeftLeg: TUCK,
      backRightLeg: TUCK,
      tail: getRotation(toRadians(60), toRadians(30 * cat.tail), 0),
    },
  };
  drawCat(raster, placement, cat.eyes === "open" ? cat.coat : getEyelessCoat(cat.coat));
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
  return { ...getCatFace(placement), phone };
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

const sceneNames = ["typing", "send", "buzz", "joy"] as const;

const phoneParams = {
  ...furParams,
  scene: z.enum(sceneNames).default("typing"),
  sender: z.enum(catIds).default("tabby"),
  message: z.string().max(24).default("CALL ME?"),
  every: z.number().min(0.25).max(4).default(1),
  heartColor: colorSchema.default("#ff3c78"),
  screenColor: colorSchema.default("#3a8cff"),
  backgroundColor: colorSchema.default("#140c2c"),
  replyBackgroundColor: colorSchema.default("#2a0a26"),
};

type PhoneParams = z.output<z.ZodObject<typeof phoneParams>>;

type Pulse = { pulse: number; phase: number; since: number; kick: number };

function getPulse(beat: number, every: number): Pulse {
  const pulse = beat / every;
  const phase = getCycle(pulse);
  const since = phase * every;
  return { pulse, phase, since, kick: Math.exp(-since * 6) };
}

type PhoneCoat = { coat: Coat; eyeColor: Color };

function getPhoneCoat(params: PhoneParams, cat: CatId): PhoneCoat {
  return {
    coat: getCoat({ ...params, cat }),
    eyeColor: parseColor(cat === "tabby" ? params.tabbyEyeColor : params.eyeColor),
  };
}

type Sender = { story: number; rate: number; look: number; recoil: number };

function drawSender(
  image: RgbaImage,
  params: PhoneParams,
  coat: Coat,
  beat: number,
  { story, rate, look, recoil }: Sender,
): PhoneCatPoints {
  const { pulse, phase, kick } = getPulse(beat * rate, params.every);
  const tap = Math.exp(-phase * 8);
  const sent = clamp((story - 2) * 4);
  const flash = story >= 2 && story < 2.6 ? 1 - (story - 2) / 0.6 : 0.35 * tap * (1 - sent);
  const glow = parseColor(params.screenColor);
  fillRgbaImage(image, scale(parseColor(params.backgroundColor), 1 + 0.5 * kick));
  const raster = createRaster();
  const size = 19 - 4 * recoil;
  const points = drawPhoneCat(raster, {
    coat,
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
  });
  compositeRaster(raster, image);
  return points;
}

function drawSend(
  image: RgbaImage,
  params: PhoneParams,
  coat: Coat,
  beat: number,
  story: number,
): void {
  const heart = parseColor(params.heartColor);
  const pop = easings.easeOutCubic(clamp((story - 2) / 0.6));
  const points = drawSender(image, params, coat, beat, {
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
  { coat, eyeColor }: PhoneCoat,
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
  fillRgbaImage(image, scale(parseColor(params.replyBackgroundColor), 1 + 0.5 * kick + 0.5 * love));
  const raster = createRaster();
  const shake = buzz * Math.sin(story * 60) * (0.5 + buzzKick);
  const lit = story >= 2 ? 1 : 0;
  const glowing = buzz * (Math.floor(story * 4) % 2) * 0.4;
  const points = drawPhoneCat(raster, {
    coat,
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
  drawEyes(
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

function drawJoy(
  image: RgbaImage,
  params: PhoneParams,
  { coat, eyeColor }: PhoneCoat,
  beat: number,
): void {
  const heart = parseColor(params.heartColor);
  const glow = parseColor(params.screenColor);
  const { pulse, phase, since, kick } = getPulse(beat, params.every);
  const index = Math.floor(pulse);
  const isBig = ((index % 4) + 4) % 4 === 3;
  const height = isBig ? 13 : 7;
  const hop = height * 4 * phase * (1 - phase);
  const squash = 0.16 * Math.exp(-since * 9) * Math.cos(since * 25);
  const wave = Math.sin(pulse * TAU);
  const flip = index % 2 === 0 ? 1 : -1;
  fillRgbaImage(image, scale(parseColor(params.replyBackgroundColor), 1 + 0.6 * kick));
  drawHeart(image, {
    x: WIDTH / 2,
    y: 28,
    size: 54 * (1 + 0.07 * kick),
    color: scale(heart, 0.28 + 0.2 * kick),
  });
  drawSparkles(image, pulse, [mix(heart, WHITE, 0.4)], 0.8);
  const raster = createRaster();
  const points = drawPhoneCat(raster, {
    coat,
    side: -1,
    x: WIDTH / 2,
    y: 46 - hop,
    size: 17,
    turn: toRadians(15) - (isBig ? TAU * easings.easeInOutCubic(phase) : 0),
    squash,
    head: { pitch: -12 - 8 * kick, yaw: 0, roll: 12 * flip * Math.sin(phase * Math.PI) },
    hold: { pitch: -150 + 12 * wave, roll: -25 },
    free: { pitch: -140 - 12 * wave, roll: 30 },
    tail: wave,
    phone: {
      offset: [0.05, -0.4],
      rotate: { pitch: 0, yaw: -10, roll: 10 * wave },
      color: LIGHT_PHONE,
      screen: getHeartScreen(glow, heart, pulse, 1),
    },
    eyes: "happy",
  });
  drawFloatingHearts(
    image,
    pulse,
    [WIDTH / 2, 44],
    [heart, mix(heart, WHITE, 0.5), [255, 90, 60]],
    24,
  );
  compositeRaster(raster, image);
  drawEyes(image, points, isBig ? "hearts" : "happy", eyeColor, heart, 1);
}

export const catPhone = defineEffect({
  id: "cat-phone",
  name: "Cat phone",
  kind: "pixel",
  params: z.object(phoneParams),
  render(image, { params, beat, progress }) {
    const senderCoat = getCoat({ ...params, cat: params.sender });
    const receiverCoat = getPhoneCoat(params, params.sender === "tabby" ? "black" : "tabby");
    if (params.scene === "typing") {
      drawSender(image, params, senderCoat, beat, { story: 0, rate: 1, look: 0, recoil: 0 });
    } else if (params.scene === "send") {
      drawSend(image, params, senderCoat, beat, progress * SEND_BEATS);
    } else if (params.scene === "buzz") {
      drawReceiver(image, params, receiverCoat, beat, progress * BUZZ_BEATS);
    } else {
      drawJoy(image, params, receiverCoat, beat);
    }
  },
});

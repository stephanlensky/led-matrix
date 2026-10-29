import { z } from "zod";
import { colorSchema, parseColor } from "../../color.ts";
import { defineEffect } from "../../effect.ts";
import type { Color, RgbaImage } from "../../frame.ts";
import { HEIGHT, WIDTH, setRgbaPixel } from "../../frame.ts";
import { createRandom, getRandomBetween, hashSeed } from "../../random.ts";
import {
  BLOOD_COLOR,
  DRIED_COLOR,
  type Point,
  drawDot,
  drawDrip,
  drawStreak,
  getBallisticPosition,
  getCycle,
  getEnvelope,
  getMixedColor,
  getModulo,
  getNoise,
  getScaledColor,
  getSmoothNoise,
  getSplatShape,
} from "./shared.ts";

const SHAKE_SEED = 0xb1500;
const DRIP_SEED = 0xb1501;
const SPRAY_SEED = 0xb1502;
const BORDER_SEED = 0xb1503;
const TEXTURE_SEED = 0xb1504;
const CORNER_SEED = 0xb1505;
const CENTER_X = WIDTH / 2 - 0.5;
const HEAD_CENTER_Y = 30;
const HEAD_RADIUS_X = 15.5;
const HEAD_RADIUS_Y = 22;
const EYE_Y = 25;
const EYE_OFFSET_X = 7;
const MOUTH_Y = 43;
const GRAVITY = 160;
const SPRAY_LIFE = 1.2;
const SIDE_STREAMS = 3;

function drawLine(
  image: RgbaImage,
  [startX, startY]: Point,
  [endX, endY]: Point,
  color: Color,
): void {
  const samples = Math.max(1, Math.ceil(Math.hypot(endX - startX, endY - startY) * 2));
  for (let sample = 0; sample <= samples; sample++) {
    const along = sample / samples;
    setRgbaPixel(
      image,
      Math.round(startX + (endX - startX) * along),
      Math.round(startY + (endY - startY) * along),
      color,
    );
  }
}

function drawPolyline(image: RgbaImage, points: readonly Point[], color: Color): void {
  for (let index = 1; index < points.length; index++) {
    drawLine(image, points[index - 1] ?? [0, 0], points[index] ?? [0, 0], color);
  }
}

function getEllipsePoints(
  [centerX, centerY]: Point,
  radiusX: number,
  radiusY: number,
  from = 0,
  to = Math.PI * 2,
): Point[] {
  const samples = 48;
  return Array.from({ length: samples + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / samples;
    return [centerX + Math.cos(angle) * radiusX, centerY + Math.sin(angle) * radiusY];
  });
}

function fillEllipse(
  image: RgbaImage,
  [centerX, centerY]: Point,
  radiusX: number,
  radiusY: number,
  getColor: (distance: number) => Color,
): void {
  for (let y = Math.floor(centerY - radiusY); y <= Math.ceil(centerY + radiusY); y++) {
    for (let x = Math.floor(centerX - radiusX); x <= Math.ceil(centerX + radiusX); x++) {
      const distance = Math.hypot((x - centerX) / radiusX, (y - centerY) / radiusY);
      if (distance <= 1) {
        setRgbaPixel(image, x, y, getColor(distance));
      }
    }
  }
}

function getHeadPoints([offsetX, offsetY]: Point, stretch: number): Point[] {
  const samples = 96;
  return Array.from({ length: samples + 1 }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2;
    const unitY = Math.sin(angle);
    const y = HEAD_CENTER_Y + unitY * HEAD_RADIUS_Y * (unitY > 0 ? stretch : 1);
    const pinch = 1 - 0.2 * Math.exp(-(((y - 38) / 6) ** 2));
    const chin = unitY > 0.4 ? 1 - 0.35 * ((unitY - 0.4) / 0.6) ** 1.5 : 1;
    const temple = unitY < -0.2 ? 1 + 0.06 * Math.sin(((-unitY - 0.2) / 0.8) * Math.PI) : 1;
    return [
      CENTER_X + offsetX + Math.cos(angle) * HEAD_RADIUS_X * pinch * chin * temple,
      y + offsetY,
    ];
  });
}

function drawFace(
  image: RgbaImage,
  color: Color,
  scream: number,
  beat: number,
  [offsetX, offsetY]: Point,
): void {
  const line = getScaledColor(color, 1.1 + 0.6 * scream);
  const dim = getScaledColor(color, 0.7 + 0.4 * scream);
  const stretch = 1 + 0.06 * scream;
  const head = getHeadPoints([offsetX, offsetY], stretch);
  drawPolyline(image, head, line);

  for (const side of [-1, 1]) {
    const eye: Point = [CENTER_X + offsetX + side * EYE_OFFSET_X, EYE_Y + offsetY];
    const eyeRadiusX = 3.6 + 0.4 * scream;
    const eyeRadiusY = 4.6 + 0.6 * scream;
    fillEllipse(image, eye, eyeRadiusX, eyeRadiusY, () => [0, 0, 0]);
    drawPolyline(image, getEllipsePoints(eye, eyeRadiusX, eyeRadiusY), line);
    const tremble = Math.round(Math.sin(beat * Math.PI * 8 + side) * 0.6);
    drawDot(image, [eye[0] - 0.5 + tremble, eye[1] - 0.5], 2, getScaledColor(color, 1.8));
    drawPolyline(
      image,
      getEllipsePoints([eye[0], eye[1] + 1], eyeRadiusX + 1.5, eyeRadiusY + 1.5, 0.35, 2.8),
      getScaledColor(color, 0.4),
    );

    const lift = 2 * scream;
    drawLine(
      image,
      [eye[0] - side * 1.5, eye[1] - 7.5 - lift],
      [eye[0] + side * 4.5, eye[1] - 5 - lift * 0.5],
      line,
    );
    drawLine(
      image,
      [eye[0] - side * 1.5, eye[1] - 7.5 - lift],
      [eye[0] - side * 3, eye[1] - 8.5 - lift],
      line,
    );

    const nostril: Point = [CENTER_X + offsetX + side * 1.5, 34 + offsetY];
    setRgbaPixel(image, Math.round(nostril[0]), Math.round(nostril[1]), dim);
    drawPolyline(
      image,
      [
        [CENTER_X + offsetX + side * 4, 33 + offsetY],
        [CENTER_X + offsetX + side * 7, 38 + offsetY],
        [CENTER_X + offsetX + side * 8, 44 + offsetY],
        [CENTER_X + offsetX + side * 7, 49 + offsetY],
      ],
      dim,
    );
  }
  drawLine(image, [CENTER_X + offsetX, 28 + offsetY], [CENTER_X + offsetX, 32 + offsetY], dim);

  const mouth: Point = [CENTER_X + offsetX, MOUTH_Y + offsetY + scream];
  const mouthRadiusX = 3.8 + 0.6 * scream;
  const mouthRadiusY = 5 + 2 * scream;
  fillEllipse(image, mouth, mouthRadiusX, mouthRadiusY, (distance) =>
    getScaledColor(DRIED_COLOR, 0.2 + 0.6 * distance ** 2),
  );
  drawPolyline(image, getEllipsePoints(mouth, mouthRadiusX, mouthRadiusY), line);
  drawPolyline(
    image,
    getEllipsePoints([mouth[0], mouth[1] + 2], mouthRadiusX - 1.5, mouthRadiusY - 3, 3.6, 5.8),
    getScaledColor(color, 0.5),
  );
}

function drawFaceDrips(
  image: RgbaImage,
  color: Color,
  beat: number,
  [offsetX, offsetY]: Point,
): void {
  const sources: { x: number; top: number; length: number; beats: number }[] = [
    { x: -EYE_OFFSET_X - 1, top: EYE_Y + 5, length: 12, beats: 4 },
    { x: -EYE_OFFSET_X + 1, top: EYE_Y + 5, length: 8, beats: 2 },
    { x: EYE_OFFSET_X, top: EYE_Y + 5, length: 14, beats: 4 },
    { x: EYE_OFFSET_X + 2, top: EYE_Y + 4, length: 6, beats: 2 },
    { x: -1, top: MOUTH_Y + 6, length: 9, beats: 2 },
    { x: 1, top: MOUTH_Y + 6, length: 6, beats: 4 },
    { x: -6, top: 51, length: 7, beats: 4 },
    { x: 5, top: 51, length: 9, beats: 8 },
  ];
  for (const [index, source] of sources.entries()) {
    const random = createRandom(hashSeed(DRIP_SEED, index));
    drawDrip(image, {
      x: Math.round(CENTER_X + offsetX + source.x),
      top: Math.round(source.top + offsetY),
      width: index % 3 === 0 ? 2 : 1,
      length: source.length,
      cycle: getCycle(beat / source.beats + random()),
      trail: 0.6,
      color: getScaledColor(color, 1.2),
    });
  }
}

function drawSpray(
  image: RgbaImage,
  color: Color,
  beat: number,
  every: number,
  count: number,
  period: number,
  origin: Point,
): void {
  if (count === 0) {
    return;
  }
  const perPeriod = Math.max(1, Math.round(period / every));
  const last = Math.floor(beat / every);
  for (let index = last - Math.ceil(SPRAY_LIFE / every); index <= last; index++) {
    const age = beat - index * every;
    if (age < 0 || age > SPRAY_LIFE) {
      continue;
    }
    const random = createRandom(hashSeed(SPRAY_SEED, getModulo(index, perPeriod)));
    for (let particle = 0; particle < count; particle++) {
      const time = age - random() * 0.1;
      const angle = Math.PI / 2 + getRandomBetween(random, -1.5, 1.5);
      const speed = getRandomBetween(random, 30, 75);
      const velocity: Point = [Math.cos(angle) * speed, Math.sin(angle) * speed - 40];
      const size = random() < 0.25 ? 2 : 1;
      if (time < 0) {
        continue;
      }
      const head = getBallisticPosition(origin, velocity, GRAVITY, time);
      if (head[1] > HEIGHT + 2) {
        continue;
      }
      const tail = getBallisticPosition(origin, velocity, GRAVITY, Math.max(0, time - 0.05));
      const particleColor = getScaledColor(color, getRandomBetween(random, 1.1, 1.6));
      drawStreak(image, tail, head, particleColor);
      drawDot(image, head, size, particleColor);
    }
  }
}

function getTexturedColor(color: Color, x: number, y: number, dryness: number): Color {
  return getScaledColor(
    getMixedColor(color, DRIED_COLOR, dryness),
    0.6 + 0.4 * getNoise(TEXTURE_SEED, x, y),
  );
}

function getBorderTop(x: number): number {
  return 2 + Math.round(getSmoothNoise(BORDER_SEED, x / 4) * 3);
}

function getBorderSide(y: number, side: number): number {
  return 2 + Math.round(getSmoothNoise(hashSeed(BORDER_SEED, side), y / 5) * 2);
}

function drawBorder(image: RgbaImage, color: Color, beat: number, scream: number): void {
  for (let x = 0; x < WIDTH; x++) {
    const top = getBorderTop(x);
    for (let y = 0; y < top; y++) {
      setRgbaPixel(image, x, y, getTexturedColor(color, x, y, 0.5 * (1 - y / top)));
    }
    const ripple = Math.sin(x * 0.4 + beat * Math.PI * 0.5) + Math.sin(x * 0.17 - beat * Math.PI);
    const poolTop = HEIGHT - 4 - Math.round(ripple * 0.7 + scream * 1.5);
    for (let y = poolTop; y < HEIGHT; y++) {
      const shade = y === poolTop ? 1.2 : 0.9;
      setRgbaPixel(image, x, y, getScaledColor(getTexturedColor(color, x, y + 64, 0), shade));
    }
  }

  for (const side of [0, 1]) {
    for (let y = 0; y < HEIGHT; y++) {
      const width = getBorderSide(y, side);
      for (let column = 0; column < width; column++) {
        const x = side === 0 ? column : WIDTH - 1 - column;
        const flow = getCycle(y / 16 - beat / 2 + side * 0.5);
        const shade = 0.75 + 0.5 * Math.max(0, 1 - flow * 4);
        setRgbaPixel(image, x, y, getScaledColor(getTexturedColor(color, x, y, 0.2), shade));
      }
    }
    for (let stream = 0; stream < SIDE_STREAMS; stream++) {
      const random = createRandom(hashSeed(BORDER_SEED, side, stream));
      const top = Math.round(getRandomBetween(random, 4, 40));
      const width = getBorderSide(top, side);
      const x = side === 0 ? width : WIDTH - 1 - width;
      drawDrip(image, {
        x,
        top,
        width: 1,
        length: Math.round(getRandomBetween(random, 4, 10)),
        cycle: getCycle(beat / (random() < 0.5 ? 4 : 8) + random()),
        trail: 0.3,
        color,
      });
    }
  }

  const drips = 12;
  for (let index = 0; index < drips; index++) {
    const random = createRandom(hashSeed(DRIP_SEED, 100 + index));
    const x = Math.floor(((index + getRandomBetween(random, 0.15, 0.85)) / drips) * WIDTH);
    drawDrip(image, {
      x,
      top: getBorderTop(x),
      width: random() < 0.35 ? 2 : 1,
      length: Math.round(getRandomBetween(random, 3, 9)),
      cycle: getCycle(beat / (random() < 0.5 ? 2 : 4) + random()),
      trail: 0.25,
      color,
    });
  }

  for (const [index, corner] of (
    [
      [0, 0],
      [WIDTH - 1, 0],
      [0, HEIGHT - 1],
      [WIDTH - 1, HEIGHT - 1],
    ] as const
  ).entries()) {
    const random = createRandom(hashSeed(CORNER_SEED, index));
    const getEdge = getSplatShape(random, 5 + 2 * scream);
    for (let y = 0; y < 18; y++) {
      for (let x = 0; x < 18; x++) {
        const pixelX = corner[0] === 0 ? x : WIDTH - 1 - x;
        const pixelY = corner[1] === 0 ? y : HEIGHT - 1 - y;
        const distance = Math.hypot(pixelX - corner[0], pixelY - corner[1]);
        const angle = Math.atan2(pixelY - corner[1], pixelX - corner[0]);
        if (distance <= getEdge(angle)) {
          setRgbaPixel(image, pixelX, pixelY, getTexturedColor(color, pixelX, pixelY, 0.3));
        }
      }
    }
    for (let speck = 0; speck < 8; speck++) {
      const angle = random() * Math.PI * 2;
      const distance = getRandomBetween(random, 9, 15);
      drawDot(
        image,
        [
          corner[0] + Math.abs(Math.cos(angle)) * distance * (corner[0] === 0 ? 1 : -1),
          corner[1] + Math.abs(Math.sin(angle)) * distance * (corner[1] === 0 ? 1 : -1),
        ],
        random() < 0.3 ? 2 : 1,
        getScaledColor(color, 0.9),
      );
    }
  }
}

function invertImage(image: RgbaImage, [r, g, b]: Color, ink: Color): void {
  const peak = Math.max(...ink, 1);
  for (let offset = 0; offset < image.length; offset += 4) {
    const value = Math.max(image[offset] ?? 0, image[offset + 1] ?? 0, image[offset + 2] ?? 0);
    const shade = 1 - Math.min(1, value / peak);
    image[offset] = r * shade;
    image[offset + 1] = g * shade;
    image[offset + 2] = b * shade;
    image[offset + 3] = 255;
  }
}

export const bloodScream = defineEffect({
  id: "blood-scream",
  name: "Screaming face",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    color: colorSchema.default(BLOOD_COLOR),
    screamEvery: z.number().min(0.25).max(8).default(1),
    shake: z.number().min(0).max(3).default(1),
    spray: z.number().int().min(0).max(64).default(18),
    strobeEvery: z.number().min(0).max(4).default(0),
    strobeDuty: z.number().min(0.05).max(0.95).default(0.3),
    strobeColor: colorSchema.default("#ff0000"),
    period: z.number().int().min(1).max(256).default(8),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const scream = getEnvelope(beat / params.screamEvery, 4);
    const step = Math.floor(beat * 8);
    const offset: Point = [
      Math.round((getNoise(SHAKE_SEED, step, 0) - 0.5) * 2 * params.shake * (0.3 + scream)),
      Math.round((getNoise(SHAKE_SEED, step, 1) - 0.5) * 2 * params.shake * (0.3 + scream)),
    ];

    drawBorder(image, color, beat, scream);
    drawFaceDrips(image, color, beat, offset);
    drawFace(image, color, scream, beat, offset);
    drawSpray(image, color, beat, params.screamEvery, params.spray, params.period, [
      CENTER_X + offset[0],
      MOUTH_Y + 6 + offset[1],
    ]);

    if (params.strobeEvery > 0 && getCycle(beat / params.strobeEvery) < params.strobeDuty) {
      invertImage(image, parseColor(params.strobeColor), color);
    }
  },
});

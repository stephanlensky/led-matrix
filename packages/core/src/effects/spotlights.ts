import { z } from "zod";
import { colorSchema } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";
import { getSmoothNoise } from "./blood/shared.ts";
import { TAU, toRadians } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { getPalette, getPaletteColor, paletteParams } from "./palette.ts";

const HAZE_SEED = 0x5b07;
const SOURCE_OFFSET = 4;
const REACH = HEIGHT * 1.5;
const SPOT_DEPTH = 0.3;

export const spotlightOrigins = ["bottom", "top", "both"] as const;

type Beam = {
  x: number;
  y: number;
  directionX: number;
  directionY: number;
  spread: number;
  color: Color;
  spot?: { x: number; y: number; radiusX: number; radiusY: number };
};

function getBeams(
  count: number,
  origin: (typeof spotlightOrigins)[number],
  beat: number,
  every: number,
  sweep: number,
  width: number,
  floor: number,
  palette: readonly Color[],
): Beam[] {
  return Array.from({ length: count }, (_, index) => {
    const isTop = origin === "top" || (origin === "both" && index % 2 === 1);
    const x = ((index + 0.5) / count) * WIDTH;
    const y = isTop ? -SOURCE_OFFSET : HEIGHT + SOURCE_OFFSET;
    const lean = ((WIDTH / 2 - x) / WIDTH) * 0.6;
    const phase = index % 2 === 0 ? 0 : Math.PI;
    const angle = lean + toRadians(sweep) * Math.sin((beat / every) * TAU + phase);
    const directionX = Math.sin(angle);
    const directionY = isTop ? Math.cos(angle) : -Math.cos(angle);
    const spread = Math.tan(toRadians(width) / 2);
    const distance = (floor - y) / directionY;
    const radiusX = (distance * spread + 0.6) / directionY;
    return {
      x,
      y,
      directionX,
      directionY,
      spread,
      color: getPaletteColor(palette, index),
      spot: isTop
        ? {
            x: x + directionX * distance,
            y: floor,
            radiusX,
            radiusY: Math.max(1.5, radiusX * SPOT_DEPTH),
          }
        : undefined,
    };
  });
}

function getSpotLight({ spot }: Beam, x: number, y: number): number {
  if (!spot) {
    return 0;
  }
  const distance = ((x - spot.x) / spot.radiusX) ** 2 + ((y - spot.y) / spot.radiusY) ** 2;
  return distance < 1 ? 0.5 + 0.5 * (1 - distance) : 0;
}

function getBeamLight(beam: Beam, x: number, y: number, beat: number, index: number): number {
  const spot = getSpotLight(beam, x, y);
  if (beam.spot && y > beam.spot.y) {
    return spot;
  }
  const offsetX = x - beam.x;
  const offsetY = y - beam.y;
  const along = offsetX * beam.directionX + offsetY * beam.directionY;
  if (along <= 0) {
    return spot;
  }
  const across = Math.abs(offsetX * beam.directionY - offsetY * beam.directionX);
  const edge = across / (along * beam.spread + 0.6);
  if (edge >= 1) {
    return spot;
  }
  const body = (1 - edge * edge) ** 1.5;
  const falloff = Math.max(0, 1 - along / REACH) ** 0.8;
  const haze = 0.75 + 0.25 * getSmoothNoise(HAZE_SEED + index, along * 0.12 - beat * 0.6);
  return Math.max(spot, body * 0.55 * falloff * haze);
}

export const spotlights = defineEffect({
  id: "spotlights",
  name: "Spotlights",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    ...paletteParams,
    color1: colorSchema.default("#3c70ff"),
    color2: colorSchema.default("#00c8ff"),
    color3: colorSchema.default("#80b0ff"),
    colorCount: z.number().int().min(1).max(4).default(3),
    count: z.number().int().min(1).max(8).default(4),
    origin: z.enum(spotlightOrigins).default("top"),
    every: z.number().min(1).max(32).default(8),
    sweep: z.number().min(0).max(60).default(22),
    width: z.number().min(2).max(40).default(18),
    floor: z.number().min(32).max(64).default(56),
    intensity: z.number().min(0).max(1).default(0.85),
    pulse: z.number().min(0).max(1).default(0.35),
  }),
  render(image, { params, beat }) {
    const palette = getPalette(params);
    const beams = getBeams(
      params.count,
      params.origin,
      beat,
      params.every,
      params.sweep,
      params.width,
      params.floor,
      palette,
    );
    const kick = Math.exp(-getCycle(beat) * 5);
    const brightness = params.intensity * (1 - params.pulse + params.pulse * kick);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        let [r, g, b] = [0, 0, 0];
        for (const [index, beam] of beams.entries()) {
          const light = getBeamLight(beam, x + 0.5, y + 0.5, beat, index) * brightness;
          r += beam.color[0] * light;
          g += beam.color[1] * light;
          b += beam.color[2] * light;
        }
        if (r + g + b > 6) {
          setRgbaPixel(image, x, y, [Math.min(255, r), Math.min(255, g), Math.min(255, b)]);
        }
      }
    }
  },
});

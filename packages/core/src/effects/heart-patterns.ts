import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, WIDTH, setRgbaPixel } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { TAU, clamp } from "./cat-duo.ts";
import { getCycle } from "./cat-dance.ts";
import { mix, scale } from "./cat-model.ts";
import { blendPixel, drawHeart, getHeartSize } from "./heart.ts";
import { getBeatKick } from "./heart-pulse.ts";

const WHITE: Color = [255, 255, 255];
const BLACK: Color = [0, 0, 0];

const motions = ["surge", "steady"] as const;

const RIPPLE_DELAY = 0.08;

function getRippleTone(
  tone: Color,
  glow: Color,
  pulse: number,
  band: number,
  params: { every: number; ripple: number },
): Color {
  const since = getCycle(pulse - Math.max(0, band) * RIPPLE_DELAY) * params.every;
  return mix(tone, glow, 0.6 * params.ripple * Math.exp(-since * 7));
}

export const heartZoom = defineEffect({
  id: "heart-zoom",
  name: "Heart zoom",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    outlineColor: colorSchema.default("#ffb6d5"),
    outline: z.number().min(0).max(3).default(0),
    every: z.number().min(0.25).max(4).default(1),
    speed: z.number().min(0).max(2).default(0.5),
    ratio: z.number().min(1.3).max(3).default(1.7),
    motion: z.enum(motions).default("surge"),
    surge: z.number().min(0).max(1).default(0.8),
    flash: z.number().min(0).max(1).default(0.5),
    ripple: z.number().min(0).max(1).default(0),
    swell: z.number().min(0).max(2).default(0),
    brightness: z.number().min(0).max(1).default(1),
    y: z.number().min(0).max(64).default(32),
  }),
  render(image, { params, beat }) {
    const { pulse, kick } = getBeatKick(beat, params.every);
    const cycle = getCycle(pulse);
    const surge = params.motion === "steady" ? 0 : params.surge;
    const step = cycle + (easings.easeOutCubic(cycle) - cycle) * surge;
    const phase = (Math.floor(pulse) + step) * params.speed * params.every;
    const light = params.brightness * (1 + params.flash * 0.6 * kick);
    const tones: readonly Color[] = [
      scale(mix(parseColor(params.color), WHITE, 0.3 * params.flash * kick), light),
      BLACK,
    ];
    const outline = scale(parseColor(params.outlineColor), light);
    const glow = mix(tones[0] ?? WHITE, WHITE, 0.5);
    const outlineWidth = params.outline * (1 + params.swell * kick);
    const average = mix(tones[0] ?? WHITE, tones[1] ?? WHITE, 0.5);
    const logRatio = Math.log(params.ratio);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const dx = x + 0.5 - WIDTH / 2;
        const dy = y + 0.5 - params.y;
        const band = Math.log(Math.max(1e-3, getHeartSize(dx, dy))) / logRatio - phase;
        const index = Math.floor(band);
        const bandPixels = Math.max(1e-3, Math.hypot(dx, dy) * logRatio);
        const fraction = band - index;
        const edge = Math.min(fraction, 1 - fraction) * bandPixels;
        let own = tones[((index % 2) + 2) % 2] ?? WHITE;
        let other = tones[(((index + 1) % 2) + 2) % 2] ?? WHITE;
        if (params.ripple > 0) {
          own = getRippleTone(own, glow, pulse, index + phase, params);
          other = getRippleTone(other, glow, pulse, index + 1 + phase, params);
        }
        let color = mix(other, own, 0.5 + clamp(edge) * 0.5);
        if (outlineWidth > 0) {
          color = mix(color, outline, clamp(outlineWidth / 2 + 0.5 - edge));
        }
        setRgbaPixel(image, x, y, mix(average, color, clamp(bandPixels / 2 - 0.5)));
      }
    }
  },
});

const gridWaves = ["ripple", "diagonal", "checker"] as const;

function getGridOffset(wave: (typeof gridWaves)[number], x: number, y: number): number {
  if (wave === "diagonal") {
    return getCycle((x + y) / (WIDTH * 2));
  }
  return Math.hypot(x - WIDTH / 2, y - HEIGHT / 2) / 48;
}

export const heartGrid = defineEffect({
  id: "heart-grid",
  name: "Heart grid",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.25).max(4).default(1),
    wave: z.enum(gridWaves).default("ripple"),
    spacing: z.number().min(8).max(32).default(16),
    size: z.number().min(0.2).max(1).default(0.6),
    pop: z.number().min(0).max(1).default(0.5),
    scroll: z.number().min(-8).max(8).default(2),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const pulse = beat / params.every;
    const spacing = params.spacing;
    const shift = getCycle((beat * params.scroll) / spacing) * spacing;
    const isChecker = params.wave === "checker";
    const period = isChecker ? 2 : 1;
    const count = Math.ceil(WIDTH / spacing) + 1;
    for (let row = -1; row < count; row++) {
      for (let column = -1; column < count; column++) {
        const x = column * spacing + shift + spacing / 2;
        const y = row * spacing + shift + spacing / 2;
        const parity = (((column + row) % 2) + 2) % 2;
        const offset = isChecker ? parity : getGridOffset(params.wave, x, y);
        const kick = Math.exp(-getCycle((pulse - offset) / period) * period * 5);
        const tone = parity === 1 ? mix(color, WHITE, 0.35) : color;
        drawHeart(image, {
          x,
          y,
          size: spacing * params.size * (1 + params.pop * kick),
          color: mix(scale(tone, 0.7), mix(tone, WHITE, 0.35), kick),
        });
      }
    }
  },
});

export function getLubDub(cycle: number): number {
  const lub = Math.exp(-cycle * 9);
  const dub = cycle >= 0.22 ? Math.exp(-(cycle - 0.22) * 11) * 0.65 : 0;
  return Math.max(lub, dub);
}

export function getTrace(time: number): number {
  const cycle = getCycle(time);
  const spike = (center: number, width: number, height: number): number =>
    height * Math.exp(-(((cycle - center) / width) ** 2));
  return (
    spike(0.0, 0.018, 1) +
    spike(1, 0.018, 1) -
    spike(0.04, 0.02, 0.35) +
    spike(0.22, 0.02, 0.55) -
    spike(0.26, 0.02, 0.2) +
    spike(0.55, 0.07, 0.12) -
    spike(0.96, 0.02, 0.2)
  );
}

export const heartEcg = defineEffect({
  id: "heart-ecg",
  name: "Heartbeat monitor",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    traceColor: colorSchema.default("#ffb6d5"),
    every: z.number().min(0.25).max(4).default(1),
    sweep: z.number().min(1).max(8).default(2),
    size: z.number().min(0).max(50).default(30),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const trace = parseColor(params.traceColor);
    const pulse = beat / params.every;
    const thump = getLubDub(getCycle(pulse));
    if (params.size > 0) {
      const size = params.size * (1 + 0.16 * thump);
      drawHeart(image, {
        x: WIDTH / 2,
        y: 24,
        size,
        color: mix(scale(color, 0.8), mix(color, WHITE, 0.25), thump),
        outline: mix(color, WHITE, 0.5 + 0.3 * thump),
      });
      drawHeart(image, {
        x: WIDTH / 2 - size * 0.24,
        y: 24 - size * 0.22,
        size: size * 0.16,
        color: mix(color, WHITE, 0.7),
        angle: -0.5,
      });
    }
    const baseline = 52;
    const head = getCycle(beat / params.sweep) * WIDTH;
    const beatsPerPixel = params.sweep / WIDTH;
    let previous: number | undefined;
    for (let x = 0; x < WIDTH; x++) {
      const behind = getCycle((head - x - 0.5) / WIDTH) * WIDTH;
      const time = (beat - behind * beatsPerPixel) / params.every;
      const level = Math.round(baseline - getTrace(time) * 16);
      const fade = clamp(1.15 - behind / WIDTH);
      const top = previous === undefined || behind > WIDTH - 2 ? level : Math.min(previous, level);
      const bottom =
        previous === undefined || behind > WIDTH - 2 ? level : Math.max(previous, level);
      for (let y = top; y <= bottom; y++) {
        blendPixel(image, x, y, mix(trace, WHITE, behind < 3 ? 0.6 : 0), fade);
      }
      previous = level;
    }
  },
});

export const heartTunnel = defineEffect({
  id: "heart-tunnel",
  name: "Heart tunnel",
  kind: "pixel",
  params: z.object({
    color: colorSchema.default("#ff2a6d"),
    every: z.number().min(0.25).max(4).default(1),
    count: z.number().int().min(3).max(12).default(7),
    growth: z.number().min(1.2).max(3).default(1.8),
    spin: z.number().min(-1).max(1).default(0.15),
    motion: z.enum(motions).default("surge"),
    pop: z.number().min(0).max(1).default(0),
  }),
  render(image, { params, beat }) {
    const color = parseColor(params.color);
    const pulse = beat / params.every;
    const newest = Math.floor(pulse);
    const kick = Math.exp(-getCycle(pulse) * 6);
    const isSteady = params.motion === "steady";
    const tones: readonly Color[] = [color, mix(color, WHITE, 0.45)];
    const slot = TAU / params.count;
    const steps = Math.ceil(Math.log(24) / Math.log(params.growth)) + 1;
    for (let ring = newest - steps; ring <= newest; ring++) {
      const age = pulse - ring;
      const surge = isSteady ? age : Math.floor(age) + easings.easeOutCubic(getCycle(age));
      const radius = 2.2 * params.growth ** surge;
      const parity = ((ring % 2) + 2) % 2;
      const turn = parity * (slot / 2) + (parity === 0 ? 1 : -1) * params.spin * surge;
      const size = Math.min(radius * 0.8, radius * slot * 0.55) * (1 + params.pop * kick);
      const tone = mix(tones[parity] ?? WHITE, WHITE, 0.5 * params.pop * kick);
      const amount = clamp(age * 3);
      if (radius - size > 46) {
        continue;
      }
      for (let index = 0; index < params.count; index++) {
        const angle = turn + index * slot;
        drawHeart(image, {
          x: WIDTH / 2 + Math.cos(angle) * radius,
          y: HEIGHT / 2 + Math.sin(angle) * radius,
          size,
          color: scale(tone, amount * clamp(0.35 + radius / 30)),
          angle: angle - Math.PI / 2,
        });
      }
    }
    drawHeart(image, {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      size: 5 + 3 * kick,
      color: mix(color, WHITE, 0.3 + 0.4 * kick),
    });
  },
});

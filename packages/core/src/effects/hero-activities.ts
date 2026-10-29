import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { createRandom, getRandomBetween, hashSeed } from "../random.ts";
import {
  type Vector,
  addEllipsoid,
  createMesh,
  createRaster,
  getRotation,
  resolveRaster,
  type ColorBuffer,
} from "../mesh.ts";
import { TAU, clamp, toRadians } from "./cat-duo.ts";
import { drawBurst } from "./cat-love.ts";
import { getOvershoot } from "./cat-wands.ts";
import { drawHeart } from "./heart.ts";
import { drawLine } from "./vocal-shapes.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import { drawEyes, eyeStyles } from "./cat-face.ts";
import { type Laptop, drawLaptop, getEqualizerScreen, getHeartScreen } from "./cat-laptop-props.ts";
import { fillDesk, getLevels } from "./cat-laptop.ts";
import { type CatPlacement, getCatOffset, mix, setScaledColor } from "./cat-model.ts";
import {
  type HeroPlacement,
  type PropPart,
  drawHero,
  getHeroPoint,
  heroIds,
} from "./frieren-model.ts";
import { HAND, HERO_EYE_COLORS, getArm, getHeroEyeModel, getHeroFace } from "./hero-love.ts";
import { drawFloatingHearts, drawSparkle, drawSparkles } from "./heart-particles.ts";
import { getBeatKick } from "./heart-pulse.ts";

const WHITE: Color = [255, 255, 255];
const DESK_Y = 50;
const CUP: Vector = [0.6, 1.0, 0.02];
const LAPTOP_POSITION: Vector = [-0.85, 0, 0.2];
const SCREEN_GLOW: Color = [48, 112, 255];
const BAR: Color = [64, 255, 160];
const PEAK: Color = [255, 224, 64];

type LaptopScene = {
  laptop: CatPlacement;
  screen: Laptop;
  hero: HeroPlacement;
};

type LaptopMotion = {
  heart: Color;
  beat: number;
  kick: number;
  nod: number;
  sway: number;
  hop: number;
  arms: HeroPlacement["pose"];
  size: number;
  screen: "heart" | "equalizer";
};

function getFrontScene({ heart, kick, nod, sway, arms, size }: LaptopMotion): LaptopScene {
  const laptopSize = 11;
  return {
    laptop: {
      x: WIDTH / 2,
      y: DESK_Y - 0.2 * laptopSize,
      size: laptopSize,
      rotate: getRotation(VIEW_PITCH, Math.PI, 0),
      depth: 2,
    },
    screen: {
      getScreenColor: () => heart,
      logo: mix(heart, WHITE, 0.2 + 0.5 * kick),
      lid: 0.35,
    },
    hero: {
      x: WIDTH / 2 + sway,
      y: 33 - 1.2 * kick,
      size,
      rotate: getRotation(VIEW_PITCH, 0, toRadians(3 * sway)),
      pose: {
        torso: getRotation(toRadians(10), 0, toRadians(-3 * sway)),
        head: getRotation(toRadians(-4 + 18 * nod), 0, toRadians(8 * sway)),
        hair: getRotation(toRadians(-12 * nod), 0, toRadians(-10 * sway)),
        cape: getRotation(toRadians(-10), 0, 0),
        ...arms,
      },
      hidden: ["leftLeg", "rightLeg", "leftShin", "rightShin"],
    },
  };
}

function getSideScene(motion: LaptopMotion): LaptopScene {
  const { heart, beat, kick, nod, sway, hop, arms, screen } = motion;
  const laptopSize = 12;
  const size = motion.size * 0.8;
  const [laptopX, laptopY, laptopDepth] = getCatOffset(
    getRotation(VIEW_PITCH, 0, 0),
    LAPTOP_POSITION,
    laptopSize,
  );
  const glow = mix(SCREEN_GLOW, WHITE, 0.3 * kick);
  return {
    laptop: {
      x: WIDTH / 2 + laptopX,
      y: DESK_Y + laptopY - laptopSize * 0.25,
      size: laptopSize,
      rotate: getRotation(VIEW_PITCH, toRadians(48), 0),
      depth: laptopDepth,
    },
    screen: {
      getScreenColor:
        screen === "heart"
          ? getHeartScreen(SCREEN_GLOW, heart, kick)
          : getEqualizerScreen(getLevels(beat), glow, BAR, PEAK),
    },
    hero: {
      x: WIDTH / 2 + 10,
      y: DESK_Y - 0.62 * size - hop,
      size,
      rotate: getRotation(VIEW_PITCH, toRadians(-55), 0),
      pose: {
        torso: getRotation(toRadians(8), 0, toRadians(-3 * sway)),
        head: getRotation(toRadians(-6 + 22 * nod), toRadians(30), toRadians(8 * sway)),
        hair: getRotation(toRadians(-14 * nod), 0, toRadians(-10 * sway)),
        cape: getRotation(toRadians(-30), 0, 0),
        skirt: getRotation(toRadians(-30), 0, 0),
        leftLeg: getRotation(toRadians(-85), 0, toRadians(-6)),
        rightLeg: getRotation(toRadians(-85), 0, toRadians(6)),
        leftShin: getRotation(toRadians(15 + 10 * Math.max(0, sway)), 0, 0),
        rightShin: getRotation(toRadians(15 + 10 * Math.max(0, -sway)), 0, 0),
        ...arms,
      },
    },
  };
}

export const laptopViews = ["front", "side"] as const;

function createHeadphonesMesh() {
  const mesh = createMesh<PropPart>();
  const segments = 16;
  for (let index = 0; index <= segments; index++) {
    const angle = Math.PI * (index / segments);
    addEllipsoid(
      mesh,
      [Math.cos(angle) * 0.62, 1.05 + Math.sin(angle) * 0.64, 0.02],
      [0.08, 0.08, 0.08],
      "metal",
      4,
      6,
    );
  }
  for (const side of [-1, 1]) {
    addEllipsoid(mesh, [side * CUP[0], CUP[1], CUP[2]], [0.12, 0.22, 0.22], "metal", 6, 10);
    addEllipsoid(
      mesh,
      [side * (CUP[0] + 0.1), CUP[1], CUP[2]],
      [0.04, 0.13, 0.13],
      "cushion",
      4,
      8,
    );
  }
  return mesh;
}

const headphonesMesh = createHeadphonesMesh();

export function getHeadphonesColor(color: Color) {
  const cushion = mix(color, WHITE, 0.6);
  return (part: PropPart, shade: number, out: ColorBuffer): Color =>
    setScaledColor(out, part === "cushion" ? cushion : color, shade);
}

export const heroLaptop = defineEffect({
  id: "hero-laptop",
  name: "Frieren and Himmel laptop jam",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    hero: z.enum(heroIds).default("frieren"),
    every: z.number().min(0.25).max(4).default(1),
    eyes: z.enum(eyeStyles).default("hearts"),
    heartColor: colorSchema.default("#ff2a6d"),
    size: z.number().min(8).max(24).default(19),
    view: z.enum(laptopViews).default("front"),
    screen: z.enum(["heart", "equalizer"]).default("heart"),
    hop: z.number().min(0).max(4).default(1.5),
  }),
  render(image, { params, beat }) {
    const heart = parseColor(params.heartColor);
    const { pulse, kick } = getBeatKick(beat, params.every);
    const phase = getCycle(pulse);
    const nod = Math.exp(-phase * 5);
    const sway = Math.sin((pulse / 2) * TAU);
    const isCheer = getCycle(pulse / 8) >= 0.75;
    const cheer = isCheer ? Math.min(1, getCycle(pulse / 8) * 16 - 12) * (0.8 + 0.2 * nod) : 0;
    drawSparkles(image, pulse, [mix(heart, WHITE, 0.4)], 0.6, { bottom: DESK_Y - 26 });
    const raster = createRaster();
    fillDesk(raster, DESK_Y, "edge", heart);
    const tap = Math.floor(pulse * 2) % 2 === 0 ? 1 : -1;
    const typing = Math.exp(-getCycle(pulse * 2) * 8);
    const arms = [1, -1].map((side) =>
      isCheer
        ? {
            [side > 0 ? "rightArm" : "leftArm"]: getRotation(
              toRadians(-35 * cheer),
              0,
              toRadians(side * 135 * cheer),
            ),
          }
        : getArm(
            side,
            [side * 0.22, 0.32 + (side === tap ? 0.12 * typing : 0), 0.62],
            [side, -1, -0.3],
          ),
    );
    const motion: LaptopMotion = {
      heart,
      beat,
      kick,
      nod,
      sway,
      hop: params.hop * 4 * phase * (1 - phase),
      arms: { ...arms[0], ...arms[1] },
      size: params.size,
      screen: params.screen,
    };
    const scene = params.view === "side" ? getSideScene(motion) : getFrontScene(motion);
    if (isCheer && scene.hero.pose?.head) {
      const head = scene.hero.pose.head;
      const lift = getRotation(toRadians(-10 * cheer), 0, 0);
      scene.hero.pose.head = (vector) => lift(head(vector));
    }
    drawLaptop(raster, scene.laptop, scene.screen);
    const placement: HeroPlacement = {
      ...scene.hero,
      attachments: [{ joint: "head", mesh: headphonesMesh, getColor: getHeadphonesColor(heart) }],
    };
    drawHero(raster, params.hero, {
      ...placement,
      eyes: getHeroEyeModel(params.hero, placement, params.eyes),
    });
    resolveRaster(raster, image);
    drawEyes(
      image,
      getHeroFace(params.hero, placement),
      params.eyes,
      HERO_EYE_COLORS[params.hero],
      heart,
      1 + 0.3 * kick,
      placement.size * 0.23,
    );
    for (const side of [-1, 1]) {
      const [x, y] = getHeroPoint(params.hero, placement, [side * CUP[0], CUP[1], CUP[2]], "head");
      drawFloatingHearts(
        image,
        pulse + (side > 0 ? 0.5 : 0),
        [x + side * 3, y],
        [heart, mix(heart, WHITE, 0.5)],
        3,
        {
          count: 1,
          rise: 22,
          sizes: [4, 6],
          seed: side > 0 ? 0x1a7 : 0x2b8,
        },
      );
    }
  },
});

const COUPLE_RADIUS = 0.42;

export const heroSlowDance = defineEffect({
  id: "hero-slow-dance",
  name: "Frieren and Himmel slow dance",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    every: z.number().min(0.25).max(4).default(1),
    turn: z.number().min(2).max(32).default(8),
    heartColor: colorSchema.default("#ff2a6d"),
    size: z.number().min(8).max(24).default(17),
  }),
  render(image, { params, beat }) {
    const heart = parseColor(params.heartColor);
    const { pulse, kick } = getBeatKick(beat, params.every);
    const angle = (beat / params.turn) * TAU;
    const step = Math.sin(beat * Math.PI);
    const bob = Math.abs(step);
    drawSparkles(image, pulse, [mix(heart, WHITE, 0.4), WHITE], 0.7, { count: 14 });
    const raster = createRaster();
    for (const [index, hero] of heroIds.entries()) {
      const position = angle + (index === 0 ? Math.PI : 0);
      const yaw = Math.atan2(-Math.cos(position), -Math.sin(position));
      const lean = hero === "frieren" ? toRadians(-8) : toRadians(4);
      const placement: HeroPlacement = {
        x: WIDTH / 2,
        y: 36 - 0.8 * bob - 0.8 * kick,
        size: params.size,
        rotate: getRotation(VIEW_PITCH, 0, 0),
        orient: getRotation(0, yaw, toRadians(4 * step)),
        eyes: "closed",
        offset: [COUPLE_RADIUS * Math.cos(position), 0, COUPLE_RADIUS * Math.sin(position)],
        pose: {
          torso: getRotation(lean, 0, 0),
          head: getRotation(toRadians(hero === "frieren" ? -12 : 8), 0, toRadians(10 * step)),
          hair: getRotation(toRadians(10 * bob), 0, toRadians(-14 * step)),
          cape: getRotation(toRadians(-8 - 10 * bob), 0, 0),
          skirt: getRotation(toRadians(-6 * bob), 0, toRadians(6 * step)),
          ...getArm(1, [0.36, 0.5, 0.62], [1, -0.4, -1]),
          ...getArm(-1, [-0.36, hero === "frieren" ? 0.7 : 0.3, 0.62], [-1, -0.4, -1]),
          leftLeg: getRotation(toRadians(-14 * Math.max(0, step)), 0, 0),
          rightLeg: getRotation(toRadians(-14 * Math.max(0, -step)), 0, 0),
        },
      };
      drawHero(raster, hero, placement);
    }
    resolveRaster(raster, image);
    drawFloatingHearts(image, pulse, [WIDTH / 2, 20], [heart, mix(heart, WHITE, 0.5)], 14, {
      rise: 20,
      sizes: [4, 7],
      gap: 0.3,
    });
  },
});

const CAST_BEATS = 4;
const BURST = [18, 13] as const;
const FLOWER_COUNT = 10;
const FLOWER_SEED = 0xf10e;
const STAFF: Color = [150, 96, 52];
const STAFF_RING: Color = [255, 200, 64];
const STEM: Color = [60, 220, 90];

function drawFlowers(image: RgbaImage, beat: number, loop: number, heart: Color): void {
  const cycle = getCycle(beat / loop) * loop;
  const fade = clamp((loop - cycle) * 2);
  for (let index = 0; index < FLOWER_COUNT; index++) {
    const random = createRandom(hashSeed(FLOWER_SEED, index));
    const bloomAt = ((index + 0.5) / FLOWER_COUNT) * (loop - 2);
    const age = cycle - bloomAt;
    if (age < 0) {
      continue;
    }
    const grow = getOvershoot(clamp(age * 2));
    const slot = (index * 7) % FLOWER_COUNT;
    const x = Math.round(
      4 + (slot * (WIDTH - 8)) / (FLOWER_COUNT - 1) + getRandomBetween(random, -1, 1),
    );
    const height = getRandomBetween(random, 3, 6) * clamp(age * 3);
    const bottom = HEIGHT - 1;
    const sway = Math.sin(beat * Math.PI + index) * 0.6;
    drawLine(image, [x, bottom], [x + sway, bottom - height], 1, STEM, fade);
    drawHeart(image, {
      x: x + sway,
      y: bottom - height - 1.5,
      size: getRandomBetween(random, 4, 6) * grow,
      color: index % 2 === 0 ? heart : mix(heart, WHITE, 0.5),
      amount: fade,
    });
  }
}

export const frierenHeartMagic = defineEffect({
  id: "frieren-heart-magic",
  name: "Frieren heart magic",
  kind: "pixel",
  isBeatOnly: true,
  params: z.object({
    every: z.number().min(0.25).max(4).default(1),
    eyes: z.enum(eyeStyles).default("happy"),
    heartColor: colorSchema.default("#ff2a6d"),
    size: z.number().min(8).max(24).default(17),
    flowers: z.boolean().default(true),
    loop: z.number().min(4).max(64).default(16),
  }),
  render(image, { params, beat }) {
    const heart = parseColor(params.heartColor);
    const { pulse, kick } = getBeatKick(beat, params.every);
    const cast = getCycle(pulse / CAST_BEATS) * CAST_BEATS;
    const raise =
      cast < 2.4
        ? 0
        : cast < 3
          ? easings.easeOutCubic((cast - 2.4) / 0.6)
          : 1 - easings.easeInOutCubic(clamp((cast - 3.4) / 0.6));
    const sway = Math.sin((pulse / 2) * TAU);
    if (params.flowers) {
      drawFlowers(image, beat, params.loop, heart);
    }
    const raster = createRaster();
    const placement: HeroPlacement = {
      x: WIDTH / 2 - 5 + sway,
      y: 38 - kick,
      size: params.size,
      rotate: getRotation(VIEW_PITCH, toRadians(-15), toRadians(-3 * sway)),
      pose: {
        torso: getRotation(toRadians(-6 * raise), 0, toRadians(4 * sway - 6 * raise)),
        head: getRotation(toRadians(-6 - 14 * raise), 0, toRadians(8 * sway)),
        hair: getRotation(toRadians(10 * raise), 0, toRadians(-14 * sway)),
        cape: getRotation(toRadians(-8), 0, 0),
        skirt: getRotation(0, 0, toRadians(-5 * sway)),
        ...getArm(1, [0.62 - 0.18 * raise, 0.25 + 0.7 * raise, 0.3 - 0.05 * raise], [1, -0.5, -1]),
        ...getArm(-1, [-0.5, 0.05 + 0.1 * sway, 0.15], [-1, 0, -1]),
      },
    };
    drawHero(raster, "frieren", {
      ...placement,
      eyes: getHeroEyeModel("frieren", placement, params.eyes),
    });
    resolveRaster(raster, image);
    drawEyes(
      image,
      getHeroFace("frieren", placement),
      params.eyes,
      HERO_EYE_COLORS.frieren,
      heart,
      1 + 0.3 * kick,
      params.size * 0.23,
    );
    const [handX, handY] = getHeroPoint("frieren", placement, HAND, "rightForearm");
    const tilt = toRadians(25 - 25 * raise + 6 * sway);
    const length = params.size * 1.05;
    const [dx, dy] = [Math.sin(tilt), -Math.cos(tilt)];
    const tip: [number, number] = [handX + dx * length * 0.75, handY + dy * length * 0.75];
    drawLine(image, [handX - dx * length * 0.3, handY - dy * length * 0.3], tip, 1.4, STAFF);
    drawLine(image, tip, [tip[0] + dx * 1.5, tip[1] + dy * 1.5], 2.6, STAFF_RING);
    const gem: [number, number] = [tip[0] + dx * 4, tip[1] + dy * 4];
    drawHeart(image, {
      x: gem[0],
      y: gem[1],
      size: 5 + 1.5 * kick + 2 * raise,
      color: mix(heart, WHITE, 0.2 + 0.4 * raise),
      outline: mix(heart, WHITE, 0.6),
    });
    for (let index = 0; index < 3; index++) {
      const orbit = pulse * 1.5 + index / 3;
      drawSparkle(
        image,
        [
          Math.round(gem[0] + Math.cos(orbit * TAU) * 6),
          Math.round(gem[1] + Math.sin(orbit * TAU) * 3),
        ],
        mix(heart, WHITE, 0.5),
        0.8,
        1,
      );
    }
    const flight = (cast - 3) / 0.6;
    if (flight >= 0 && flight < 1) {
      drawHeart(image, {
        x: gem[0] + (BURST[0] - gem[0]) * flight,
        y: gem[1] + (BURST[1] - gem[1]) * flight - 10 * Math.sin(flight * Math.PI),
        size: 6,
        color: mix(heart, WHITE, 0.4),
      });
    }
    if (cast >= 3.6 || cast < 0.6) {
      const phase = cast >= 3.6 ? cast - 3.6 : cast + 0.4;
      drawBurst(image, BURST[0], BURST[1], clamp(phase), heart);
      drawHeart(image, {
        x: BURST[0],
        y: BURST[1],
        size: 10 * getOvershoot(clamp(phase * 4)),
        color: mix(heart, WHITE, 0.2),
        outline: mix(heart, WHITE, 0.6),
        amount: clamp((1 - phase) * 2),
      });
    }
  },
});

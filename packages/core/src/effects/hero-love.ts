import { z } from "zod";
import { colorSchema, parseColor } from "../color.ts";
import { defineEffect } from "../effect.ts";
import { type Color, HEIGHT, type RgbaImage, WIDTH } from "../frame.ts";
import { easings } from "../keyframes.ts";
import { type Vector, createRaster, getRotation, resolveRaster } from "../mesh.ts";
import { TAU, clamp, toRadians } from "./cat-duo.ts";
import { VIEW_PITCH, getCycle } from "./cat-dance.ts";
import { type CatFace, drawEyes } from "./cat-face.ts";
import { drawBurst } from "./cat-love.ts";
import { mix } from "./cat-model.ts";
import { getOvershoot } from "./cat-wands.ts";
import {
  ELBOW,
  type HeroId,
  type HeroPlacement,
  SHOULDER,
  drawHero,
  getHeroPoint,
  heroIds,
} from "./frieren-model.ts";
import { getLimbRotations } from "./frieren-pose.ts";
import { blendPixel, drawHeart } from "./heart.ts";
import { drawFloatingHearts, drawSparkles } from "./heart-particles.ts";
import { getBeatKick } from "./heart-pulse.ts";

const WHITE: Color = [255, 255, 255];
const BLUSH: Color = [255, 110, 150];
export const HAND: Vector = [0.44, 0.02, 0];
export const EYE: Vector = [0.18, 1.04, 0.44];
const MOUTH: Vector = [0, 0.86, 0.48];
const CHEEK: Vector = [0.3, 0.9, 0.36];
const HEAD_CENTER: Vector = [0, 1.05, 0.02];
const HEAD_TOP: Vector = [0, 1.62, 0];
const KISS_BEATS = 4;
const HERO_EYE_COLORS: Readonly<Record<HeroId, Color>> = {
  frieren: parseColor("#1e7860"),
  himmel: parseColor("#1c3c78"),
};

const loveParams = {
  every: z.number().min(0.25).max(4).default(1),
  heartColor: colorSchema.default("#ff2a6d"),
  size: z.number().min(8).max(20).default(14),
};

function getHeroes(): readonly (readonly [side: number, hero: HeroId])[] {
  return heroIds.map((hero, index) => [index === 0 ? 1 : -1, hero] as const);
}

export function getArm(side: number, target: Vector, pole: Vector) {
  const [arm, forearm] = getLimbRotations(
    [side * SHOULDER[0], SHOULDER[1], 0],
    [side * ELBOW[0], ELBOW[1], 0],
    [side * HAND[0], HAND[1], 0],
    target,
    pole,
  );
  return side > 0
    ? { rightArm: arm, rightForearm: forearm }
    : { leftArm: arm, leftForearm: forearm };
}

export function getHeroEyes(hero: HeroId, placement: HeroPlacement): Vector[] {
  return [-1, 1].map((eye) =>
    getHeroPoint(hero, placement, [eye * EYE[0], EYE[1], EYE[2]], "head"),
  );
}

export function getHeroFace(hero: HeroId, placement: HeroPlacement): CatFace {
  const eyes = getHeroEyes(hero, placement);
  const center = getHeroPoint(hero, placement, HEAD_CENTER, "head");
  const isVisible = eyes.map(([, , depth]) => depth > center[2] + 0.1);
  return {
    eyes,
    isFacing: isVisible.every(Boolean),
    isVisible,
    top: getHeroPoint(hero, placement, HEAD_TOP, "head"),
  };
}

export const heroHeartHands = defineEffect({
  id: "hero-heart-hands",
  name: "Frieren and Himmel heart hands",
  kind: "pixel",
  params: z.object(loveParams),
  render(image, { params, beat }) {
    const heart = parseColor(params.heartColor);
    const { pulse, kick } = getBeatKick(beat, params.every);
    const phase = getCycle(pulse);
    const isPop = ((Math.floor(pulse) % 4) + 4) % 4 === 3;
    const pop = isPop ? kick : 0;
    drawSparkles(image, pulse, [mix(heart, WHITE, 0.4)], 0.7, { bottom: HEIGHT - 20 });
    const raster = createRaster();
    const sway = Math.sin((pulse / 2) * TAU);
    const tips: Vector[] = [];
    const faces: [HeroId, HeroPlacement][] = [];
    for (const [side, hero] of getHeroes()) {
      const reach = kick;
      const placement: HeroPlacement = {
        x: WIDTH / 2 - side * 16 + sway,
        y: 41 - 1.5 * kick,
        size: params.size,
        rotate: getRotation(VIEW_PITCH, side * 0.35, side * toRadians(-4 + 3 * sway)),
        eyesClosed: !isPop,
        pose: {
          torso: getRotation(0, 0, side * toRadians(-6)),
          head: getRotation(toRadians(-6 - 6 * kick), 0, side * toRadians(-10 - 5 * sway)),
          hair: getRotation(0, 0, side * toRadians(6 * sway)),
          cape: getRotation(toRadians(-8), 0, 0),
          ...getArm(side, [side * 0.95, 0.45 + reach * 0.2, 0.3], [0, -1, -0.3]),
          ...getArm(-side, [-side * 0.5, 0.1, 0.1], [-side, 0, -1]),
        },
      };
      drawHero(raster, hero, placement);
      tips.push(
        getHeroPoint(
          hero,
          placement,
          [side * HAND[0], HAND[1], HAND[2]],
          side > 0 ? "rightForearm" : "leftForearm",
        ),
      );
      faces.push([hero, placement]);
    }
    const [left, right] = tips;
    const x = ((left?.[0] ?? 0) + (right?.[0] ?? 0)) / 2;
    const y = ((left?.[1] ?? 0) + (right?.[1] ?? 0)) / 2 - 4;
    const size = 11 * (1 + 0.12 * kick + 0.15 * pop);
    resolveRaster(raster, image);
    drawFloatingHearts(image, pulse, [x, y - size * 0.3], [heart, mix(heart, WHITE, 0.5)], 7, {
      rise: 30,
      sizes: [4, 6],
    });
    drawHeart(image, {
      x,
      y,
      size,
      color: mix(heart, WHITE, 0.15 + 0.4 * pop),
      outline: mix(heart, WHITE, 0.6),
    });
    if (isPop) {
      drawBurst(image, x, y, phase, heart);
      for (const [hero, placement] of faces) {
        const face = {
          eyes: getHeroEyes(hero, placement),
          isFacing: true,
          isVisible: [true, true],
          top: [0, 0, 0] as Vector,
        };
        drawEyes(image, face, "hearts", HERO_EYE_COLORS[hero], heart, 1 + 0.3 * kick, 2.5);
      }
    }
  },
});

function getKissPlacement(
  side: number,
  x: number,
  lean: number,
  beat: number,
  size: number,
): HeroPlacement {
  const bob = Math.sin(beat * Math.PI);
  return {
    x,
    y: 40,
    size,
    rotate: getRotation(VIEW_PITCH, side * toRadians(65), 0),
    eyesClosed: lean > 0.5,
    pose: {
      torso: getRotation(toRadians(14 * lean), 0, 0),
      head: getRotation(toRadians(-4 + 6 * lean), 0, side * toRadians(5 * bob * (1 - lean))),
      cape: getRotation(toRadians(-14 * lean), 0, 0),
      hair: getRotation(toRadians(-10 * lean), 0, 0),
      ...getArm(1, [0.42, 0.2 + 0.2 * lean, 0.3 + 0.2 * lean], [1, 0, -1]),
      ...getArm(-1, [-0.42, 0.2 + 0.2 * lean, 0.3 + 0.2 * lean], [-1, 0, -1]),
    },
  };
}

function drawBlush(image: RgbaImage, hero: HeroId, placement: HeroPlacement, amount: number): void {
  const [x, y] = getHeroPoint(hero, placement, [CHEEK[0], CHEEK[1], CHEEK[2]], "head");
  const [otherX, otherY] = getHeroPoint(hero, placement, [-CHEEK[0], CHEEK[1], CHEEK[2]], "head");
  const near = Math.abs(x - WIDTH / 2) > Math.abs(otherX - WIDTH / 2) ? [x, y] : [otherX, otherY];
  for (const dx of [-1, 0, 1]) {
    blendPixel(
      image,
      Math.round(near[0] ?? 0) + dx,
      Math.round(near[1] ?? 0),
      BLUSH,
      amount * (dx === 0 ? 0.9 : 0.6),
    );
  }
}

export const heroKiss = defineEffect({
  id: "hero-kiss",
  name: "Frieren and Himmel kiss",
  kind: "pixel",
  params: z.object(loveParams),
  render(image, { params, beat }) {
    const heart = parseColor(params.heartColor);
    const { pulse, kick } = getBeatKick(beat, params.every);
    const story = getCycle(pulse / KISS_BEATS) * KISS_BEATS;
    const lean =
      story >= 3
        ? easings.easeInOutCubic(story - 3)
        : story < 0.6
          ? 1
          : 1 - easings.easeOutCubic(clamp((story - 0.6) / 0.8));
    const smitten = story < 2.2;
    const raster = createRaster();
    const placements: [HeroId, HeroPlacement][] = [];
    for (const [side, hero] of getHeroes()) {
      const reach = getHeroPoint(
        hero,
        getKissPlacement(side, 0, lean, pulse, params.size),
        MOUTH,
        "head",
      )[0];
      const rest = WIDTH / 2 - side * 15;
      const kiss = WIDTH / 2 - reach - side * 0.5;
      const placement = getKissPlacement(
        side,
        rest + (kiss - rest) * lean,
        lean,
        pulse,
        params.size,
      );
      placement.y -= (1 - lean) * 1.5 * kick;
      drawHero(raster, hero, placement);
      placements.push([hero, placement]);
    }
    resolveRaster(raster, image);
    for (const [hero, placement] of placements) {
      if (smitten && lean <= 0.5) {
        const eyes = getHeroEyes(hero, placement);
        const eye = eyes.reduce((best, point) => (point[2] > best[2] ? point : best));
        drawEyes(
          image,
          { eyes: [eye], isFacing: true, isVisible: [true], top: eye },
          "hearts",
          HERO_EYE_COLORS[hero],
          heart,
          1 + 0.3 * kick,
          3.5,
        );
      }
      drawBlush(image, hero, placement, 0.4 + 0.6 * lean);
    }
    const smooch = story < 1.6 ? story / 1.6 : -1;
    if (smooch >= 0) {
      drawHeart(image, {
        x: WIDTH / 2,
        y: 22 - 14 * easings.easeOutCubic(smooch),
        size: 12 * getOvershoot(clamp(smooch * 5)) * (1 + 0.15 * kick),
        color: mix(heart, WHITE, 0.15),
        outline: mix(heart, WHITE, 0.6),
        amount: clamp((1 - smooch) * 3),
      });
      drawBurst(image, WIDTH / 2, 26, clamp(0.15 + smooch * 1.6), heart);
    }
    drawFloatingHearts(image, pulse, [WIDTH / 2, 30], [heart, mix(heart, WHITE, 0.5)], 26, {
      rise: 28,
      sizes: [4, 6],
      gap: 0.5,
    });
  },
});

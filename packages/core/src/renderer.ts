import {
  type Animation,
  type AnimationTiming,
  type Layer,
  type Section,
  getAnimationTiming,
} from "./animation.ts";
import { blendChannel } from "./blend.ts";
import type { CanvasContext, CanvasProvider } from "./canvas.ts";
import { type ClipLibrary, emptyClipLibrary } from "./clip.ts";
import { getEffect } from "./effects/index.ts";
import type { FrameCache } from "./frame-cache.ts";
import {
  CHANNELS,
  HEIGHT,
  RGBA_CHANNELS,
  WIDTH,
  type Frame,
  type RgbaImage,
  createFrame,
  createRgbaImage,
} from "./frame.ts";
import { resolveParams } from "./keyframes.ts";

export type RendererOptions = {
  fps: number;
  canvas?: CanvasProvider;
  clips?: ClipLibrary;
  cache?: FrameCache;
};

export const CACHE_SAMPLES_PER_BEAT = 32;

export type Renderer = {
  render(
    animation: Animation,
    elapsed: number,
    bpm: number,
    section?: number,
    cycle?: number,
  ): Frame;
};

const animationIds = new WeakMap<Animation, number>();
let nextAnimationId = 0;

function getAnimationId(animation: Animation): number {
  let id = animationIds.get(animation);
  if (id === undefined) {
    id = nextAnimationId++;
    animationIds.set(animation, id);
  }
  return id;
}

function getCacheBeats(section: Section): number | undefined {
  const { mode, layers } = section;
  if (mode.type !== "loop" || !("beats" in mode)) {
    return undefined;
  }
  return layers.every((layer) => getEffect(layer.effect)?.isBeatOnly) ? mode.beats : undefined;
}

function isFirstCycleDistinct(section: Section): boolean {
  return section.layers.some((layer) => getEffect(layer.effect)?.isFirstCycleDistinct);
}

function getSource(frame: Frame): RgbaImage {
  const source = createRgbaImage();
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
    source.set(frame.subarray(pixel * CHANNELS, (pixel + 1) * CHANNELS), pixel * RGBA_CHANNELS);
    source[pixel * RGBA_CHANNELS + 3] = 255;
  }
  return source;
}

function hardenAlpha(image: RgbaImage): void {
  for (let offset = 3; offset < image.length; offset += RGBA_CHANNELS) {
    image[offset] = (image[offset] ?? 0) >= 128 ? 255 : 0;
  }
}

function blendLayer(frame: Frame, image: RgbaImage, layer: Layer, isFilter: boolean): void {
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
    const source = pixel * RGBA_CHANNELS;
    const target = pixel * CHANNELS;
    const coverage = (image[source + 3] ?? 0) / 255;
    const alpha = isFilter ? layer.opacity : coverage * layer.opacity;
    if (alpha === 0) {
      continue;
    }
    const scale = isFilter ? coverage : 1;
    for (let channel = 0; channel < CHANNELS; channel++) {
      frame[target + channel] = blendChannel(
        layer.blend,
        frame[target + channel] ?? 0,
        (image[source + channel] ?? 0) * scale,
        alpha,
      );
    }
  }
}

export function createRenderer({
  fps,
  canvas,
  clips = emptyClipLibrary,
  cache,
}: RendererOptions): Renderer {
  const contexts: CanvasContext[] = [];
  const previousImages = new Map<string, RgbaImage>();

  function getContext(index: number): CanvasContext {
    if (!canvas) {
      throw new Error("Canvas effects require a canvas provider");
    }
    contexts[index] ??= canvas.createContext(WIDTH, HEIGHT);
    return contexts[index];
  }

  function renderTiming(
    current: Section,
    section: number,
    timing: AnimationTiming,
    bpm: number,
    cycle: number,
  ): Frame {
    const frame = createFrame();
    for (const [index, layer] of current.layers.entries()) {
      const effect = getEffect(layer.effect);
      if (!effect) {
        throw new Error(`Unknown effect "${layer.effect}"`);
      }
      const params = effect.params.parse(resolveParams(layer.params, timing.progress));
      const input = { ...timing, bpm, fps, params, cycle, clips };

      let image = createRgbaImage();
      if (effect.kind === "pixel") {
        effect.render(image, input);
      } else if (effect.kind === "filter") {
        const key = `${section}:${index}`;
        const previous = previousImages.get(key) ?? createRgbaImage();
        effect.render(image, { ...input, source: getSource(frame), previous });
        previousImages.set(key, image);
      } else {
        const context = getContext(index);
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, WIDTH, HEIGHT);
        effect.render(context, input);
        context.restore();
        image = context.getImageData(0, 0, WIDTH, HEIGHT).data;
      }
      if (layer.antialias === false) {
        hardenAlpha(image);
      }

      blendLayer(frame, image, layer, effect.kind === "filter");
    }
    return frame;
  }

  function renderCached(
    frameCache: FrameCache,
    animation: Animation,
    current: Section,
    section: number,
    beats: number,
    elapsed: number,
    bpm: number,
    cycle: number,
  ): Frame {
    const { beat } = getAnimationTiming(current.mode, elapsed, bpm, fps);
    let sample = Math.round(beat * CACHE_SAMPLES_PER_BEAT);
    let sampleCycle = cycle;
    if (sample / CACHE_SAMPLES_PER_BEAT >= beats) {
      sample = 0;
      sampleCycle++;
    }
    const cycleKey = isFirstCycleDistinct(current) ? Math.min(sampleCycle, 1) : 0;
    const key = `${getAnimationId(animation)}:${section}:${cycleKey}:${sample}`;
    const cached = frameCache.get(key);
    if (cached) {
      return cached.slice();
    }
    const sampleBeat = sample / CACHE_SAMPLES_PER_BEAT;
    const timing = {
      time: (sampleBeat * 60_000) / bpm,
      progress: sampleBeat / beats,
      beat: sampleBeat,
    };
    const frame = renderTiming(current, section, timing, bpm, sampleCycle);
    frameCache.set(key, frame.slice());
    return frame;
  }

  return {
    render(animation, elapsed, bpm, section = 0, cycle = 0) {
      const current = animation.sections[section];
      if (!current) {
        throw new Error(`Missing section ${section}`);
      }
      const beats = cache ? getCacheBeats(current) : undefined;
      if (cache && beats !== undefined) {
        return renderCached(cache, animation, current, section, beats, elapsed, bpm, cycle);
      }
      const timing = getAnimationTiming(current.mode, elapsed, bpm, fps);
      return renderTiming(current, section, timing, bpm, cycle);
    },
  };
}

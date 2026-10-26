import { type Animation, type Layer, getAnimationTiming } from "./animation.ts";
import { blendChannel } from "./blend.ts";
import type { CanvasContext, CanvasProvider } from "./canvas.ts";
import { type ClipLibrary, emptyClipLibrary } from "./clip.ts";
import { getEffect } from "./effects/index.ts";
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
};

export type Renderer = {
  render(animation: Animation, elapsed: number, bpm: number): Frame;
};

function getSource(frame: Frame): RgbaImage {
  const source = createRgbaImage();
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
    source.set(frame.subarray(pixel * CHANNELS, (pixel + 1) * CHANNELS), pixel * RGBA_CHANNELS);
    source[pixel * RGBA_CHANNELS + 3] = 255;
  }
  return source;
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
}: RendererOptions): Renderer {
  const contexts: CanvasContext[] = [];
  const previousImages = new Map<number, RgbaImage>();

  function getContext(index: number): CanvasContext {
    if (!canvas) {
      throw new Error("Canvas effects require a canvas provider");
    }
    contexts[index] ??= canvas.createContext(WIDTH, HEIGHT);
    return contexts[index];
  }

  return {
    render(animation, elapsed, bpm) {
      const frame = createFrame();
      const timing = getAnimationTiming(animation.mode, elapsed, bpm, fps);

      for (const [index, layer] of animation.layers.entries()) {
        const effect = getEffect(layer.effect);
        if (!effect) {
          throw new Error(`Unknown effect "${layer.effect}"`);
        }
        const params = effect.params.parse(resolveParams(layer.params, timing.progress));
        const input = { ...timing, bpm, params, clips };

        let image = createRgbaImage();
        if (effect.kind === "pixel") {
          effect.render(image, input);
        } else if (effect.kind === "filter") {
          const previous = previousImages.get(index) ?? createRgbaImage();
          effect.render(image, { ...input, source: getSource(frame), previous });
          previousImages.set(index, image);
        } else {
          const context = getContext(index);
          context.save();
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, WIDTH, HEIGHT);
          effect.render(context, input);
          context.restore();
          image = context.getImageData(0, 0, WIDTH, HEIGHT).data;
        }

        blendLayer(frame, image, layer, effect.kind === "filter");
      }

      return frame;
    },
  };
}

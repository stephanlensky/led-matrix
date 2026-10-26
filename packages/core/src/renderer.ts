import { type Animation, getAnimationTiming } from "./animation.ts";
import { blendChannel } from "./blend.ts";
import type { CanvasContext, CanvasProvider } from "./canvas.ts";
import { getEffect } from "./effects/index.ts";
import {
  CHANNELS,
  HEIGHT,
  RGBA_CHANNELS,
  WIDTH,
  type Frame,
  createFrame,
  createRgbaImage,
} from "./frame.ts";
import { resolveParams } from "./keyframes.ts";

export type RendererOptions = {
  fps: number;
  canvas?: CanvasProvider;
};

export type Renderer = {
  render(animation: Animation, elapsed: number, bpm: number): Frame;
};

export function createRenderer({ fps, canvas }: RendererOptions): Renderer {
  const contexts: CanvasContext[] = [];

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
        const input = { ...timing, bpm, params };

        let image = createRgbaImage();
        if (effect.kind === "pixel") {
          effect.render(image, input);
        } else {
          const context = getContext(index);
          context.save();
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, WIDTH, HEIGHT);
          effect.render(context, input);
          context.restore();
          image = context.getImageData(0, 0, WIDTH, HEIGHT).data;
        }

        for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
          const source = pixel * RGBA_CHANNELS;
          const target = pixel * CHANNELS;
          const alpha = ((image[source + 3] ?? 0) / 255) * layer.opacity;
          if (alpha === 0) {
            continue;
          }
          for (let channel = 0; channel < CHANNELS; channel++) {
            frame[target + channel] = blendChannel(
              layer.blend,
              frame[target + channel] ?? 0,
              image[source + channel] ?? 0,
              alpha,
            );
          }
        }
      }

      return frame;
    },
  };
}

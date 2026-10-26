import type { z } from "zod";
import type { CanvasContext } from "./canvas.ts";
import type { ClipLibrary } from "./clip.ts";
import type { RgbaImage } from "./frame.ts";

export type EffectParamsSchema = z.ZodObject;

export type EffectInput<P> = {
  params: P;
  time: number;
  beat: number;
  bpm: number;
  progress: number;
  clips: ClipLibrary;
};

export type FilterInput<P> = EffectInput<P> & {
  source: RgbaImage;
  previous: RgbaImage;
};

type EffectBase<S extends EffectParamsSchema> = {
  id: string;
  name: string;
  params: S;
};

export type PixelEffect<S extends EffectParamsSchema = EffectParamsSchema> = EffectBase<S> & {
  kind: "pixel";
  render(image: RgbaImage, input: EffectInput<z.output<S>>): void;
};

export type CanvasEffect<S extends EffectParamsSchema = EffectParamsSchema> = EffectBase<S> & {
  kind: "canvas";
  render(context: CanvasContext, input: EffectInput<z.output<S>>): void;
};

export type FilterEffect<S extends EffectParamsSchema = EffectParamsSchema> = EffectBase<S> & {
  kind: "filter";
  render(image: RgbaImage, input: FilterInput<z.output<S>>): void;
};

export type Effect<S extends EffectParamsSchema = EffectParamsSchema> =
  | PixelEffect<S>
  | CanvasEffect<S>
  | FilterEffect<S>;

export function defineEffect<S extends EffectParamsSchema>(effect: Effect<S>): Effect<S> {
  return effect;
}

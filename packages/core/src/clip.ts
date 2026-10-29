import { deflateSync, inflateSync } from "fflate";
import { z } from "zod";
import { HEIGHT, RGBA_CHANNELS, WIDTH, type RgbaImage, createRgbaImage } from "./frame.ts";

export const CLIP_FRAME_BYTES = WIDTH * HEIGHT * RGBA_CHANNELS;

const CLIP_GROUP_FRAMES = 8;
const CLIP_HEADER_BYTES = 8;
const UINT32_BYTES = 4;

export const clipSources = ["image", "gif", "svg", "video", "sequence"] as const;

export const fitModes = ["cover", "contain", "fill"] as const;

export const resampleModes = ["nearest", "area"] as const;

export const clipIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export const clipInfoSchema = z.object({
  id: clipIdSchema,
  name: z.string().min(1).max(100),
  source: z.enum(clipSources),
  durations: z.array(z.number().positive()).min(1),
});

export const clipImportOptionsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  fit: z.enum(fitModes).default("cover"),
  resample: z.enum(resampleModes).default("area"),
  fps: z.coerce.number().min(1).max(60).default(30),
  start: z.coerce.number().min(0).default(0),
  duration: z.coerce.number().positive().max(600).default(10),
});

export type ClipImportOptions = z.infer<typeof clipImportOptionsSchema>;

export type ClipSource = (typeof clipSources)[number];

export type FitMode = (typeof fitModes)[number];

export type ResampleMode = (typeof resampleModes)[number];

export type ClipInfo = z.infer<typeof clipInfoSchema>;

export type Clip = {
  durations: readonly number[];
  getFrame(index: number): RgbaImage | undefined;
};

export type ClipLibrary = {
  getClip(id: string): Clip | undefined;
};

export type SourceImage = {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
};

export type FitOptions = {
  fit: FitMode;
  resample: ResampleMode;
};

export const emptyClipLibrary: ClipLibrary = { getClip: () => undefined };

export function getClipDuration(clip: Pick<Clip, "durations">): number {
  return clip.durations.reduce((total, duration) => total + duration, 0);
}

export function encodeClipFrames(frames: Uint8Array): Uint8Array {
  const frameCount = Math.floor(frames.length / CLIP_FRAME_BYTES);
  const groupCount = Math.ceil(frameCount / CLIP_GROUP_FRAMES);
  const groups = Array.from({ length: groupCount }, (_, group) =>
    deflateSync(
      frames.subarray(
        group * CLIP_GROUP_FRAMES * CLIP_FRAME_BYTES,
        Math.min(frameCount, (group + 1) * CLIP_GROUP_FRAMES) * CLIP_FRAME_BYTES,
      ),
      { level: 9 },
    ),
  );
  const dataStart = CLIP_HEADER_BYTES + (groupCount + 1) * UINT32_BYTES;
  const output = new Uint8Array(
    dataStart + groups.reduce((total, group) => total + group.length, 0),
  );
  const view = new DataView(output.buffer);
  view.setUint32(0, frameCount, true);
  view.setUint32(UINT32_BYTES, CLIP_GROUP_FRAMES, true);
  let offset = dataStart;
  for (const [index, group] of groups.entries()) {
    view.setUint32(CLIP_HEADER_BYTES + index * UINT32_BYTES, offset, true);
    output.set(group, offset);
    offset += group.length;
  }
  view.setUint32(CLIP_HEADER_BYTES + groupCount * UINT32_BYTES, offset, true);
  return output;
}

export function getEncodedFrameCount(data: Uint8Array): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true);
}

export function isEncodedClipFrames(data: Uint8Array, frameCount: number): boolean {
  if (data.length < CLIP_HEADER_BYTES) {
    return false;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const groupFrames = view.getUint32(UINT32_BYTES, true);
  if (view.getUint32(0, true) !== frameCount || groupFrames === 0) {
    return false;
  }
  const groupCount = Math.ceil(frameCount / groupFrames);
  const dataStart = CLIP_HEADER_BYTES + (groupCount + 1) * UINT32_BYTES;
  if (data.length < dataStart) {
    return false;
  }
  let previous = dataStart;
  for (let group = 0; group <= groupCount; group++) {
    const offset = view.getUint32(CLIP_HEADER_BYTES + group * UINT32_BYTES, true);
    if (offset < previous || offset > data.length) {
      return false;
    }
    previous = offset;
  }
  return previous === data.length;
}

export function createClip(data: Uint8Array, durations: readonly number[]): Clip {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const frameCount = view.getUint32(0, true);
  const groupFrames = view.getUint32(UINT32_BYTES, true);
  let cached: { group: number; frames: Uint8Array } | undefined;

  function getGroup(group: number): Uint8Array {
    if (cached?.group !== group) {
      const start = view.getUint32(CLIP_HEADER_BYTES + group * UINT32_BYTES, true);
      const end = view.getUint32(CLIP_HEADER_BYTES + (group + 1) * UINT32_BYTES, true);
      cached = { group, frames: inflateSync(data.subarray(start, end)) };
    }
    return cached.frames;
  }

  return {
    durations,
    getFrame(index) {
      if (index < 0 || index >= frameCount) {
        return undefined;
      }
      const frames = getGroup(Math.floor(index / groupFrames));
      const offset = (index % groupFrames) * CLIP_FRAME_BYTES;
      return new Uint8ClampedArray(frames.buffer, frames.byteOffset + offset, CLIP_FRAME_BYTES);
    },
  };
}

export function getClipFrameIndex(clip: Pick<Clip, "durations">, position: number): number {
  const target = Math.min(Math.max(position, 0), 1) * getClipDuration(clip);
  let end = 0;
  for (const [index, duration] of clip.durations.entries()) {
    end += duration;
    if (target < end) {
      return index;
    }
  }
  return clip.durations.length - 1;
}

type Weight = { index: number; weight: number };

function getScale(source: SourceImage, fit: FitMode): [x: number, y: number] {
  const scaleX = WIDTH / source.width;
  const scaleY = HEIGHT / source.height;
  if (fit === "fill") {
    return [scaleX, scaleY];
  }
  const scale = fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  return [scale, scale];
}

function getWeights(
  targetSize: number,
  sourceSize: number,
  scale: number,
  resample: ResampleMode,
): Weight[][] {
  const offset = (targetSize - sourceSize * scale) / 2;
  return Array.from({ length: targetSize }, (_, target) => {
    if (resample === "nearest") {
      const index = Math.floor((target + 0.5 - offset) / scale);
      return index >= 0 && index < sourceSize ? [{ index, weight: 1 }] : [];
    }
    const start = (target - offset) / scale;
    const end = (target + 1 - offset) / scale;
    const weights: Weight[] = [];
    for (let index = Math.max(0, Math.floor(start)); index < Math.min(sourceSize, end); index++) {
      const coverage = Math.min(end, index + 1) - Math.max(start, index);
      if (coverage > 0) {
        weights.push({ index, weight: coverage / (end - start) });
      }
    }
    return weights;
  });
}

export function fitImage(source: SourceImage, { fit, resample }: FitOptions): RgbaImage {
  const image = createRgbaImage();
  const [scaleX, scaleY] = getScale(source, fit);
  const columns = getWeights(WIDTH, source.width, scaleX, resample);
  const rows = getWeights(HEIGHT, source.height, scaleY, resample);
  for (const [y, row] of rows.entries()) {
    for (const [x, column] of columns.entries()) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (const { index: sourceY, weight: weightY } of row) {
        for (const { index: sourceX, weight: weightX } of column) {
          const offset = (sourceY * source.width + sourceX) * RGBA_CHANNELS;
          const weight = weightX * weightY * (source.data[offset + 3] ?? 0);
          red += (source.data[offset] ?? 0) * weight;
          green += (source.data[offset + 1] ?? 0) * weight;
          blue += (source.data[offset + 2] ?? 0) * weight;
          alpha += weight;
        }
      }
      if (alpha === 0) {
        continue;
      }
      const offset = (y * WIDTH + x) * RGBA_CHANNELS;
      image[offset] = red / alpha;
      image[offset + 1] = green / alpha;
      image[offset + 2] = blue / alpha;
      image[offset + 3] = alpha;
    }
  }
  return image;
}

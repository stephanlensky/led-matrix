import type { Frame } from "./frame.ts";

export const DEFAULT_FRAME_CACHE_BYTES = 64 * 1024 * 1024;

export type FrameCacheOptions = {
  maxBytes?: number;
};

export type FrameCache = {
  get(key: string): Frame | undefined;
  set(key: string, frame: Frame): void;
  getSize(): number;
  getBytes(): number;
};

export function createFrameCache({
  maxBytes = DEFAULT_FRAME_CACHE_BYTES,
}: FrameCacheOptions = {}): FrameCache {
  const frames = new Map<string, Frame>();
  let bytes = 0;

  return {
    get(key) {
      const frame = frames.get(key);
      if (frame) {
        frames.delete(key);
        frames.set(key, frame);
      }
      return frame;
    },
    set(key, frame) {
      const existing = frames.get(key);
      if (existing) {
        bytes -= existing.byteLength;
        frames.delete(key);
      }
      frames.set(key, frame);
      bytes += frame.byteLength;
      for (const [oldest, evicted] of frames) {
        if (bytes <= maxBytes) {
          break;
        }
        frames.delete(oldest);
        bytes -= evicted.byteLength;
      }
    },
    getSize() {
      return frames.size;
    },
    getBytes() {
      return bytes;
    },
  };
}

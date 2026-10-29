import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type ClipInfo,
  clipIdSchema,
  clipInfoSchema,
  isEncodedClipFrames,
  storedAnimationSchema,
} from "@led-matrix/core";
import { z } from "zod";
import type { ContentSource } from "./server.ts";

export type ContentOrigin = "server" | "cache";

export type ContentCacheState = {
  origin: ContentOrigin | null;
  savedAt: number | null;
  error: string | null;
};

export type CachedContentOptions = {
  source: ContentSource;
  directory: string;
  getTime?: () => number;
  log?: (message: string) => void;
  onState?: (state: ContentCacheState) => void;
};

export type CachedContent = ContentSource & {
  getState(): ContentCacheState;
};

type CacheName = "animations" | "clips";

type CacheEntry = {
  origin: ContentOrigin;
  savedAt: number;
  error: string | null;
};

const CLIP_FRAMES_EXTENSION = ".bin";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getCacheFileSchema<T>(schema: z.ZodType<T>) {
  return z.object({ savedAt: z.number(), items: z.array(schema) });
}

async function writeAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, data);
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

export function createCachedContent({
  source,
  directory,
  getTime = () => Date.now(),
  log = console.log,
  onState,
}: CachedContentOptions): CachedContent {
  const clipsDirectory = join(directory, "clips");
  const entries = new Map<CacheName, CacheEntry>();
  const frameCounts = new Map<string, number>();

  function getState(): ContentCacheState {
    const values = [...entries.values()];
    if (values.length === 0) {
      return { origin: null, savedAt: null, error: null };
    }
    return {
      origin: values.some(({ origin }) => origin === "cache") ? "cache" : "server",
      savedAt: Math.min(...values.map(({ savedAt }) => savedAt)),
      error: values.find(({ error }) => error !== null)?.error ?? null,
    };
  }

  function setEntry(name: CacheName, entry: CacheEntry): void {
    if (entries.get(name)?.origin === "cache" && entry.origin === "server") {
      log(`Refreshed cached ${name} from the server`);
    }
    entries.set(name, entry);
    onState?.(getState());
  }

  async function readCache<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch {
      return undefined;
    }
    try {
      return schema.parse(JSON.parse(text));
    } catch {
      log(`Ignoring corrupt cache ${path}`);
      return undefined;
    }
  }

  async function getItems<T>(
    name: CacheName,
    schema: z.ZodType<T>,
    fetchItems: () => Promise<T[]>,
  ): Promise<T[]> {
    const path = join(directory, `${name}.json`);
    let items: T[];
    try {
      items = await fetchItems();
    } catch (error) {
      const cached = await readCache(path, getCacheFileSchema(schema));
      if (!cached) {
        throw error;
      }
      const message = getErrorMessage(error);
      log(
        `Using ${name} cached at ${new Date(cached.savedAt).toISOString()}, server unavailable: ${message}`,
      );
      setEntry(name, { origin: "cache", savedAt: cached.savedAt, error: message });
      return cached.items;
    }
    const savedAt = getTime();
    try {
      await writeAtomic(path, JSON.stringify({ savedAt, items }));
    } catch (error) {
      log(`Failed to cache ${name}: ${getErrorMessage(error)}`);
    }
    setEntry(name, { origin: "server", savedAt, error: null });
    return items;
  }

  async function removeUnusedClipFrames(clips: readonly ClipInfo[]): Promise<void> {
    const names = new Set(clips.map(({ id }) => `${id}${CLIP_FRAMES_EXTENSION}`));
    let files: string[];
    try {
      files = await readdir(clipsDirectory);
    } catch {
      return;
    }
    await Promise.all(
      files
        .filter((file) => file.endsWith(CLIP_FRAMES_EXTENSION) && !names.has(file))
        .map((file) => rm(join(clipsDirectory, file), { force: true })),
    );
  }

  async function getCachedClipFrames(id: string, path: string): Promise<Uint8Array | undefined> {
    const frameCount = frameCounts.get(id);
    if (frameCount === undefined) {
      return undefined;
    }
    let data: Buffer;
    try {
      data = await readFile(path);
    } catch {
      return undefined;
    }
    if (!isEncodedClipFrames(data, frameCount)) {
      log(`Ignoring corrupt cached clip ${id}`);
      return undefined;
    }
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return {
    getState,
    getAnimations: () =>
      getItems("animations", storedAnimationSchema, () => source.getAnimations()),
    async getClips() {
      const clips = await getItems("clips", clipInfoSchema, () => source.getClips());
      frameCounts.clear();
      for (const { id, durations } of clips) {
        frameCounts.set(id, durations.length);
      }
      if (entries.get("clips")?.origin === "server") {
        await removeUnusedClipFrames(clips);
      }
      return clips;
    },
    async getClipFrames(id) {
      if (!clipIdSchema.safeParse(id).success) {
        return source.getClipFrames(id);
      }
      const path = join(clipsDirectory, `${id}${CLIP_FRAMES_EXTENSION}`);
      const cached = await getCachedClipFrames(id, path);
      if (cached) {
        return cached;
      }
      const frames = await source.getClipFrames(id);
      try {
        await writeAtomic(path, frames);
      } catch (error) {
        log(`Failed to cache clip ${id}: ${getErrorMessage(error)}`);
      }
      return frames;
    },
  };
}

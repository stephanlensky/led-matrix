import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { CHANNELS, HEIGHT, WIDTH } from "@led-matrix/core";
import { z } from "zod";
import type { RecordingFile } from "../shared/api.ts";

const RECORDING_EXTENSION = ".mkv";
const THUMBNAIL_POSITION = 0.5;
const CONCURRENCY = 4;

const execFileAsync = promisify(execFile);

const probeSchema = z.object({
  format: z.object({
    duration: z.coerce.number().optional(),
    tags: z.object({ creation_time: z.string().optional() }).optional(),
  }),
});

export type RecordingMetadata = {
  durationMs: number | null;
  recordedAt: number | null;
  thumbnail: Uint8Array | null;
};

export type RecordingLibraryOptions = {
  getMetadata?: (path: string) => Promise<RecordingMetadata>;
};

type CacheEntry = { key: string; metadata: Promise<RecordingMetadata> };

export function getProbeMetadata(output: string): Omit<RecordingMetadata, "thumbnail"> {
  const { format } = probeSchema.parse(JSON.parse(output));
  const duration = format.duration;
  const recordedAt = Date.parse(format.tags?.creation_time ?? "");
  return {
    durationMs: duration !== undefined && Number.isFinite(duration) ? duration * 1000 : null,
    recordedAt: Number.isNaN(recordedAt) ? null : recordedAt,
  };
}

async function getThumbnail(path: string, positionMs: number): Promise<Uint8Array | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-ss",
        (positionMs / 1000).toFixed(3),
        "-i",
        path,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ],
      { encoding: "buffer" },
    );
    return stdout.length === WIDTH * HEIGHT * CHANNELS ? new Uint8Array(stdout) : null;
  } catch {
    return null;
  }
}

async function getFileMetadata(path: string): Promise<RecordingMetadata> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-of",
      "json",
      "-show_entries",
      "format=duration:format_tags=creation_time",
      path,
    ]);
    const metadata = getProbeMetadata(stdout);
    const thumbnail = await getThumbnail(path, (metadata.durationMs ?? 0) * THUMBNAIL_POSITION);
    return { ...metadata, thumbnail };
  } catch {
    return { durationMs: null, recordedAt: null, thumbnail: null };
  }
}

async function getLimited<T, R>(
  items: readonly T[],
  limit: number,
  getValue: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const entries = items.entries();
  async function run(): Promise<void> {
    const entry = entries.next();
    if (entry.done) {
      return;
    }
    const [index, item] = entry.value;
    results[index] = await getValue(item);
    await run();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export function createRecordingLibrary({
  getMetadata = getFileMetadata,
}: RecordingLibraryOptions = {}) {
  const cache = new Map<string, CacheEntry>();

  function getCachedMetadata(path: string, key: string): Promise<RecordingMetadata> {
    const entry = cache.get(path);
    if (entry?.key === key) {
      return entry.metadata;
    }
    const metadata = getMetadata(path);
    cache.set(path, { key, metadata });
    return metadata;
  }

  return {
    async getFiles(directory: string): Promise<RecordingFile[]> {
      let names: string[];
      try {
        names = await readdir(directory);
      } catch {
        return [];
      }
      const paths = names
        .filter((name) => name.toLowerCase().endsWith(RECORDING_EXTENSION))
        .map((name) => join(directory, name));
      const files = await getLimited(paths, CONCURRENCY, async (path) => {
        const stats = await stat(path).catch(() => undefined);
        if (!stats) {
          return undefined;
        }
        const { size, mtimeMs } = stats;
        const { durationMs, recordedAt, thumbnail } = await getCachedMetadata(
          path,
          `${size}:${mtimeMs}`,
        );
        const file: RecordingFile = {
          path,
          name: path.slice(directory.length + 1),
          recordedAt: recordedAt ?? mtimeMs,
          bytes: size,
          durationMs,
          thumbnail,
        };
        return file;
      });
      return files
        .filter((file) => file !== undefined)
        .toSorted((a, b) => b.recordedAt - a.recordedAt);
    },
  };
}

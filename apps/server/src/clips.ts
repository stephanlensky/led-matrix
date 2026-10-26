import type { DatabaseSync } from "node:sqlite";
import {
  type Clip,
  type ClipInfo,
  type ClipLibrary,
  clipInfoSchema,
  createClip,
  getEncodedFrameCount,
} from "@led-matrix/core";
import { z } from "zod";

const infoRowSchema = clipInfoSchema.extend({
  durations: z
    .string()
    .transform((durations): unknown => JSON.parse(durations))
    .pipe(clipInfoSchema.shape.durations),
});

const framesRowSchema = z.object({ frames: z.instanceof(Uint8Array) });

export type ClipStore = ReturnType<typeof createClipStore>;

export function createClipStore(connection: DatabaseSync) {
  const listStatement = connection.prepare(
    "SELECT id, name, source, durations FROM clips ORDER BY created_at, id",
  );
  const getStatement = connection.prepare(
    "SELECT id, name, source, durations FROM clips WHERE id = ?",
  );
  const getFramesStatement = connection.prepare("SELECT frames FROM clips WHERE id = ?");
  const insertStatement = connection.prepare(
    "INSERT INTO clips (id, name, source, durations, frames) VALUES (?, ?, ?, ?, ?)",
  );
  const renameStatement = connection.prepare("UPDATE clips SET name = ? WHERE id = ?");
  const deleteStatement = connection.prepare("DELETE FROM clips WHERE id = ?");
  const cache = new Map<string, Clip>();

  function get(id: string): ClipInfo | undefined {
    const row = getStatement.get(id);
    return row && infoRowSchema.parse(row);
  }

  function getEncodedFrames(id: string): Uint8Array | undefined {
    const row = getFramesStatement.get(id);
    return row && framesRowSchema.parse(row).frames;
  }

  const library: ClipLibrary = {
    getClip(id) {
      const cached = cache.get(id);
      if (cached) {
        return cached;
      }
      const info = get(id);
      const frames = getEncodedFrames(id);
      if (!info || !frames) {
        return undefined;
      }
      const clip = createClip(frames, info.durations);
      cache.set(id, clip);
      return clip;
    },
  };

  return {
    library,
    list(): ClipInfo[] {
      return listStatement.all().map((row) => infoRowSchema.parse(row));
    },
    get,
    getEncodedFrames,
    create(info: ClipInfo, frames: Uint8Array): ClipInfo {
      if (getEncodedFrameCount(frames) !== info.durations.length) {
        throw new Error("Frame data does not match the frame count");
      }
      insertStatement.run(info.id, info.name, info.source, JSON.stringify(info.durations), frames);
      return info;
    },
    rename(id: string, name: string): ClipInfo | undefined {
      renameStatement.run(name, id);
      return get(id);
    },
    delete(id: string): boolean {
      cache.delete(id);
      return deleteStatement.run(id).changes > 0;
    },
  };
}

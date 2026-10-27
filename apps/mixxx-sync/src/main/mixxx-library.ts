import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { inflate } from "node:zlib";
import { z } from "zod";
import type { Beats } from "../shared/beats.ts";
import type {
  MixxxCue,
  MixxxCueType,
  Playlist,
  Track,
  TrackDetails,
  Waveform,
  WaveformType,
} from "../shared/library.ts";
import {
  type Field,
  getBool,
  getDouble,
  getFields,
  getInt32,
  getMessage,
  getMessages,
  getRepeatedInt32,
} from "./protobuf.ts";

const inflateAsync = promisify(inflate);

const cueTypes: Partial<Record<number, MixxxCueType>> = {
  1: "hotcue",
  2: "main",
  4: "loop",
  5: "jump",
  6: "intro",
  7: "outro",
};

const analysisTypes: Record<WaveformType, string> = { full: "1", summary: "2" };

const waveformCacheSizes: Record<WaveformType, number> = { full: 8, summary: 500 };

const trackColumns = `
  l.id AS id,
  tl.location AS location,
  COALESCE(l.artist, '') AS artist,
  COALESCE(l.title, '') AS title,
  COALESCE(l.album, '') AS album,
  COALESCE(l.tracknumber, '') AS trackNumber,
  COALESCE(l.duration, 0) AS duration,
  COALESCE(l.bpm, 0) AS bpm,
  COALESCE(l.samplerate, 0) AS sampleRate,
  l.color AS color`;

const trackSource = `
  library l JOIN track_locations tl ON tl.id = l.location
  WHERE l.mixxx_deleted = 0 AND tl.fs_deleted = 0`;

const playlistRowSchema = z.object({ id: z.number(), name: z.string(), trackCount: z.number() });

const trackRowSchema = z
  .object({
    id: z.number(),
    location: z.string(),
    artist: z.string(),
    title: z.string(),
    album: z.string(),
    trackNumber: z.string(),
    duration: z.number(),
    bpm: z.number(),
    sampleRate: z.number(),
    color: z.number().nullable(),
    playlistPosition: z.number().optional(),
  })
  .transform((row): Track => ({
    ...row,
    color: row.color === null ? undefined : row.color & 0xffffff,
    playlistPosition: row.playlistPosition,
  }));

const trackBeatsRowSchema = z.object({
  sampleRate: z.number(),
  beats: z.instanceof(Uint8Array).nullable(),
  version: z.string().nullable(),
});

const cueRowSchema = z.object({
  type: z.number(),
  position: z.number(),
  length: z.number(),
  hotcue: z.number(),
  label: z.string(),
  color: z.number(),
});

type CueRow = z.infer<typeof cueRowSchema>;

const analysisRowSchema = z.object({ id: z.number(), checksum: z.string() });

export function getCue(row: CueRow, sampleRate: number): MixxxCue | undefined {
  const type = cueTypes[row.type];
  if (!type || sampleRate <= 0) {
    return undefined;
  }
  const getSeconds = (samples: number) => samples / 2 / sampleRate;
  const start = row.position === -1 ? undefined : getSeconds(row.position);
  return {
    type,
    hotcue: row.hotcue === -1 ? undefined : row.hotcue,
    label: row.label,
    color: row.color & 0xffffff,
    start,
    end: row.length === 0 ? undefined : (start ?? 0) + getSeconds(row.length),
  };
}

export function getBeats(
  blob: Uint8Array | null,
  version: string | null,
  sampleRate: number,
): Beats | undefined {
  if (!blob || sampleRate <= 0) {
    return undefined;
  }
  const fields = getFields(blob);
  if (version === "BeatGrid-2.0") {
    const bpm = getDouble(getMessage(fields, 1) ?? [], 1);
    const firstFrame = getInt32(getMessage(fields, 2) ?? [], 1) ?? 0;
    return bpm && bpm > 0 ? { type: "grid", bpm, firstBeat: firstFrame / sampleRate } : undefined;
  }
  if (version === "BeatMap-1.0") {
    const positions = getMessages(fields, 1)
      .filter((beat) => getBool(beat, 2) ?? true)
      .map((beat) => (getInt32(beat, 1) ?? 0) / sampleRate)
      .toSorted((a, b) => a - b);
    return positions.length >= 2 ? { type: "map", positions } : undefined;
  }
  return undefined;
}

function getSignal(fields: Field[] | undefined): Uint8Array {
  const values = getRepeatedInt32(fields ?? [], 1);
  const signal = new Uint8Array(Math.floor(values.length / 2));
  for (let index = 0; index < signal.length; index++) {
    signal[index] = Math.max(values[index * 2]!, values[index * 2 + 1]!);
  }
  return signal;
}

export function getWaveform(buffer: Uint8Array): Waveform {
  const fields = getFields(buffer);
  const filtered = getMessage(fields, 4);
  return {
    visualSampleRate: getDouble(fields, 1) ?? 0,
    low: getSignal(filtered && getMessage(filtered, 1)),
    mid: getSignal(filtered && getMessage(filtered, 2)),
    high: getSignal(filtered && getMessage(filtered, 3)),
    all: getSignal(getMessage(fields, 3)),
  };
}

export async function getUncompressed(buffer: Uint8Array): Promise<Uint8Array> {
  return inflateAsync(buffer.subarray(4));
}

export type MixxxLibrary = ReturnType<typeof createMixxxLibrary>;

export function createMixxxLibrary(getDatabasePath: () => string) {
  let database: { path: string; connection: DatabaseSync } | undefined;
  const waveforms: Record<WaveformType, Map<string, Waveform>> = {
    full: new Map(),
    summary: new Map(),
  };

  function getConnection(): DatabaseSync {
    const path = getDatabasePath();
    if (database?.path === path) {
      return database.connection;
    }
    close();
    if (!existsSync(path)) {
      throw new Error(`Mixxx database not found at ${path}`);
    }
    database = { path, connection: new DatabaseSync(path, { readOnly: true, timeout: 2000 }) };
    return database.connection;
  }

  function close(): void {
    database?.connection.close();
    database = undefined;
    waveforms.full.clear();
    waveforms.summary.clear();
  }

  function getPlaylists(): Playlist[] {
    return getConnection()
      .prepare(
        `SELECT p.id AS id, COALESCE(p.name, '') AS name,
          (SELECT COUNT(*) FROM PlaylistTracks pt
            JOIN library l ON l.id = pt.track_id
            JOIN track_locations tl ON tl.id = l.location
            WHERE pt.playlist_id = p.id AND l.mixxx_deleted = 0 AND tl.fs_deleted = 0
          ) AS trackCount
        FROM Playlists p WHERE p.hidden = 0 ORDER BY p.position, p.id`,
      )
      .all()
      .map((row) => playlistRowSchema.parse(row));
  }

  function getTracks(playlistId?: number): Track[] {
    const connection = getConnection();
    const rows =
      playlistId === undefined
        ? connection.prepare(`SELECT ${trackColumns} FROM ${trackSource} ORDER BY l.id`).all()
        : connection
            .prepare(
              `SELECT ${trackColumns}, pt.position AS playlistPosition
              FROM PlaylistTracks pt JOIN ${trackSource} AND l.id = pt.track_id
              AND pt.playlist_id = ? ORDER BY pt.position`,
            )
            .all(playlistId);
    return rows.map((row) => trackRowSchema.parse(row));
  }

  function getTrackDetails(trackId: number): TrackDetails | undefined {
    const connection = getConnection();
    const trackRow = connection
      .prepare(
        `SELECT COALESCE(samplerate, 0) AS sampleRate, beats, beats_version AS version
        FROM library WHERE id = ?`,
      )
      .get(trackId);
    if (!trackRow) {
      return undefined;
    }
    const track = trackBeatsRowSchema.parse(trackRow);
    const cueRows = connection
      .prepare(
        `SELECT type, position, length, hotcue, label, color
        FROM cues WHERE track_id = ? ORDER BY position, hotcue`,
      )
      .all(trackId)
      .map((row) => cueRowSchema.parse(row));
    return {
      cues: cueRows.flatMap((row) => getCue(row, track.sampleRate) ?? []),
      beats: getBeats(track.beats, track.version, track.sampleRate),
    };
  }

  async function getTrackWaveform(
    trackId: number,
    type: WaveformType,
  ): Promise<Waveform | undefined> {
    const path = getDatabasePath();
    const analysisRow = getConnection()
      .prepare(
        `SELECT id, COALESCE(data_checksum, '') AS checksum FROM track_analysis
        WHERE track_id = ? AND type = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(trackId, analysisTypes[type]);
    if (!analysisRow) {
      return undefined;
    }
    const analysis = analysisRowSchema.parse(analysisRow);
    const cache = waveforms[type];
    const key = `${analysis.id}:${analysis.checksum}`;
    const cached = cache.get(key);
    if (cached) {
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }
    let compressed: Buffer;
    try {
      compressed = await readFile(join(dirname(path), "analysis", String(analysis.id)));
    } catch {
      return undefined;
    }
    const waveform = getWaveform(await getUncompressed(compressed));
    cache.set(key, waveform);
    for (const oldKey of cache.keys()) {
      if (cache.size <= waveformCacheSizes[type]) {
        break;
      }
      cache.delete(oldKey);
    }
    return waveform;
  }

  return { getPlaylists, getTracks, getTrackDetails, getTrackWaveform, close };
}

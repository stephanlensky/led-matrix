import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMixxxLibrary, getBeats, getCue, getWaveform } from "./mixxx-library.ts";

function getVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = BigInt.asUintN(64, BigInt(value));
  do {
    const byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    bytes.push(remaining > 0n ? byte | 0x80 : byte);
  } while (remaining > 0n);
  return bytes;
}

function getVarintField(number: number, value: number): number[] {
  return [...getVarint(number << 3), ...getVarint(value)];
}

function getDoubleField(number: number, value: number): number[] {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  return [...getVarint((number << 3) | 1), ...new Uint8Array(view.buffer)];
}

function getMessageField(number: number, bytes: number[]): number[] {
  return [...getVarint((number << 3) | 2), ...getVarint(bytes.length), ...bytes];
}

function getUnpackedSignal(values: number[]): number[] {
  return values.flatMap((value) => getVarintField(1, value));
}

function getPackedSignal(values: number[]): number[] {
  return getMessageField(1, values.flatMap(getVarint));
}

function getWaveformBytes(getSignal: (values: number[]) => number[]): number[] {
  return [
    ...getDoubleField(1, 441),
    ...getDoubleField(2, 100),
    ...getMessageField(3, getSignal([10, 20, 255, 0])),
    ...getMessageField(4, [
      ...getMessageField(1, getSignal([1, 2, 3, 4])),
      ...getMessageField(2, getSignal([5, 6, 7, 8])),
      ...getMessageField(3, getSignal([9, 0, 0, 9])),
    ]),
  ];
}

function getQCompressed(bytes: number[]): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, deflateSync(Uint8Array.from(bytes))]);
}

describe("getBeats", () => {
  it("parses Bad Apple's beat grid", () => {
    const blob = Buffer.from("0A09090000000000406140120408889501", "hex");
    expect(getBeats(blob, "BeatGrid-2.0", 44100)).toEqual({
      type: "grid",
      bpm: 138,
      firstBeat: 19080 / 44100,
    });
  });

  it("parses a beat map and skips disabled beats", () => {
    const blob = Uint8Array.from([
      ...getMessageField(1, getVarintField(1, 44100)),
      ...getMessageField(1, [...getVarintField(1, 66150), ...getVarintField(2, 0)]),
      ...getMessageField(1, [...getVarintField(1, 88200), ...getVarintField(2, 1)]),
      ...getMessageField(1, getVarintField(1, -22050)),
    ]);
    expect(getBeats(blob, "BeatMap-1.0", 44100)).toEqual({
      type: "map",
      positions: [-0.5, 1, 2],
    });
  });

  it("ignores unknown versions and missing grids", () => {
    expect(getBeats(Uint8Array.from([]), "BeatGrid-1.0", 44100)).toBeUndefined();
    expect(getBeats(null, null, 44100)).toBeUndefined();
    expect(getBeats(Uint8Array.from([]), "BeatGrid-2.0", 44100)).toBeUndefined();
  });
});

describe("getCue", () => {
  const row = { type: 1, position: 88200, length: 0, hotcue: 2, label: "Drop", color: 0xff00ff00 };

  it("converts engine samples to seconds", () => {
    expect(getCue(row, 44100)).toEqual({
      type: "hotcue",
      hotcue: 2,
      label: "Drop",
      color: 0x00ff00,
      start: 1,
      end: undefined,
    });
  });

  it("measures ranges from the track start when the start is unset", () => {
    expect(
      getCue({ ...row, type: 7, position: -1, length: 176400, hotcue: -1 }, 44100),
    ).toMatchObject({ type: "outro", hotcue: undefined, start: undefined, end: 2 });
    expect(getCue({ ...row, type: 4, length: 88200 }, 44100)).toMatchObject({ start: 1, end: 2 });
  });

  it("skips hidden cue types", () => {
    expect(getCue({ ...row, type: 8 }, 44100)).toBeUndefined();
  });
});

describe("getWaveform", () => {
  const expected = {
    visualSampleRate: 441,
    all: Uint8Array.from([20, 255]),
    low: Uint8Array.from([2, 4]),
    mid: Uint8Array.from([6, 8]),
    high: Uint8Array.from([9, 9]),
  };

  it("reads unpacked signals as the max of both channels", () => {
    expect(getWaveform(Uint8Array.from(getWaveformBytes(getUnpackedSignal)))).toEqual(expected);
  });

  it("reads packed signals", () => {
    expect(getWaveform(Uint8Array.from(getWaveformBytes(getPackedSignal)))).toEqual(expected);
  });
});

describe("createMixxxLibrary", () => {
  let directory: string;
  let databasePath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "mixxx-library-"));
    databasePath = join(directory, "mixxxdb.sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE track_locations (id INTEGER PRIMARY KEY, location TEXT, fs_deleted INTEGER);
      CREATE TABLE library (id INTEGER PRIMARY KEY, artist TEXT, title TEXT, album TEXT,
        tracknumber TEXT, location INTEGER, duration FLOAT, samplerate INTEGER, bpm FLOAT,
        mixxx_deleted INTEGER, beats BLOB, beats_version TEXT, color INTEGER);
      CREATE TABLE Playlists (id INTEGER PRIMARY KEY, name TEXT, position INTEGER,
        hidden INTEGER, locked INTEGER);
      CREATE TABLE PlaylistTracks (id INTEGER PRIMARY KEY, playlist_id INTEGER,
        track_id INTEGER, position INTEGER);
      CREATE TABLE cues (id INTEGER PRIMARY KEY, track_id INTEGER, type INTEGER,
        position INTEGER, length INTEGER, hotcue INTEGER, label TEXT, color INTEGER);
      CREATE TABLE track_analysis (id INTEGER PRIMARY KEY, track_id INTEGER, type TEXT,
        version TEXT, data_checksum TEXT);
      INSERT INTO track_locations VALUES (1, '/music/a.flac', 0), (2, '/music/b.ogg', 0),
        (3, '/music/gone.mp3', 1), (4, '/music/c.mp3', 0);
      INSERT INTO library VALUES
        (1, 'Alice', 'A', 'Album', '1', 1, 120.5, 44100, 138, 0,
          X'0A09090000000000406140120408889501', 'BeatGrid-2.0', 4294901760),
        (2, NULL, 'B', NULL, NULL, 2, 60, 48000, 120, 0, NULL, NULL, NULL),
        (3, 'Gone', 'Gone', '', '', 3, 1, 44100, 0, 0, NULL, NULL, NULL),
        (4, 'Deleted', 'C', '', '', 4, 1, 44100, 0, 1, NULL, NULL, NULL);
      INSERT INTO Playlists VALUES (1, 'Set', 1, 0, 0), (2, 'Auto DJ', 0, 1, 0),
        (3, 'Empty', 2, 0, 0);
      INSERT INTO PlaylistTracks VALUES (1, 1, 2, 1), (2, 1, 3, 2), (3, 1, 1, 3), (4, 2, 1, 1);
      INSERT INTO cues VALUES (1, 1, 1, 88200, 0, 0, 'Drop', 4294901760),
        (2, 1, 8, 1000, 0, -1, '', 0), (3, 1, 2, 0, 0, -1, '', 0);
      INSERT INTO track_analysis VALUES (10, 1, '2', 'WaveformSummary-5.0', 'abc'),
        (11, 1, '1', 'Waveform-6.1', 'def');
    `);
    database.close();
    await mkdir(join(directory, "analysis"));
    await writeFile(
      join(directory, "analysis", "10"),
      getQCompressed(getWaveformBytes(getUnpackedSignal)),
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true });
  });

  it("lists user playlists with their available track counts", () => {
    const library = createMixxxLibrary(() => databasePath);
    expect(library.getPlaylists()).toEqual([
      { id: 1, name: "Set", trackCount: 2 },
      { id: 3, name: "Empty", trackCount: 0 },
    ]);
    library.close();
  });

  it("lists all available tracks", () => {
    const library = createMixxxLibrary(() => databasePath);
    expect(library.getTracks()).toEqual([
      {
        id: 1,
        location: "/music/a.flac",
        artist: "Alice",
        title: "A",
        album: "Album",
        trackNumber: "1",
        duration: 120.5,
        bpm: 138,
        sampleRate: 44100,
        color: 0xff0000,
        playlistPosition: undefined,
      },
      expect.objectContaining({ id: 2, artist: "", album: "", color: undefined }),
    ]);
    library.close();
  });

  it("lists playlist tracks in playlist order", () => {
    const library = createMixxxLibrary(() => databasePath);
    expect(
      library.getTracks(1).map(({ id, playlistPosition }) => ({ id, playlistPosition })),
    ).toEqual([
      { id: 2, playlistPosition: 1 },
      { id: 1, playlistPosition: 3 },
    ]);
    library.close();
  });

  it("reads cues and beats", () => {
    const library = createMixxxLibrary(() => databasePath);
    expect(library.getTrackDetails(1)).toEqual({
      cues: [
        expect.objectContaining({ type: "main", start: 0 }),
        expect.objectContaining({ type: "hotcue", hotcue: 0, label: "Drop", start: 1 }),
      ],
      beats: { type: "grid", bpm: 138, firstBeat: 19080 / 44100 },
    });
    expect(library.getTrackDetails(2)).toEqual({ cues: [], beats: undefined });
    expect(library.getTrackDetails(99)).toBeUndefined();
    library.close();
  });

  it("gets locations of available tracks only", () => {
    const library = createMixxxLibrary(() => databasePath);
    expect(library.getTrackLocation(1)).toBe("/music/a.flac");
    expect(library.getTrackLocation(3)).toBeUndefined();
    expect(library.getTrackLocation(4)).toBeUndefined();
    expect(library.getTrackLocation(99)).toBeUndefined();
    library.close();
  });

  it("reads waveforms from the analysis directory", async () => {
    const library = createMixxxLibrary(() => databasePath);
    const waveform = await library.getTrackWaveform(1, "summary");
    expect(waveform?.all).toEqual(Uint8Array.from([20, 255]));
    expect(await library.getTrackWaveform(1, "summary")).toBe(waveform);
    expect(await library.getTrackWaveform(1, "full")).toBeUndefined();
    expect(await library.getTrackWaveform(2, "summary")).toBeUndefined();
    library.close();
  });

  it("reopens when the database path changes", () => {
    let path = join(directory, "missing.sqlite");
    const library = createMixxxLibrary(() => path);
    expect(() => library.getPlaylists()).toThrow(/not found/);
    path = databasePath;
    expect(library.getPlaylists()).toHaveLength(2);
    library.close();
  });
});

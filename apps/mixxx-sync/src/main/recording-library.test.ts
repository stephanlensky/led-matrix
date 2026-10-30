import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type RecordingMetadata,
  createRecordingLibrary,
  getProbeMetadata,
} from "./recording-library.ts";

describe("getProbeMetadata", () => {
  it("reads the duration and creation time", () => {
    expect(
      getProbeMetadata(
        JSON.stringify({
          format: { duration: "18.500000", tags: { creation_time: "2026-10-30T03:22:03.000000Z" } },
        }),
      ),
    ).toEqual({ durationMs: 18_500, recordedAt: Date.parse("2026-10-30T03:22:03Z") });
  });

  it("allows a recording that is still being written", () => {
    expect(getProbeMetadata(JSON.stringify({ format: {} }))).toEqual({
      durationMs: null,
      recordedAt: null,
    });
  });
});

describe("createRecordingLibrary", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
  });

  async function setup() {
    const directory = await mkdtemp(join(tmpdir(), "recordings-"));
    directories.push(directory);
    const getMetadata = vi.fn<(path: string) => Promise<RecordingMetadata>>(async (path) => ({
      durationMs: 1000,
      recordedAt: path.endsWith("new.mkv") ? 2000 : null,
      thumbnail: null,
    }));
    return { directory, getMetadata, library: createRecordingLibrary({ getMetadata }) };
  }

  it("lists mkv files newest first", async () => {
    const { directory, library } = await setup();
    await writeFile(join(directory, "old.mkv"), "a");
    await utimes(join(directory, "old.mkv"), 1, 1);
    await writeFile(join(directory, "new.mkv"), "bb");
    await writeFile(join(directory, "notes.txt"), "");
    const files = await library.getFiles(directory);
    expect(files.map(({ name, recordedAt, bytes }) => ({ name, recordedAt, bytes }))).toEqual([
      { name: "new.mkv", recordedAt: 2000, bytes: 2 },
      { name: "old.mkv", recordedAt: 1000, bytes: 1 },
    ]);
  });

  it("reads metadata again only when a file changes", async () => {
    const { directory, library, getMetadata } = await setup();
    const path = join(directory, "a.mkv");
    await writeFile(path, "a");
    await library.getFiles(directory);
    await library.getFiles(directory);
    expect(getMetadata).toHaveBeenCalledTimes(1);
    await writeFile(path, "ab");
    await library.getFiles(directory);
    expect(getMetadata).toHaveBeenCalledTimes(2);
  });

  it("returns nothing for a missing directory", async () => {
    const { directory, library } = await setup();
    expect(await library.getFiles(join(directory, "missing"))).toEqual([]);
  });
});

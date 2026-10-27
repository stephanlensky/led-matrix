import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MappingFile, MappingState } from "../shared/mapping.ts";
import { createMappingFile, getMappingText } from "./mapping-file.ts";

const mapping: MappingFile = {
  tracks: {
    "/music/a.flac": [
      { beat: -1, end: 687, animation: "bad-apple" },
      { beat: 700, animation: "cat", section: "Spawn" },
    ],
    "/music/b.flac": [{ beat: 0, animation: "plasma" }],
  },
};

const mappingText = `{
  "tracks": {
    "/music/a.flac": [
      { "beat": -1, "end": 687, "animation": "bad-apple" },
      { "beat": 700, "animation": "cat", "section": "Spawn" }
    ],
    "/music/b.flac": [
      { "beat": 0, "animation": "plasma" }
    ]
  }
}
`;

describe("getMappingText", () => {
  it("writes one cue per line", () => {
    expect(getMappingText(mapping)).toBe(mappingText);
  });

  it("writes an empty mapping", () => {
    expect(getMappingText({ tracks: {} })).toBe('{\n  "tracks": {}\n}\n');
  });
});

describe("createMappingFile", () => {
  let directory: string;
  let path: string;
  let changes: MappingState[];
  let mappingFile: ReturnType<typeof createMappingFile>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "mapping-"));
    path = join(directory, "mapping.json");
    changes = [];
    mappingFile = createMappingFile({
      getPath: () => path,
      onChange: (state) => changes.push(state),
    });
  });

  afterEach(async () => {
    mappingFile.close();
    await rm(directory, { recursive: true });
  });

  it("returns an empty mapping when the file is missing", async () => {
    expect(await mappingFile.getMapping()).toEqual({ mapping: { tracks: {} } });
  });

  it("returns an error for an invalid file", async () => {
    await writeFile(path, '{ "tracks": { "a": [] } }');
    expect(await mappingFile.getMapping()).toHaveProperty("error");
  });

  it("writes atomically and ignores its own writes", async () => {
    await mappingFile.getMapping();
    expect(await mappingFile.setMapping(mapping)).toEqual(mapping);
    expect(await readFile(path, "utf8")).toBe(mappingText);
    expect(await readdir(directory)).toEqual(["mapping.json"]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(changes).toEqual([]);
  });

  it("rejects an invalid mapping", async () => {
    await expect(mappingFile.setMapping({ tracks: { a: [{ beat: 0 }] } })).rejects.toThrow(
      "First cue needs an animation",
    );
    expect(await readdir(directory)).toEqual([]);
  });

  it("reports external changes", async () => {
    await mappingFile.getMapping();
    await writeFile(path, mappingText);
    await vi.waitFor(() => expect(changes).toEqual([{ mapping }]));
  });
});

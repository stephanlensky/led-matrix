import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTrackAudioUrl } from "../shared/library.ts";
import {
  createTrackAudioHandler,
  getByteRange,
  getContentType,
  getTrackId,
} from "./track-audio.ts";

describe("getByteRange", () => {
  it("returns undefined without a range header", () => {
    expect(getByteRange(null, 100)).toBeUndefined();
  });

  it("parses bounded, open and suffix ranges", () => {
    expect(getByteRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(getByteRange("bytes=50-", 100)).toEqual({ start: 50, end: 99 });
    expect(getByteRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
    expect(getByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(getByteRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
  });

  it("rejects unsatisfiable or malformed ranges", () => {
    expect(getByteRange("bytes=100-", 100)).toBeNull();
    expect(getByteRange("bytes=10-5", 100)).toBeNull();
    expect(getByteRange("bytes=-0", 100)).toBeNull();
    expect(getByteRange("bytes=-", 100)).toBeNull();
    expect(getByteRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(getByteRange("items=0-1", 100)).toBeNull();
  });
});

describe("getContentType", () => {
  it("maps audio extensions case-insensitively", () => {
    expect(getContentType("/a/b.FLAC")).toBe("audio/flac");
    expect(getContentType("/a/b.ogg")).toBe("audio/ogg");
    expect(getContentType("/a/b.m4a")).toBe("audio/mp4");
    expect(getContentType("/a/b")).toBe("application/octet-stream");
  });
});

describe("getTrackId", () => {
  it("reads the id from track audio urls", () => {
    expect(getTrackId(getTrackAudioUrl(22054))).toBe(22054);
    expect(getTrackId("mixxx-track://track/abc")).toBeUndefined();
    expect(getTrackId("mixxx-track://track/0")).toBeUndefined();
  });
});

describe("createTrackAudioHandler", () => {
  let directory: string;
  let path: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "track-audio-"));
    path = join(directory, "a.flac");
    await writeFile(path, "0123456789");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true });
  });

  function getHandler() {
    return createTrackAudioHandler((trackId) =>
      trackId === 1 ? path : trackId === 2 ? join(directory, "missing.flac") : undefined,
    );
  }

  it("serves the whole file", async () => {
    const response = await getHandler()(new Request(getTrackAudioUrl(1)));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/flac");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Length")).toBe("10");
    expect(await response.text()).toBe("0123456789");
  });

  it("serves byte ranges", async () => {
    const response = await getHandler()(
      new Request(getTrackAudioUrl(1), { headers: { Range: "bytes=3-5" } }),
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 3-5/10");
    expect(response.headers.get("Content-Length")).toBe("3");
    expect(await response.text()).toBe("345");
  });

  it("rejects unsatisfiable ranges", async () => {
    const response = await getHandler()(
      new Request(getTrackAudioUrl(1), { headers: { Range: "bytes=20-" } }),
    );
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */10");
  });

  it("returns 404 for unknown tracks and missing files", async () => {
    expect((await getHandler()(new Request(getTrackAudioUrl(3)))).status).toBe(404);
    expect((await getHandler()(new Request(getTrackAudioUrl(2)))).status).toBe(404);
  });
});

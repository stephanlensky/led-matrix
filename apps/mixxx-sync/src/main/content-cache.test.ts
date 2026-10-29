import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ClipInfo,
  type StoredAnimation,
  CLIP_FRAME_BYTES,
  encodeClipFrames,
  storedAnimationSchema,
} from "@led-matrix/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CachedContentOptions, createCachedContent } from "./content-cache.ts";
import type { ContentSource } from "./server.ts";

function getAnimation(id: string, color = "#ff0000"): StoredAnimation {
  return storedAnimationSchema.parse({
    id,
    name: id,
    sections: [
      { mode: { type: "loop", beats: 4 }, layers: [{ effect: "solid", params: { color } }] },
    ],
  });
}

function getClipInfo(id: string, frameCount = 2): ClipInfo {
  return { id, name: id, source: "gif", durations: Array.from({ length: frameCount }, () => 100) };
}

function getClipFrames(frameCount = 2, value = 0): Uint8Array {
  return encodeClipFrames(new Uint8Array(frameCount * CLIP_FRAME_BYTES).fill(value));
}

function createFakeSource() {
  const server = {
    animations: [getAnimation("red")],
    clips: [getClipInfo("loop")],
    frames: new Map([["loop", getClipFrames()]]),
    error: undefined as Error | undefined,
    frameRequests: [] as string[],
  };
  function check(): void {
    if (server.error) {
      throw server.error;
    }
  }
  const source: ContentSource = {
    async getAnimations() {
      check();
      return server.animations;
    },
    async getClips() {
      check();
      return server.clips;
    },
    async getClipFrames(id) {
      check();
      server.frameRequests.push(id);
      const frames = server.frames.get(id);
      if (!frames) {
        throw new Error(`Clip ${id} not found`);
      }
      return frames;
    },
  };
  return { server, source };
}

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "content-cache-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function createContent(source: ContentSource, options: Partial<CachedContentOptions> = {}) {
  const logs: string[] = [];
  const content = createCachedContent({
    source,
    directory,
    getTime: () => 1000,
    log: (message) => logs.push(message),
    ...options,
  });
  return { content, logs };
}

async function loadAll(content: ContentSource) {
  const animations = await content.getAnimations();
  const clips = await content.getClips();
  const frames = await Promise.all(clips.map(({ id }) => content.getClipFrames(id)));
  return { animations, clips, frames };
}

describe("createCachedContent", () => {
  it("writes the cache when the server responds", async () => {
    const { server, source } = createFakeSource();
    const { content } = createContent(source);
    const loaded = await loadAll(content);
    expect(loaded.animations).toEqual(server.animations);
    expect(content.getState()).toEqual({ origin: "server", savedAt: 1000, error: null });
    const animationsFile = JSON.parse(await readFile(join(directory, "animations.json"), "utf8"));
    expect(animationsFile).toEqual({ savedAt: 1000, items: server.animations });
    const clipsFile = JSON.parse(await readFile(join(directory, "clips.json"), "utf8"));
    expect(clipsFile.items).toEqual(server.clips);
    expect(new Uint8Array(await readFile(join(directory, "clips", "loop.bin")))).toEqual(
      server.frames.get("loop"),
    );
    expect(
      (await readdir(join(directory, "clips"))).filter((file) => file.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("falls back to the cache when the server is unreachable", async () => {
    const { server, source } = createFakeSource();
    await loadAll(createContent(source).content);
    server.error = new Error("fetch failed");
    server.frameRequests = [];
    const states: unknown[] = [];
    const { content, logs } = createContent(source, {
      getTime: () => 5000,
      onState: (state) => states.push(state),
    });
    const loaded = await loadAll(content);
    expect(loaded.animations).toEqual(server.animations);
    expect(loaded.clips).toEqual(server.clips);
    expect(loaded.frames).toEqual([server.frames.get("loop")]);
    expect(server.frameRequests).toEqual([]);
    expect(content.getState()).toEqual({ origin: "cache", savedAt: 1000, error: "fetch failed" });
    expect(states.at(-1)).toEqual(content.getState());
    expect(logs.some((message) => message.includes("Using animations cached at"))).toBe(true);
  });

  it("rethrows the server error when there is no cache", async () => {
    const { server, source } = createFakeSource();
    server.error = new Error("fetch failed");
    const { content } = createContent(source);
    await expect(content.getAnimations()).rejects.toThrow("fetch failed");
    await expect(content.getClips()).rejects.toThrow("fetch failed");
    expect(content.getState()).toEqual({ origin: null, savedAt: null, error: null });
  });

  it("ignores a corrupt cache", async () => {
    const { server, source } = createFakeSource();
    await loadAll(createContent(source).content);
    await writeFile(join(directory, "animations.json"), '{"savedAt": 1000, "items": [{"id": 1}]');
    await writeFile(join(directory, "clips.json"), "not json");
    server.error = new Error("fetch failed");
    const { content, logs } = createContent(source);
    await expect(content.getAnimations()).rejects.toThrow("fetch failed");
    await expect(content.getClips()).rejects.toThrow("fetch failed");
    expect(logs.filter((message) => message.startsWith("Ignoring corrupt cache"))).toHaveLength(2);
  });

  it("downloads clip frames again when the cached file is corrupt", async () => {
    const { server, source } = createFakeSource();
    await loadAll(createContent(source).content);
    const path = join(directory, "clips", "loop.bin");
    const frames = await readFile(path);
    await writeFile(path, frames.subarray(0, frames.length - 4));
    server.frameRequests = [];
    const { content, logs } = createContent(source);
    const loaded = await loadAll(content);
    expect(loaded.frames).toEqual([server.frames.get("loop")]);
    expect(server.frameRequests).toEqual(["loop"]);
    expect(logs).toContain("Ignoring corrupt cached clip loop");
    expect(new Uint8Array(await readFile(path))).toEqual(server.frames.get("loop"));
  });

  it("refreshes the cache when the server is reachable again", async () => {
    const { server, source } = createFakeSource();
    let time = 1000;
    const { content, logs } = createContent(source, { getTime: () => time });
    await loadAll(content);
    server.error = new Error("fetch failed");
    await loadAll(content);
    expect(content.getState().origin).toBe("cache");
    server.error = undefined;
    server.animations = [getAnimation("blue", "#0000ff")];
    server.clips = [getClipInfo("other", 3)];
    server.frames.set("other", getClipFrames(3, 7));
    time = 9000;
    const loaded = await loadAll(content);
    expect(loaded.animations).toEqual(server.animations);
    expect(content.getState()).toEqual({ origin: "server", savedAt: 9000, error: null });
    expect(logs).toContain("Refreshed cached animations from the server");
    expect(await readdir(join(directory, "clips"))).toEqual(["other.bin"]);

    server.error = new Error("fetch failed");
    const offline = await loadAll(createContent(source).content);
    expect(offline.animations).toEqual([getAnimation("blue", "#0000ff")]);
    expect(offline.clips).toEqual([getClipInfo("other", 3)]);
    expect(offline.frames).toEqual([server.frames.get("other")]);
  });
});

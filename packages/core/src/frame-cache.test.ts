import { describe, expect, it } from "vitest";
import { createFrame } from "./frame.ts";
import { createFrameCache } from "./frame-cache.ts";

const FRAME_BYTES = createFrame().byteLength;

describe("frame cache", () => {
  it("returns stored frames", () => {
    const cache = createFrameCache();
    const frame = createFrame();
    cache.set("a", frame);
    expect(cache.get("a")).toBe(frame);
    expect(cache.get("b")).toBeUndefined();
  });

  it("evicts the least recently used frames over the byte limit", () => {
    const cache = createFrameCache({ maxBytes: FRAME_BYTES * 2 });
    cache.set("a", createFrame());
    cache.set("b", createFrame());
    cache.get("a");
    cache.set("c", createFrame());
    expect(cache.getSize()).toBe(2);
    expect(cache.getBytes()).toBe(FRAME_BYTES * 2);
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBeDefined();
  });

  it("replaces frames stored under the same key", () => {
    const cache = createFrameCache();
    const frame = createFrame();
    cache.set("a", createFrame());
    cache.set("a", frame);
    expect(cache.getSize()).toBe(1);
    expect(cache.getBytes()).toBe(FRAME_BYTES);
    expect(cache.get("a")).toBe(frame);
  });
});

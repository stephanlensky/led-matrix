import {
  type AnimationInput,
  type Frame,
  type StoredAnimation,
  createFrame,
  createPlaybackEngine,
  encodeClipFrames,
  storedAnimationSchema,
  CLIP_FRAME_BYTES,
} from "@led-matrix/core";
import { describe, expect, it, vi } from "vitest";
import type { RenderEvent, RenderRequest } from "./render-protocol.ts";
import { createClipStore, createRenderService } from "./render-service.ts";

function getAnimation(id: string, color: string): StoredAnimation {
  const input: AnimationInput & { id: string } = {
    id,
    name: id,
    sections: [
      { mode: { type: "loop", beats: 4 }, layers: [{ effect: "solid", params: { color } }] },
      { mode: { type: "loop", beats: 4 }, layers: [{ effect: "solid", params: { color } }] },
    ],
  };
  return storedAnimationSchema.parse(input);
}

function setup() {
  const render = vi.fn<() => Frame>(() => createFrame());
  const engine = createPlaybackEngine({ renderer: { render }, fps: 30, bpm: 120 });
  const clips = createClipStore();
  const events: RenderEvent[] = [];
  const setBrightness = vi.fn<(brightness: number) => void>();
  const service = createRenderService({
    engine,
    clips,
    setBrightness,
    send: (event) => events.push(event),
  });
  let nextId = 0;

  function request(value: RenderRequest): RenderEvent | undefined {
    const id = nextId++;
    service.handle({ type: "request", id, request: value });
    return events.find((event) => event.type === "response" && event.id === id);
  }

  return { engine, clips, events, setBrightness, service, render, request };
}

describe("createRenderService", () => {
  it("plays a loaded animation", () => {
    const { service, request } = setup();
    service.handle({ type: "setAnimations", animations: [getAnimation("red", "#ff0000")] });
    const response = request({
      type: "play",
      request: { id: "red", section: 1, beat: 2, bpm: 128 },
    });
    expect(response).toMatchObject({
      type: "response",
      state: { animationId: "red", bpm: 128, section: { index: 1 } },
    });
  });

  it("reports state changes", () => {
    const { service, events, request } = setup();
    service.handle({ type: "setAnimations", animations: [getAnimation("red", "#ff0000")] });
    request({ type: "play", request: { id: "red", section: 0, beat: 0, bpm: 120 } });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "state",
        state: expect.objectContaining({ animationId: "red" }),
      }),
    );
  });

  it("rejects unknown animations, sections and params", () => {
    const { service, request } = setup();
    service.handle({ type: "setAnimations", animations: [getAnimation("red", "#ff0000")] });
    expect(
      request({ type: "play", request: { id: "blue", section: 0, beat: 0, bpm: 120 } }),
    ).toMatchObject({ error: 'Animation "blue" not found' });
    expect(
      request({ type: "play", request: { id: "red", section: 2, beat: 0, bpm: 120 } }),
    ).toMatchObject({ error: 'Section 2 not found in "red"' });
    expect(
      request({
        type: "setTimeline",
        request: {
          id: "timeline",
          cues: [{ beat: 0, animationId: "red", section: 0, offset: 0, params: { mood: "x" } }],
          beat: 0,
          bpm: 120,
          paused: false,
          keepCurrent: false,
        },
      }),
    ).toMatchObject({ error: 'Parameter "mood" not found in "red"' });
  });

  it("loads timelines and sets the clock", () => {
    const { service, request } = setup();
    service.handle({ type: "setAnimations", animations: [getAnimation("red", "#ff0000")] });
    expect(
      request({
        type: "setTimeline",
        request: {
          id: "timeline",
          cues: [{ beat: 0, animationId: "red", section: 1, offset: 0 }],
          beat: 4,
          bpm: 120,
          paused: true,
          keepCurrent: false,
        },
      }),
    ).toMatchObject({ state: { timeline: { id: "timeline", cue: 0 }, beat: 4, paused: true } });
    expect(
      request({ type: "setClock", request: { beat: 8, bpm: 140, paused: true } }),
    ).toMatchObject({ state: { beat: 8, bpm: 140 } });
  });

  it("requires something to play before pausing or setting the clock", () => {
    const { request } = setup();
    expect(request({ type: "pause" })).toMatchObject({ error: "Nothing is playing" });
    expect(
      request({ type: "setClock", request: { beat: 0, bpm: 120, paused: false } }),
    ).toMatchObject({ error: "Nothing is playing" });
    expect(request({ type: "stop" })).toMatchObject({ state: { animationId: null } });
  });

  it("updates changed animations and removes deleted ones", () => {
    const { engine, service } = setup();
    const updateAnimation = vi.spyOn(engine, "updateAnimation");
    const removeAnimation = vi.spyOn(engine, "removeAnimation");
    const red = getAnimation("red", "#ff0000");
    const blue = getAnimation("blue", "#0000ff");
    service.handle({ type: "setAnimations", animations: [red, blue] });
    service.handle({
      type: "setAnimations",
      animations: [structuredClone(red), getAnimation("blue", "#0000aa")],
    });
    expect(updateAnimation).toHaveBeenCalledTimes(1);
    expect(updateAnimation).toHaveBeenCalledWith("blue", expect.anything());
    service.handle({ type: "setAnimations", animations: [red] });
    expect(removeAnimation).toHaveBeenCalledWith("blue");
  });

  it("stores clips and forwards brightness", () => {
    const { clips, service, setBrightness } = setup();
    const frames = new Uint8Array(CLIP_FRAME_BYTES * 2).fill(7);
    service.handle({
      type: "setClip",
      id: "clip",
      durations: [100, 100],
      frames: Buffer.from(encodeClipFrames(frames)).toString("base64"),
    });
    expect(clips.library.getClip("clip")?.getFrame(1)?.[0]).toBe(7);
    service.handle({ type: "removeClip", id: "clip" });
    expect(clips.library.getClip("clip")).toBeUndefined();
    service.handle({ type: "setBrightness", brightness: 40 });
    expect(setBrightness).toHaveBeenCalledWith(40);
  });
});

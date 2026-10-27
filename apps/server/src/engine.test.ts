import {
  type Frame,
  createFrame,
  type PlaybackState,
  type Renderer,
  animationSchema,
  createRenderer,
  getPixel,
} from "@led-matrix/core";
import { describe, expect, it, vi } from "vitest";
import { createPlaybackEngine } from "./engine.ts";

function createEngine(onError?: (error: unknown) => void, latency = 0) {
  const clock = { time: 0 };
  const engine = createPlaybackEngine({
    renderer: createRenderer({ fps: 30 }),
    fps: 30,
    bpm: 120,
    getTime: () => clock.time,
    getLatency: () => latency,
    onError,
  });
  return { clock, engine };
}

const strobe = animationSchema.parse({
  name: "Strobe",
  mode: { type: "loop", beats: 4 },
  layers: [{ effect: "strobe", params: { duty: 0.5 } }],
});

describe("playback engine", () => {
  it("renders black frames while idle", () => {
    const { engine } = createEngine();
    expect(engine.renderFrame().every((value) => value === 0)).toBe(true);
  });

  it("renders the active animation relative to when it started", () => {
    const { clock, engine } = createEngine();
    clock.time = 10_000;
    engine.play("strobe", strobe);
    clock.time = 10_100;
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([255, 255, 255]);
    clock.time = 10_400;
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([0, 0, 0]);
  });

  it("keeps the loop phase when the bpm changes", () => {
    const { clock, engine } = createEngine();
    engine.play("strobe", strobe);
    clock.time = 100;
    engine.setBpm(60);
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([255, 255, 255]);
    clock.time = 350;
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([255, 255, 255]);
    clock.time = 700;
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([0, 0, 0]);
  });

  it("stretches a fitted section to the requested beats", () => {
    const clock = { time: 0 };
    const render = vi.fn<Renderer["render"]>(() => createFrame());
    const engine = createPlaybackEngine({
      renderer: { render },
      fps: 30,
      bpm: 120,
      getTime: () => clock.time,
    });
    const clip = animationSchema.parse({
      name: "Clip",
      mode: { type: "once", ms: 1000 },
      layers: [{ effect: "solid" }],
    });
    engine.play("clip", clip, 0, 0, 4);
    expect(engine.getState().fit).toEqual({ section: 0, beats: 4 });
    clock.time = 1000;
    engine.renderFrame();
    expect(render.mock.lastCall?.[1]).toBeCloseTo(500);
    engine.setBpm(60);
    clock.time = 2000;
    engine.renderFrame();
    expect(render.mock.lastCall?.[1]).toBeCloseTo(750);
    clock.time = 10_000;
    engine.renderFrame();
    expect(render.mock.lastCall?.[1]).toBeCloseTo(1000);
  });

  it("starts and resyncs at a beat position", () => {
    const { clock, engine } = createEngine();
    clock.time = 1000;
    engine.play("strobe", strobe, 2.5);
    expect(engine.getState().beat).toBe(2.5);
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([0, 0, 0]);
    clock.time = 1500;
    expect(engine.getState().beat).toBe(3.5);
    engine.setBeat(1);
    expect(engine.getState().beat).toBe(1);
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([255, 255, 255]);
  });

  it("renders ahead by the latency without changing the beat", () => {
    const { clock, engine } = createEngine(undefined, 250);
    engine.play("strobe", strobe);
    clock.time = 100;
    expect(engine.getState().beat).toBe(0.2);
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([0, 0, 0]);
  });

  it("keeps the beat position when the bpm changes", () => {
    const { clock, engine } = createEngine();
    engine.play("strobe", strobe);
    clock.time = 1000;
    engine.setBpm(60);
    expect(engine.getState().beat).toBe(2);
  });

  it("notifies listeners of frames and state", () => {
    const { engine } = createEngine();
    const setFrame = vi.fn<(frame: Frame) => void>();
    const setState = vi.fn<(state: PlaybackState) => void>();
    const unsubscribe = engine.subscribe({ setFrame, setState });
    engine.play("strobe", strobe);
    engine.tick();
    unsubscribe();
    engine.tick();
    expect(setState).toHaveBeenCalledWith({
      animationId: "strobe",
      bpm: 120,
      fps: 30,
      beat: 0,
      section: { index: 0, time: 0, next: null },
      fit: null,
      paused: false,
    });
    expect(setFrame).toHaveBeenCalledOnce();
  });

  it("advances to the next section at the end of the loop and reports it", () => {
    const { clock, engine } = createEngine(undefined, 100);
    const sections = animationSchema.parse({
      name: "Sections",
      sections: [
        { mode: { type: "loop", beats: 2 }, layers: [{ effect: "solid" }] },
        { mode: { type: "once", beats: 1 }, layers: [{ effect: "solid" }] },
        { mode: { type: "loop", beats: 4 }, layers: [{ effect: "solid" }] },
      ],
    });
    const setState = vi.fn<(state: PlaybackState) => void>();
    engine.subscribe({ setState });
    engine.play("sections", sections);
    clock.time = 1500;
    expect(engine.advance()).toBe(true);
    expect(engine.getState().section).toEqual({
      index: 0,
      time: 500,
      next: { index: 1, delay: 500 },
    });
    clock.time = 2100;
    engine.tick();
    expect(engine.getState().section).toEqual({ index: 1, time: 100, next: null });
    clock.time = 2600;
    engine.tick();
    expect(engine.getState().section).toEqual({ index: 2, time: 100, next: null });
    expect(setState.mock.calls.map(([state]) => state.section?.index)).toEqual([0, 0, 1, 2]);
    expect(engine.advance()).toBe(false);
  });

  it("shifts sections with the beat and keeps their beat position when the bpm changes", () => {
    const { clock, engine } = createEngine();
    const sections = animationSchema.parse({
      name: "Sections",
      sections: [
        { mode: { type: "loop", beats: 4 }, layers: [{ effect: "solid" }] },
        { mode: { type: "loop", beats: 4 }, layers: [{ effect: "solid" }] },
        { mode: { type: "loop", beats: 4 }, layers: [{ effect: "solid" }] },
      ],
    });
    engine.play("sections", sections);
    clock.time = 500;
    engine.seek(1, 0.25);
    engine.setBeat(3);
    expect(engine.getState().section).toEqual({ index: 1, time: 1500, next: null });
    engine.advance();
    expect(engine.getState().section?.next).toEqual({ index: 2, delay: 500 });
    engine.setBpm(60);
    expect(engine.getState().section).toEqual({
      index: 1,
      time: 3000,
      next: { index: 2, delay: 1000 },
    });
    expect(engine.getState().beat).toBe(3);
  });

  it("seeks and advances now relative to the music, ahead by the latency", () => {
    const { clock, engine } = createEngine(undefined, 250);
    const sections = animationSchema.parse({
      name: "Sections",
      sections: [
        { mode: { type: "loop", beats: 4 }, layers: [{ effect: "solid" }] },
        { mode: { type: "loop", beats: 4 }, layers: [{ effect: "strobe", params: { duty: 0.5 } }] },
        { mode: { type: "loop", beats: 4 }, layers: [{ effect: "strobe", params: { duty: 0.5 } }] },
      ],
    });
    engine.play("sections", sections);
    clock.time = 1000;
    engine.seek(1, 0);
    expect(engine.getState().section).toEqual({ index: 1, time: 0, next: null });
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([0, 0, 0]);
    engine.advance("now");
    expect(engine.getState().section).toEqual({ index: 2, time: 0, next: null });
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([0, 0, 0]);
  });

  it("freezes the animation and beat while paused", () => {
    const { clock, engine } = createEngine();
    engine.play("strobe", strobe);
    clock.time = 100;
    engine.pause();
    clock.time = 5000;
    expect(engine.getState()).toMatchObject({ beat: 0.2, paused: true });
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([255, 255, 255]);
    engine.resume();
    clock.time = 5300;
    expect(engine.getState()).toMatchObject({ beat: 0.8, paused: false });
    expect(getPixel(engine.renderFrame(), 0, 0)).toEqual([0, 0, 0]);
  });

  it("reports render errors once and falls back to black", () => {
    const onError = vi.fn<(error: unknown) => void>();
    const { engine } = createEngine(onError);
    const squares = animationSchema.parse({
      name: "Squares",
      mode: { type: "loop", beats: 4 },
      layers: [{ effect: "squares" }],
    });
    engine.play("squares", squares);
    expect(engine.renderFrame().every((value) => value === 0)).toBe(true);
    engine.renderFrame();
    expect(onError).toHaveBeenCalledOnce();
  });
});

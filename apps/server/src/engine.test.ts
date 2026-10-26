import {
  type Frame,
  type PlaybackState,
  animationSchema,
  createRenderer,
  getPixel,
} from "@led-matrix/core";
import { describe, expect, it, vi } from "vitest";
import { createPlaybackEngine } from "./engine.ts";

function createEngine(onError?: (error: unknown) => void) {
  const clock = { time: 0 };
  const engine = createPlaybackEngine({
    renderer: createRenderer({ fps: 30 }),
    fps: 30,
    bpm: 120,
    getTime: () => clock.time,
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

  it("notifies listeners of frames and state", () => {
    const { engine } = createEngine();
    const setFrame = vi.fn<(frame: Frame) => void>();
    const setState = vi.fn<(state: PlaybackState) => void>();
    const unsubscribe = engine.subscribe({ setFrame, setState });
    engine.play("strobe", strobe);
    engine.tick();
    unsubscribe();
    engine.tick();
    expect(setState).toHaveBeenCalledWith({ animationId: "strobe", bpm: 120, fps: 30 });
    expect(setFrame).toHaveBeenCalledOnce();
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

import type { PlaybackState } from "@led-matrix/core";
import { describe, expect, it } from "vitest";
import type { Mapping } from "../shared/mapping.ts";
import type { Deck, MixxxState, Track } from "./mixxx.ts";
import type { LivePosition } from "../shared/api.ts";
import type { PlayRequest, ServerClient } from "./server.ts";
import { type SyncStatus, createSync, getPhaseDrift } from "./sync.ts";

const location = "/music/a.flac";

function createFakeServer(clock: { time: number }) {
  const calls: { type: string; body?: unknown }[] = [];
  let animationId: string | null = null;
  let params: Record<string, string> = {};
  let bpm = 120;
  let startedAt = 0;
  let pausedAt: number | undefined;

  function getState(): PlaybackState {
    return {
      animationId,
      params,
      bpm,
      fps: 30,
      beat: animationId === null ? null : (((pausedAt ?? clock.time) - startedAt) * bpm) / 60_000,
      section: null,
      fit: null,
      paused: pausedAt !== undefined,
    };
  }

  function setBeat(beat: number): void {
    startedAt = (pausedAt ?? clock.time) - (beat * 60_000) / bpm;
  }

  const server: ServerClient = {
    getState: async () => getState(),
    getAnimations: async () => [],
    stop: async () => {
      calls.push({ type: "stop" });
      animationId = null;
      params = {};
      pausedAt = undefined;
      return getState();
    },
    pause: async () => {
      calls.push({ type: "pause" });
      pausedAt ??= clock.time;
      return getState();
    },
    resume: async () => {
      calls.push({ type: "resume" });
      if (pausedAt !== undefined) {
        startedAt += clock.time - pausedAt;
        pausedAt = undefined;
      }
      return getState();
    },
    play: async (body: PlayRequest) => {
      calls.push({ type: "play", body });
      animationId = body.id;
      params = { ...body.params };
      bpm = body.bpm;
      pausedAt = undefined;
      setBeat(body.beat);
      return getState();
    },
    setBeat: async (beat) => {
      calls.push({ type: "beat", body: beat });
      setBeat(beat);
      return getState();
    },
    setBpm: async (value) => {
      calls.push({ type: "bpm", body: value });
      const beat = getState().beat;
      bpm = value;
      if (beat !== null) {
        setBeat(beat);
      }
      return getState();
    },
  };
  return {
    server,
    calls,
    play: (id: string) => void server.play({ id, section: 0, beat: 0.3, bpm }),
    setParams: (selection: Record<string, string>) => {
      params = selection;
    },
  };
}

function createHarness(mapping: Mapping) {
  const clock = { time: 0 };
  const fake = createFakeServer(clock);
  const log: string[] = [];
  const statuses: SyncStatus[] = [];
  const positions: (LivePosition | undefined)[] = [];
  const sync = createSync({
    server: fake.server,
    getMapping: () => mapping,
    getTime: () => clock.time,
    log: (message) => log.push(message),
    onStatus: (status) => statuses.push(status),
    onPosition: (position) => positions.push(position),
  });
  const tracks = new Map<string, Track | null>([
    ["[Channel1]", { location }],
    ["[Channel2]", { location: "/music/unmapped.flac" }],
  ]);

  async function update(decks: Partial<Deck>[]): Promise<void> {
    const state: MixxxState = {
      tracks,
      decks: {
        type: "decks",
        time: clock.time,
        outputLatency: 0,
        crossfader: 0,
        decks: decks.map((deck, index) => ({
          group: `[Channel${index + 1}]`,
          play: true,
          bpm: 120,
          beat: 0,
          volume: 1,
          orientation: "center",
          ...deck,
        })),
      },
    };
    await sync.update(state);
  }

  return { clock, fake, update, log, statuses, positions };
}

const mapping: Mapping = new Map([
  [
    location,
    [
      { beat: 16, animationId: "cat", section: 0, params: undefined, beats: undefined, offset: 0 },
      { beat: 64, animationId: "cat", section: 1, params: undefined, beats: 32, offset: 0 },
    ],
  ],
]);

describe("getPhaseDrift", () => {
  it("wraps to the nearest beat", () => {
    expect(getPhaseDrift(3.1)).toBeCloseTo(0.1);
    expect(getPhaseDrift(-2.9)).toBeCloseTo(0.1);
    expect(getPhaseDrift(0.8)).toBeCloseTo(-0.2);
  });
});

describe("sync", () => {
  it("plays a cue from the beats since it started", async () => {
    const { fake, update } = createHarness(mapping);
    await update([{ beat: 20.5 }]);
    expect(fake.calls).toEqual([
      { type: "play", body: { id: "cat", section: 0, beat: 4.5, bpm: 120 } },
    ]);
  });

  it("reports the live deck, track and cue when they change", async () => {
    const { update, statuses } = createHarness(mapping);
    await update([{ beat: 8 }]);
    await update([{ beat: 9 }]);
    await update([{ beat: 20 }]);
    await update([{ beat: 0, volume: 0.5 }, { beat: 0 }]);
    expect(statuses).toEqual([
      { liveDeck: "[Channel1]", trackLocation: location, cue: undefined, isPlaying: true },
      {
        liveDeck: "[Channel1]",
        trackLocation: location,
        cue: mapping.get(location)?.[0],
        isPlaying: true,
      },
      {
        liveDeck: "[Channel2]",
        trackLocation: "/music/unmapped.flac",
        cue: undefined,
        isPlaying: true,
      },
    ]);
  });

  it("plays a cue on the beat before the track starts", async () => {
    const leadIn: Mapping = new Map([
      [
        location,
        [
          {
            beat: -1,
            animationId: "bad-apple",
            section: 0,
            params: undefined,
            beats: 688,
            offset: 0,
          },
        ],
      ],
    ]);
    const { fake, update } = createHarness(leadIn);
    await update([{ beat: -0.75 }]);
    expect(fake.calls).toEqual([
      { type: "play", body: { id: "bad-apple", section: 0, beat: 0.25, bpm: 120, beats: 688 } },
    ]);
  });

  it("plays the cue params and replays when the server params differ", async () => {
    const paramsMapping: Mapping = new Map([
      [
        location,
        [
          {
            beat: 0,
            animationId: "strobe",
            section: 0,
            params: { Color: "Orange" },
            beats: undefined,
            offset: 0,
          },
        ],
      ],
    ]);
    const { clock, fake, update } = createHarness(paramsMapping);
    await update([{ beat: 4 }]);
    expect(fake.calls[0]).toMatchObject({
      type: "play",
      body: { id: "strobe", params: { Color: "Orange" } },
    });
    fake.setParams({ Color: "White" });
    clock.time = 2500;
    await update([{ beat: 9 }]);
    expect(fake.calls.filter(({ type }) => type === "play")).toHaveLength(2);
  });

  it("does not replay while the cue stays the same", async () => {
    const { clock, fake, update } = createHarness(mapping);
    await update([{ beat: 20 }]);
    clock.time = 2000;
    await update([{ beat: 24 }]);
    expect(fake.calls.map(({ type }) => type)).toEqual(["play"]);
  });

  it("replays when the deck crosses into the next cue", async () => {
    const { clock, fake, update } = createHarness(mapping);
    await update([{ beat: 63 }]);
    clock.time = 1000;
    await update([{ beat: 65 }]);
    expect(fake.calls[1]).toEqual({
      type: "play",
      body: { id: "cat", section: 1, beat: 1, bpm: 120, beats: 32 },
    });
  });

  it("nudges the beat when the deck jumps within a cue", async () => {
    const { clock, fake, update } = createHarness(mapping);
    await update([{ beat: 40 }]);
    clock.time = 2000;
    await update([{ beat: 36 }]);
    expect(fake.calls[1]?.type).toBe("beat");
    expect(fake.calls[1]?.body).toBeCloseTo(20);
  });

  it("updates the bpm when the live deck tempo changes", async () => {
    const { fake, update } = createHarness(mapping);
    await update([{ beat: 20 }]);
    await update([{ beat: 20, bpm: 126 }]);
    expect(fake.calls[1]).toEqual({ type: "bpm", body: 126 });
  });

  it("only aligns the beat phase on unmapped tracks", async () => {
    const { clock, fake, update } = createHarness(mapping);
    fake.play("plasma");
    fake.calls.length = 0;
    clock.time = 1000;
    await update([{ volume: 0 }, { beat: 100 }]);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.type).toBe("beat");
    expect(fake.calls[0]?.body).toBeCloseTo(2);
  });

  it("stops once at a blank cue and replays at the next cue", async () => {
    const blank: Mapping = new Map([
      [
        location,
        [
          {
            beat: 16,
            animationId: "cat",
            section: 0,
            params: undefined,
            beats: undefined,
            offset: 0,
          },
          { beat: 32, animationId: null },
          {
            beat: 64,
            animationId: "plasma",
            section: 0,
            params: undefined,
            beats: undefined,
            offset: 0,
          },
        ],
      ],
    ]);
    const { clock, fake, update } = createHarness(blank);
    await update([{ beat: 20 }]);
    clock.time = 1000;
    await update([{ beat: 33 }]);
    clock.time = 3000;
    await update([{ beat: 37 }]);
    clock.time = 4000;
    await update([{ beat: 64.5 }]);
    expect(fake.calls).toEqual([
      { type: "play", body: { id: "cat", section: 0, beat: 4, bpm: 120 } },
      { type: "stop" },
      { type: "play", body: { id: "plasma", section: 0, beat: 0.5, bpm: 120 } },
    ]);
  });

  it("does nothing before the first cue while nothing is playing", async () => {
    const { fake, update } = createHarness(mapping);
    await update([{ beat: 8 }]);
    expect(fake.calls).toEqual([]);
  });

  it("switches cues when the live deck changes", async () => {
    const { clock, fake, update, log } = createHarness(mapping);
    await update([{ beat: 20 }, { volume: 0 }]);
    clock.time = 100;
    await update([{ volume: 0.2, beat: 20.2 }, { beat: 100.2 }]);
    expect(log).toContain("Live deck: [Channel2]");
    clock.time = 200;
    await update([{ beat: 70.4 }, { volume: 0.2, beat: 100.4 }]);
    expect(fake.calls.at(-1)).toEqual({
      type: "play",
      body: { id: "cat", section: 1, beat: expect.closeTo(6.4), bpm: 120, beats: 32 },
    });
  });

  it("pauses when playback stops and resumes in phase when it starts again", async () => {
    const { clock, fake, update, statuses } = createHarness(mapping);
    await update([{ beat: 20 }]);
    clock.time = 1000;
    await update([{ beat: 22, play: false }]);
    clock.time = 5000;
    await update([{ beat: 22, play: false }]);
    expect(statuses.at(-1)).toEqual({
      liveDeck: undefined,
      trackLocation: location,
      cue: mapping.get(location)?.[0],
      isPlaying: false,
    });
    await update([{ beat: 22 }]);
    expect(fake.calls.map(({ type }) => type)).toEqual(["play", "pause", "resume"]);
    await expect(fake.server.getState()).resolves.toMatchObject({ paused: false, beat: 6 });
  });

  it("does not pause animations it did not start", async () => {
    const { fake, update } = createHarness(mapping);
    fake.play("plasma");
    fake.calls.length = 0;
    await update([{ play: false }]);
    expect(fake.calls).toEqual([]);
  });

  it("does not resume an animation paused by someone else", async () => {
    const { clock, fake, update } = createHarness(mapping);
    await update([{ beat: 20 }]);
    await fake.server.pause();
    clock.time = 3000;
    await update([{ beat: 26 }]);
    expect(fake.calls.map(({ type }) => type)).toEqual(["play", "pause"]);
  });

  it("reports the followed deck position while stopped", async () => {
    const { clock, update, positions } = createHarness(mapping);
    clock.time = 100;
    await update([{ beat: 20 }]);
    await update([{ beat: 21, play: false }]);
    expect(positions).toEqual([
      { location, beat: 20, bpm: 120, isPlaying: true, time: 100 },
      { location, beat: 21, bpm: 120, isPlaying: false, time: 100 },
    ]);
  });
});

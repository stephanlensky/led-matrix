import type { PlaybackState } from "@led-matrix/core";
import { describe, expect, it } from "vitest";
import type { Mapping } from "../shared/mapping.ts";
import type { Deck, MixxxState, Track } from "./mixxx.ts";
import type { LivePosition } from "../shared/api.ts";
import type { ServerClient } from "./server.ts";
import { type SyncStatus, createSync } from "./sync.ts";

const location = "/music/a.flac";

function createFakeServer(clock: { time: number }) {
  const calls: { type: string; body?: unknown }[] = [];
  let timeline: string | null = null;
  let animationId: string | null = null;
  let bpm = 120;
  let startedAt = 0;
  let pausedAt: number | undefined;

  function getState(): PlaybackState {
    const isLoaded = timeline !== null || animationId !== null;
    return {
      animationId,
      params: {},
      bpm,
      fps: 30,
      beat: isLoaded ? (((pausedAt ?? clock.time) - startedAt) * bpm) / 60_000 : null,
      section: null,
      fit: null,
      paused: pausedAt !== undefined,
      timeline: timeline === null ? null : { id: timeline, cue: null },
    };
  }

  function setClock(beat: number, nextBpm: number, paused: boolean): void {
    bpm = nextBpm;
    pausedAt = paused ? clock.time : undefined;
    startedAt = clock.time - (beat * 60_000) / bpm;
  }

  const server: ServerClient = {
    getState: async () => getState(),
    getAnimations: async () => [],
    stop: async () => {
      calls.push({ type: "stop" });
      timeline = null;
      animationId = null;
      pausedAt = undefined;
      return getState();
    },
    pause: async () => {
      calls.push({ type: "pause" });
      pausedAt ??= clock.time;
      return getState();
    },
    play: async (body) => {
      calls.push({ type: "play", body });
      timeline = null;
      animationId = body.id;
      setClock(body.beat, body.bpm, false);
      return getState();
    },
    setTimeline: async (body) => {
      calls.push({ type: "timeline", body });
      timeline = body.id;
      animationId = null;
      setClock(body.beat, body.bpm, body.paused);
      return getState();
    },
    setClock: async (body) => {
      calls.push({ type: "clock", body });
      setClock(body.beat, body.bpm, body.paused);
      return getState();
    },
  };
  return {
    server,
    calls,
    play: (id: string) => void server.play({ id, section: 0, beat: 0.3, bpm }),
  };
}

function createHarness(mapping: Mapping | (() => Mapping), keepCurrent?: boolean) {
  const clock = { time: 0 };
  const fake = createFakeServer(clock);
  const log: string[] = [];
  const statuses: SyncStatus[] = [];
  const positions: (LivePosition | undefined)[] = [];
  const sync = createSync({
    server: fake.server,
    getMapping: typeof mapping === "function" ? mapping : () => mapping,
    ...(keepCurrent === undefined ? {} : { keepCurrent }),
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
        mainGain: 1,
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

  function getCallTypes(): string[] {
    return fake.calls.map(({ type }) => type);
  }

  return { clock, fake, sync, update, log, statuses, positions, getCallTypes };
}

const cues = [
  { beat: 16, animationId: "cat", section: 0, params: undefined, beats: undefined, offset: 0 },
  { beat: 64, animationId: "cat", section: 1, params: undefined, beats: 32, offset: 0 },
];

const mapping: Mapping = new Map([[location, cues]]);

describe("sync", () => {
  it("loads the track's cues with the deck clock", async () => {
    const { fake, update } = createHarness(mapping);
    await update([{ beat: 20.5 }]);
    expect(fake.calls).toEqual([
      {
        type: "timeline",
        body: {
          id: expect.any(String),
          cues,
          keepCurrent: true,
          beat: 20.5,
          bpm: 120,
          paused: false,
        },
      },
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
      { liveDeck: "[Channel1]", trackLocation: location, cue: cues[0], isPlaying: true },
      {
        liveDeck: "[Channel2]",
        trackLocation: "/music/unmapped.flac",
        cue: undefined,
        isPlaying: true,
      },
    ]);
  });

  it("sends nothing more while the server stays in time", async () => {
    const { clock, update, getCallTypes } = createHarness(mapping);
    await update([{ beat: 20 }]);
    clock.time = 2000;
    await update([{ beat: 24 }]);
    clock.time = 30_000;
    await update([{ beat: 80 }]);
    expect(getCallTypes()).toEqual(["timeline"]);
  });

  it("moves the beat right away when the deck jumps", async () => {
    const { clock, fake, update } = createHarness(mapping);
    await update([{ beat: 40 }]);
    clock.time = 100;
    await update([{ beat: 36 }]);
    expect(fake.calls[1]).toEqual({ type: "clock", body: { beat: 36, bpm: 120, paused: false } });
  });

  it("nudges small drift at most once per interval", async () => {
    const { clock, update, getCallTypes } = createHarness(mapping);
    await update([{ beat: 40 }]);
    clock.time = 500;
    await update([{ beat: 41.2 }]);
    expect(getCallTypes()).toEqual(["timeline"]);
    clock.time = 1000;
    await update([{ beat: 42.2 }]);
    expect(getCallTypes()).toEqual(["timeline", "clock"]);
  });

  it("updates the bpm when the live deck tempo changes", async () => {
    const { fake, update } = createHarness(mapping);
    await update([{ beat: 20 }]);
    await update([{ beat: 20, bpm: 126 }]);
    expect(fake.calls[1]).toEqual({ type: "clock", body: { beat: 20, bpm: 126, paused: false } });
  });

  it("reloads when the mapping changes or the server plays something else", async () => {
    let current = mapping;
    const { clock, fake, update, getCallTypes } = createHarness(() => current);
    await update([{ beat: 20 }]);
    fake.play("plasma");
    clock.time = 3000;
    await update([{ beat: 26 }]);
    current = new Map([[location, cues.slice(0, 1)]]);
    await update([{ beat: 26 }]);
    expect(getCallTypes()).toEqual(["timeline", "play", "timeline", "timeline"]);
  });

  it("follows unmapped tracks with an empty timeline that keeps the current animation", async () => {
    const { fake, update } = createHarness(mapping);
    await update([{ volume: 0 }, { beat: 100 }]);
    expect(fake.calls).toEqual([
      {
        type: "timeline",
        body: expect.objectContaining({ cues: [], keepCurrent: true, beat: 100 }),
      },
    ]);
  });

  it("loads the other track when the live deck changes", async () => {
    const { clock, fake, update, log } = createHarness(mapping);
    await update([{ beat: 20 }, { volume: 0 }]);
    clock.time = 100;
    await update([{ volume: 0.2, beat: 20.2 }, { beat: 100.2 }]);
    expect(log).toContain("Live deck: [Channel2]");
    expect(fake.calls.at(-1)).toMatchObject({ type: "timeline", body: { cues: [] } });
  });

  it("pauses when playback stops and resumes in phase when it starts again", async () => {
    const { clock, fake, update, statuses, getCallTypes } = createHarness(mapping);
    await update([{ beat: 20 }]);
    clock.time = 1000;
    await update([{ beat: 22, play: false }]);
    clock.time = 5000;
    await update([{ beat: 22, play: false }]);
    expect(statuses.at(-1)).toEqual({
      liveDeck: undefined,
      trackLocation: location,
      cue: cues[0],
      isPlaying: false,
    });
    await update([{ beat: 22 }]);
    expect(getCallTypes()).toEqual(["timeline", "pause", "clock"]);
    await expect(fake.server.getState()).resolves.toMatchObject({ paused: false, beat: 22 });
  });

  it("does not pause animations it did not start", async () => {
    const { fake, update } = createHarness(mapping);
    fake.play("plasma");
    fake.calls.length = 0;
    await update([{ play: false }]);
    expect(fake.calls).toEqual([]);
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

function getFollowedPosition(beat: number, isPlaying = true): LivePosition {
  return { location, beat, bpm: 120, isPlaying, time: 0 };
}

describe("sync follow", () => {
  it("loads the followed track without keeping the current animation", async () => {
    const { fake, sync } = createHarness(mapping, false);
    await sync.follow(getFollowedPosition(20.5));
    expect(fake.calls).toEqual([
      {
        type: "timeline",
        body: expect.objectContaining({ cues, keepCurrent: false, beat: 20.5, paused: false }),
      },
    ]);
  });

  it("pauses and seeks with the followed position", async () => {
    const { fake, sync } = createHarness(mapping, false);
    await sync.follow(getFollowedPosition(20));
    await sync.follow(getFollowedPosition(20, false));
    await sync.follow(getFollowedPosition(70, false));
    await sync.follow(getFollowedPosition(70, false));
    await sync.follow(getFollowedPosition(70));
    expect(fake.calls.slice(1)).toEqual([
      { type: "clock", body: { beat: 20, bpm: 120, paused: true } },
      { type: "clock", body: { beat: 70, bpm: 120, paused: true } },
      { type: "clock", body: { beat: 70, bpm: 120, paused: false } },
    ]);
  });
});

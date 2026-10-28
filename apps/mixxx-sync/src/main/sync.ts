import { createHash } from "node:crypto";
import type { PlaybackState } from "@led-matrix/core";
import type { LivePosition } from "../shared/api.ts";
import { getAudibleBeat, getBeatDelta, getLiveDeck } from "./decks.ts";
import { type Mapping, type ResolvedCue, getCue } from "../shared/mapping.ts";
import type { MixxxState } from "./mixxx.ts";
import type { ClockRequest, ServerClient } from "./server.ts";

const BPM_TOLERANCE = 0.01;
const emptyCues: readonly ResolvedCue[] = [];

export type SyncOptions = {
  server: ServerClient;
  getMapping: () => Mapping;
  keepCurrent?: boolean;
  hysteresis?: number;
  driftThreshold?: number;
  jumpThreshold?: number;
  nudgeInterval?: number;
  stateInterval?: number;
  getTime?: () => number;
  log?: (message: string) => void;
  onStatus?: (status: SyncStatus) => void;
  onPosition?: (position: LivePosition | undefined) => void;
};

export type SyncStatus = {
  liveDeck: string | undefined;
  trackLocation: string | undefined;
  cue: ResolvedCue | undefined;
  isPlaying: boolean;
};

type Target = {
  location: string | undefined;
  cues: readonly ResolvedCue[];
  cue: ResolvedCue | undefined;
  bpm: number;
  isPlaying: boolean;
  getBeat: (time: number) => number;
};

type ServerModel = { state: PlaybackState; receivedAt: number };

type TimelineId = { location: string | undefined; cues: readonly ResolvedCue[]; id: string };

function getTarget(
  location: string | undefined,
  cues: readonly ResolvedCue[] | undefined,
  beat: number,
  bpm: number,
  isPlaying: boolean,
  time: number,
): Target {
  return {
    location,
    cues: cues ?? emptyCues,
    cue: cues && getCue(cues, beat),
    bpm,
    isPlaying,
    getBeat: (at) => beat + (isPlaying ? getBeatDelta(at - time, bpm) : 0),
  };
}

export function createSync({
  server,
  getMapping,
  keepCurrent = true,
  hysteresis = 0.1,
  driftThreshold = 0.05,
  jumpThreshold = 1,
  nudgeInterval = 1000,
  stateInterval = 2000,
  getTime = () => Date.now(),
  log = console.log,
  onStatus,
  onPosition,
}: SyncOptions) {
  let busy = false;
  let liveGroup: string | undefined;
  let followedGroup: string | undefined;
  let isPauseNeeded = false;
  let model: ServerModel | undefined;
  let loadedId: string | undefined;
  let lastTimelineId: TimelineId | undefined;
  let lastClockAt = -Infinity;
  let lastError: string | undefined;
  let status: SyncStatus = {
    liveDeck: undefined,
    trackLocation: undefined,
    cue: undefined,
    isPlaying: false,
  };

  function getDeckTarget({ tracks, decks }: MixxxState, time: number): Target | undefined {
    const deck = decks.decks.find(({ group }) => group === followedGroup);
    if (!deck || deck.bpm <= 0) {
      return undefined;
    }
    const audibleBeat = getAudibleBeat(deck, decks, time);
    if (audibleBeat === null) {
      return undefined;
    }
    const location = tracks.get(deck.group)?.location;
    const cues = location === undefined ? undefined : getMapping().get(location);
    return getTarget(location, cues, audibleBeat, deck.bpm, deck.play, time);
  }

  function getTimelineId(location: string | undefined, cues: readonly ResolvedCue[]): string {
    const last = lastTimelineId;
    if (last && last.location === location && last.cues === cues) {
      return last.id;
    }
    const id = createHash("sha1")
      .update(JSON.stringify([location ?? null, cues]))
      .digest("hex");
    lastTimelineId = { location, cues, id };
    return id;
  }

  function setModel(state: PlaybackState): ServerModel {
    model = { state, receivedAt: getTime() };
    return model;
  }

  async function getModel(): Promise<ServerModel> {
    if (model && getTime() - model.receivedAt <= stateInterval) {
      return model;
    }
    return setModel(await server.getState());
  }

  function getServerBeat({ state, receivedAt }: ServerModel, time: number): number | undefined {
    if (state.beat === null) {
      return undefined;
    }
    return state.paused ? state.beat : state.beat + getBeatDelta(time - receivedAt, state.bpm);
  }

  function getClock(target: Target): ClockRequest {
    return { beat: target.getBeat(getTime()), bpm: target.bpm, paused: !target.isPlaying };
  }

  async function load(target: Target, id: string): Promise<void> {
    const { location, cues } = target;
    setModel(await server.setTimeline({ id, cues, keepCurrent, ...getClock(target) }));
    loadedId = id;
    lastClockAt = getTime();
    log(
      cues.length === 0
        ? `Following ${location ?? "track"} without cues`
        : `Loaded ${cues.length} cues for ${location}`,
    );
  }

  async function apply(target: Target): Promise<void> {
    const current = await getModel();
    const id = getTimelineId(target.location, target.cues);
    if (current.state.timeline?.id !== id) {
      await load(target, id);
      return;
    }
    const time = getTime();
    const { beat, bpm, paused } = getClock(target);
    const drift = beat - (getServerBeat(current, time) ?? beat);
    const isClockChanged =
      current.state.paused !== paused || Math.abs(current.state.bpm - bpm) > BPM_TOLERANCE;
    const isDrifted =
      Math.abs(drift) > driftThreshold &&
      (Math.abs(drift) > jumpThreshold || time - lastClockAt >= nudgeInterval);
    if (!isClockChanged && !isDrifted) {
      return;
    }
    setModel(await server.setClock(getClock(target)));
    lastClockAt = time;
    if (isDrifted) {
      log(`Moved beat by ${drift.toFixed(3)}`);
    }
  }

  async function pause(): Promise<void> {
    const { state } = await getModel();
    if (loadedId !== undefined && state.timeline?.id === loadedId && !state.paused) {
      setModel(await server.pause());
      log("Paused");
    }
    isPauseNeeded = false;
  }

  function setLiveGroup(state: MixxxState): void {
    const group = getLiveDeck(state.decks, liveGroup, hysteresis);
    if (group !== liveGroup) {
      log(`Live deck: ${group ?? "none"}`);
      isPauseNeeded = group === undefined;
      liveGroup = group;
      followedGroup = group ?? followedGroup;
    }
  }

  function setStatus(next: SyncStatus): void {
    if (
      next.liveDeck === status.liveDeck &&
      next.trackLocation === status.trackLocation &&
      next.cue === status.cue &&
      next.isPlaying === status.isPlaying
    ) {
      return;
    }
    status = next;
    onStatus?.(status);
  }

  async function run(action: () => Promise<void>): Promise<void> {
    busy = true;
    try {
      await action();
      lastError = undefined;
    } catch (error) {
      model = undefined;
      const message = error instanceof Error ? error.message : String(error);
      if (message !== lastError) {
        log(`Server request failed: ${message}`);
        lastError = message;
      }
    } finally {
      busy = false;
    }
  }

  return {
    async update(state: MixxxState): Promise<void> {
      if (busy) {
        return;
      }
      setLiveGroup(state);
      const time = getTime();
      const target = getDeckTarget(state, time);
      const isLive = liveGroup !== undefined;
      const location = target?.location;
      setStatus({
        liveDeck: liveGroup,
        trackLocation:
          followedGroup === undefined ? undefined : state.tracks.get(followedGroup)?.location,
        cue: target?.cue,
        isPlaying: isLive,
      });
      onPosition?.(
        target && location !== undefined
          ? {
              location,
              beat: target.getBeat(time),
              bpm: target.bpm,
              isPlaying: target.isPlaying,
              time,
            }
          : undefined,
      );
      if (!target || (!isLive && !isPauseNeeded)) {
        return;
      }
      await run(() => (isLive ? apply(target) : pause()));
    },
    async follow({ location, beat, bpm, isPlaying, time }: LivePosition): Promise<void> {
      if (busy) {
        return;
      }
      const target = getTarget(location, getMapping().get(location), beat, bpm, isPlaying, time);
      await run(() => apply(target));
    },
  };
}

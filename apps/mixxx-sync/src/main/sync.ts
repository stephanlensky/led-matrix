import type { PlaybackState } from "@led-matrix/core";
import type { LivePosition } from "../shared/api.ts";
import { getAudibleBeat, getBeatDelta, getLiveDeck } from "./decks.ts";
import { type Mapping, type ResolvedCue, type SectionCue, getCue } from "../shared/mapping.ts";
import type { MixxxState } from "./mixxx.ts";
import type { ServerClient } from "./server.ts";

const BPM_TOLERANCE = 0.01;

export type SyncOptions = {
  server: ServerClient;
  getMapping: () => Mapping;
  hysteresis?: number;
  driftThreshold?: number;
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
  cue: ResolvedCue | undefined;
  bpm: number;
  isPlaying: boolean;
  getBeat: (time: number) => number;
};

type ServerModel = { state: PlaybackState; receivedAt: number };

export function getPhaseDrift(drift: number): number {
  return drift - Math.round(drift);
}

function getCueKey(location: string | undefined, cue: ResolvedCue): string {
  return cue.animationId === null
    ? [location, cue.beat].join("\n")
    : [
        location,
        cue.beat,
        cue.animationId,
        cue.section,
        JSON.stringify(cue.params),
        cue.beats,
      ].join("\n");
}

export function createSync({
  server,
  getMapping,
  hysteresis = 0.1,
  driftThreshold = 0.05,
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
  let isPausedBySync = false;
  let playedKey: string | undefined;
  let model: ServerModel | undefined;
  let lastNudgeAt = -Infinity;
  let lastError: string | undefined;
  let status: SyncStatus = {
    liveDeck: undefined,
    trackLocation: undefined,
    cue: undefined,
    isPlaying: false,
  };

  function getTarget({ tracks, decks }: MixxxState, time: number): Target | undefined {
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
    return {
      location,
      cue: cues && getCue(cues, audibleBeat),
      bpm: deck.bpm,
      isPlaying: deck.play,
      getBeat: (at) => audibleBeat + (deck.play ? getBeatDelta(at - time, deck.bpm) : 0),
    };
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

  async function stop(cue: ResolvedCue, key: string): Promise<void> {
    setModel(await server.stop());
    playedKey = key;
    log(`Stopped at blank cue beat ${cue.beat}`);
  }

  async function play(target: Target, cue: SectionCue, key: string): Promise<void> {
    const beat = Math.max(target.getBeat(getTime()) - cue.beat, 0);
    const { animationId: id, section, params, beats } = cue;
    setModel(await server.play({ id, section, params, beat, bpm: target.bpm, beats }));
    playedKey = key;
    log(`Playing ${cue.animationId} section ${cue.section} from cue beat ${cue.beat}`);
  }

  async function pause(): Promise<void> {
    const { state } = await getModel();
    if (state.animationId !== null && !state.paused) {
      setModel(await server.pause());
      isPausedBySync = true;
      log("Paused");
    }
    isPauseNeeded = false;
  }

  async function apply(target: Target): Promise<void> {
    let current = await getModel();
    const { cue } = target;
    const isResumeNeeded = isPausedBySync;
    isPauseNeeded = false;
    isPausedBySync = false;
    if (cue?.animationId === null) {
      const key = getCueKey(target.location, cue);
      if (key !== playedKey || current.state.animationId !== null) {
        await stop(cue, key);
      }
      return;
    }
    if (cue) {
      const key = getCueKey(target.location, cue);
      const isParamsChanged = Object.entries(cue.params ?? {}).some(
        ([name, option]) => current.state.params[name] !== option,
      );
      if (key !== playedKey || current.state.animationId !== cue.animationId || isParamsChanged) {
        await play(target, cue, key);
        return;
      }
    } else {
      playedKey = undefined;
    }
    if (isResumeNeeded && current.state.paused && current.state.animationId !== null) {
      current = setModel(await server.resume());
      lastNudgeAt = -Infinity;
      log("Resumed");
    }
    if (Math.abs(current.state.bpm - target.bpm) > BPM_TOLERANCE) {
      current = setModel(await server.setBpm(target.bpm));
    }
    if (current.state.animationId === null) {
      return;
    }
    const time = getTime();
    const serverBeat = getServerBeat(current, time);
    if (serverBeat === undefined || current.state.paused || time - lastNudgeAt < nudgeInterval) {
      return;
    }
    const offset = target.getBeat(time) - (cue?.beat ?? 0) - serverBeat;
    const drift = cue ? offset : getPhaseDrift(offset);
    if (Math.abs(drift) <= driftThreshold) {
      return;
    }
    lastNudgeAt = time;
    setModel(await server.setBeat(Math.max(serverBeat + drift, 0)));
    log(`Nudged beat by ${drift.toFixed(3)}`);
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

  return {
    async update(state: MixxxState): Promise<void> {
      if (busy) {
        return;
      }
      setLiveGroup(state);
      const time = getTime();
      const target = getTarget(state, time);
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
      busy = true;
      try {
        await (isLive ? apply(target) : pause());
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
    },
  };
}

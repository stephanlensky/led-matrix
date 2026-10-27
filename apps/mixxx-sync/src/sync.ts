import type { PlaybackState } from "@led-matrix/core";
import { getAudibleBeat, getBeatDelta, getLiveDeck } from "./decks.ts";
import { type Mapping, type ResolvedCue, getCue } from "./mapping.ts";
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
};

type Target = {
  location: string | undefined;
  cue: ResolvedCue | undefined;
  bpm: number;
  getBeat: (time: number) => number;
};

type ServerModel = { state: PlaybackState; receivedAt: number };

export function getPhaseDrift(drift: number): number {
  return drift - Math.round(drift);
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
}: SyncOptions) {
  let busy = false;
  let liveGroup: string | undefined;
  let playedKey: string | undefined;
  let model: ServerModel | undefined;
  let lastNudgeAt = -Infinity;
  let lastError: string | undefined;

  function getTarget({ tracks, decks }: MixxxState, time: number): Target | undefined {
    const deck = decks.decks.find(({ group }) => group === liveGroup);
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
      getBeat: (at) => audibleBeat + getBeatDelta(at - time, deck.bpm),
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

  async function play(target: Target, cue: ResolvedCue, key: string): Promise<void> {
    const beat = Math.max(target.getBeat(getTime()) - cue.beat, 0);
    setModel(
      await server.play({ id: cue.animationId, section: cue.section, beat, bpm: target.bpm }),
    );
    playedKey = key;
    log(`Playing ${cue.animationId} section ${cue.section} from cue beat ${cue.beat}`);
  }

  async function apply(target: Target): Promise<void> {
    let current = await getModel();
    const { cue } = target;
    if (cue) {
      const key = `${target.location}\n${cue.beat}\n${cue.animationId}\n${cue.section}`;
      if (key !== playedKey || current.state.animationId !== cue.animationId) {
        await play(target, cue, key);
        return;
      }
    } else {
      playedKey = undefined;
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
      liveGroup = group;
    }
  }

  return {
    async update(state: MixxxState): Promise<void> {
      if (busy) {
        return;
      }
      setLiveGroup(state);
      const target = getTarget(state, getTime());
      if (!target) {
        return;
      }
      busy = true;
      try {
        await apply(target);
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

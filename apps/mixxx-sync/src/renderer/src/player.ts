import { useSyncExternalStore } from "react";
import { type Track, getTrackAudioUrl } from "../../shared/library.ts";
import { type BeatSelection, type Loop, getLoopedTime, isInLoop } from "../../shared/loop.ts";
import { getErrorMessage } from "./errors.ts";

export type TrackLoop = Loop & { trackId: number; beats: BeatSelection };

export type PlayerState = {
  track: Track | undefined;
  isPlaying: boolean;
  error: string | undefined;
  loop: TrackLoop | undefined;
};

export type Player = {
  getState: () => PlayerState;
  getTime: () => number;
  subscribe: (listener: () => void) => () => void;
  toggle: (track?: Track) => void;
  focus: (track: Track) => void;
  seek: (track: Track, time: number) => void;
  setLoop: (track: Track, loop: Loop, beats: BeatSelection) => void;
  clearLoop: () => boolean;
  setVolume: (volume: number) => void;
  close: () => void;
};

export function createPlayer(): Player {
  const audio = new Audio();
  audio.preload = "auto";
  const listeners = new Set<() => void>();
  let state: PlayerState = {
    track: undefined,
    isPlaying: false,
    error: undefined,
    loop: undefined,
  };
  let focusedTrack: Track | undefined;
  let loopRequest = 0;
  let previousTime = 0;

  function setState(update: Partial<PlayerState>) {
    state = { ...state, ...update };
    for (const listener of listeners) {
      listener();
    }
  }

  function getActiveLoop(): TrackLoop | undefined {
    return state.loop?.trackId === state.track?.id ? state.loop : undefined;
  }

  function setTime(time: number) {
    audio.currentTime = time;
    previousTime = time;
  }

  function updateLoop() {
    loopRequest = requestAnimationFrame(updateLoop);
    const loop = getActiveLoop();
    const time = audio.currentTime;
    const loopedTime = loop && getLoopedTime(previousTime, time, loop);
    if (loopedTime === undefined) {
      previousTime = time;
    } else {
      setTime(loopedTime);
    }
  }

  audio.addEventListener("play", () => {
    previousTime = audio.currentTime;
    cancelAnimationFrame(loopRequest);
    loopRequest = requestAnimationFrame(updateLoop);
    setState({ isPlaying: true });
  });
  audio.addEventListener("pause", () => {
    cancelAnimationFrame(loopRequest);
    setState({ isPlaying: false });
  });
  audio.addEventListener("ended", () => {
    const loop = getActiveLoop();
    if (loop) {
      setTime(loop.start);
      play();
    }
  });
  audio.addEventListener("error", () => {
    if (state.track) {
      setState({ isPlaying: false, error: audio.error?.message || "Can't play this track" });
    }
  });

  function load(track: Track) {
    focusedTrack = track;
    if (state.track?.id !== track.id) {
      audio.src = getTrackAudioUrl(track.id);
      setState({ track, isPlaying: false, error: undefined, loop: undefined });
    }
  }

  function play() {
    audio.play().catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setState({ isPlaying: false, error: getErrorMessage(error) });
      }
    });
  }

  function seek(track: Track, time: number) {
    const isPlaying = !audio.paused;
    load(track);
    setTime(time);
    if (isPlaying && audio.paused) {
      play();
    }
  }

  return {
    getState: () => state,
    getTime: () => audio.currentTime,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    toggle(track = focusedTrack ?? state.track) {
      if (!track) {
        return;
      }
      if (state.track?.id === track.id && !audio.paused) {
        audio.pause();
        return;
      }
      load(track);
      play();
    },
    focus(track) {
      focusedTrack = track;
    },
    seek,
    setLoop(track, loop, beats) {
      const isCurrent = state.track?.id === track.id;
      if (!isCurrent || !isInLoop(audio.currentTime, loop)) {
        seek(track, loop.start);
      }
      setState({ loop: { ...loop, trackId: track.id, beats } });
    },
    clearLoop() {
      if (!state.loop) {
        return false;
      }
      setState({ loop: undefined });
      return true;
    },
    setVolume(volume) {
      audio.volume = volume;
    },
    close() {
      listeners.clear();
      cancelAnimationFrame(loopRequest);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    },
  };
}

export function usePlayerState(player: Player): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState);
}

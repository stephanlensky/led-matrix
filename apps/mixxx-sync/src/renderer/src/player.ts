import { useSyncExternalStore } from "react";
import { type Track, getTrackAudioUrl } from "../../shared/library.ts";
import { getErrorMessage } from "./errors.ts";

export type PlayerState = {
  track: Track | undefined;
  isPlaying: boolean;
  error: string | undefined;
};

export type Player = {
  getState: () => PlayerState;
  getTime: () => number;
  subscribe: (listener: () => void) => () => void;
  toggle: (track?: Track) => void;
  seek: (track: Track, time: number) => void;
  close: () => void;
};

export function createPlayer(): Player {
  const audio = new Audio();
  audio.preload = "auto";
  const listeners = new Set<() => void>();
  let state: PlayerState = { track: undefined, isPlaying: false, error: undefined };

  function setState(update: Partial<PlayerState>) {
    state = { ...state, ...update };
    for (const listener of listeners) {
      listener();
    }
  }

  audio.addEventListener("play", () => setState({ isPlaying: true }));
  audio.addEventListener("pause", () => setState({ isPlaying: false }));
  audio.addEventListener("error", () => {
    if (state.track) {
      setState({ isPlaying: false, error: audio.error?.message || "Can't play this track" });
    }
  });

  function load(track: Track) {
    if (state.track?.id !== track.id) {
      audio.src = getTrackAudioUrl(track.id);
      setState({ track, isPlaying: false, error: undefined });
    }
  }

  function play() {
    audio.play().catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setState({ isPlaying: false, error: getErrorMessage(error) });
      }
    });
  }

  return {
    getState: () => state,
    getTime: () => audio.currentTime,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    toggle(track = state.track) {
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
    seek(track, time) {
      const isPlaying = !audio.paused;
      load(track);
      audio.currentTime = time;
      if (isPlaying && audio.paused) {
        play();
      }
    },
    close() {
      listeners.clear();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    },
  };
}

export function usePlayerState(player: Player): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState);
}

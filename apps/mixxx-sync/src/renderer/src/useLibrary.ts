import { useCallback, useEffect, useState } from "react";
import type { Playlist, Track, TrackDetails, Waveform } from "../../shared/library.ts";
import { getErrorMessage } from "./errors.ts";

const CACHE_LIMIT = 500;
const FULL_WAVEFORM_CACHE_LIMIT = 8;
const LOAD_DELAY = 100;

export type LibrarySelection = { type: "all" } | { type: "playlist"; playlistId: number };

export type LoadState<T> =
  | { status: "loading" }
  | { status: "loaded"; value: T }
  | { status: "error"; error: string };

export type TrackData = {
  details: TrackDetails | undefined;
  waveform: Waveform | undefined;
};

export type TrackDataCache = {
  get: (trackId: number) => Promise<TrackData>;
  getFullWaveform: (trackId: number) => Promise<Waveform | undefined>;
};

function getCached<T>(
  entries: Map<number, Promise<T>>,
  key: number,
  limit: number,
  load: () => Promise<T>,
): Promise<T> {
  const entry = entries.get(key);
  if (entry) {
    entries.delete(key);
    entries.set(key, entry);
    return entry;
  }
  const promise = load();
  promise.catch(() => entries.delete(key));
  entries.set(key, promise);
  for (const oldKey of entries.keys()) {
    if (entries.size <= limit) {
      break;
    }
    entries.delete(oldKey);
  }
  return promise;
}

export function createTrackDataCache(): TrackDataCache {
  const entries = new Map<number, Promise<TrackData>>();
  const fullWaveforms = new Map<number, Promise<Waveform | undefined>>();

  return {
    get(trackId) {
      return getCached(entries, trackId, CACHE_LIMIT, () =>
        Promise.all([
          window.api.getTrackDetails(trackId),
          window.api.getWaveform(trackId, "summary"),
        ]).then(([details, waveform]) => ({ details, waveform })),
      );
    },
    getFullWaveform(trackId) {
      return getCached(fullWaveforms, trackId, FULL_WAVEFORM_CACHE_LIMIT, () =>
        window.api.getWaveform(trackId, "full"),
      );
    },
  };
}

export function useLoad<T>(load: () => Promise<T>, delay = 0): LoadState<T> {
  const [state, setState] = useState<{ load: () => Promise<T>; value: LoadState<T> }>({
    load,
    value: { status: "loading" },
  });

  useEffect(() => {
    let isCancelled = false;
    const timeout = setTimeout(() => {
      load().then(
        (value) => {
          if (!isCancelled) {
            setState({ load, value: { status: "loaded", value } });
          }
        },
        (error: unknown) => {
          if (!isCancelled) {
            setState({ load, value: { status: "error", error: getErrorMessage(error) } });
          }
        },
      );
    }, delay);
    return () => {
      isCancelled = true;
      clearTimeout(timeout);
    };
  }, [load, delay]);

  return state.load === load ? state.value : { status: "loading" };
}

function getPlaylists(): Promise<Playlist[]> {
  return window.api.getPlaylists();
}

export function usePlaylists(): LoadState<Playlist[]> {
  return useLoad(getPlaylists);
}

export function useTracks(selection: LibrarySelection): LoadState<Track[]> {
  const playlistId = selection.type === "playlist" ? selection.playlistId : undefined;
  const load = useCallback(() => window.api.getTracks(playlistId), [playlistId]);
  return useLoad(load);
}

export function useTrackData(cache: TrackDataCache, trackId: number): LoadState<TrackData> {
  const load = useCallback(() => cache.get(trackId), [cache, trackId]);
  return useLoad(load, LOAD_DELAY);
}

import { type Clip, type ClipLibrary, createClip } from "@led-matrix/core";
import { createContext, useContext } from "react";
import type { ApiClient } from "./api.ts";

export type BrowserClips = {
  clips: ClipLibrary;
  subscribe: (listener: () => void) => () => void;
  remove: (id: string) => void;
};

export function createBrowserClips(
  api: Pick<ApiClient, "getClip" | "getClipFrames">,
): BrowserClips {
  const clips = new Map<string, Clip | "loading" | "failed">();
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) {
      listener();
    }
  }

  async function load(id: string) {
    try {
      const [info, frames] = await Promise.all([api.getClip(id), api.getClipFrames(id)]);
      clips.set(id, createClip(frames, info.durations));
    } catch {
      clips.set(id, "failed");
    }
    notify();
  }

  return {
    clips: {
      getClip(id) {
        if (!id) {
          return undefined;
        }
        const clip = clips.get(id);
        if (clip === undefined) {
          clips.set(id, "loading");
          void load(id);
          return undefined;
        }
        return typeof clip === "string" ? undefined : clip;
      },
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    remove(id) {
      clips.delete(id);
      notify();
    },
  };
}

export const ClipsContext = createContext<BrowserClips | null>(null);

export function useBrowserClips(): BrowserClips {
  const clips = useContext(ClipsContext);
  if (!clips) {
    throw new Error("Missing ClipsContext provider");
  }
  return clips;
}

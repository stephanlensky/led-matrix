import { type Clip, type ClipLibrary, getClipFrames } from "@led-matrix/core";
import { getClip, getClipFrames as getClipFrameData } from "./api.ts";

const clips = new Map<string, Clip | "loading" | "failed">();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

async function load(id: string) {
  try {
    const [info, frames] = await Promise.all([getClip(id), getClipFrameData(id)]);
    clips.set(id, {
      frames: getClipFrames(frames, info.durations.length),
      durations: info.durations,
    });
  } catch {
    clips.set(id, "failed");
  }
  notify();
}

export const browserClips: ClipLibrary = {
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
};

export function subscribeClips(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function removeClip(id: string) {
  clips.delete(id);
  notify();
}

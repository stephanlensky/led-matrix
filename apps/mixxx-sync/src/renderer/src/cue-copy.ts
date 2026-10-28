import { useSyncExternalStore } from "react";
import type { AnimationCue } from "../../shared/mapping-edits.ts";

export type CueCopy = {
  cues: AnimationCue[];
  anchor: AnimationCue;
  location: string;
  clientX: number;
  left: number;
  width: number;
  offset: number;
  isFree: boolean;
};

type CopyDrop = (copy: CueCopy) => void;

const LANE_ATTRIBUTE = "data-lane-location";
const TRACK_ATTRIBUTE = "data-track-location";

let currentCopy: CueCopy | undefined;
const listeners = new Set<() => void>();
const drops = new Map<string, CopyDrop>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getCurrentCopy() {
  return currentCopy;
}

export function setCueCopy(copy: CueCopy | undefined): void {
  if (copy === currentCopy) {
    return;
  }
  currentCopy = copy;
  for (const listener of listeners) {
    listener();
  }
}

export function useCueCopy(location: string): CueCopy | undefined {
  const copy = useSyncExternalStore(subscribe, getCurrentCopy);
  return copy?.location === location ? copy : undefined;
}

export function setCopyDrop(location: string, drop: CopyDrop): () => void {
  drops.set(location, drop);
  return () => {
    if (drops.get(location) === drop) {
      drops.delete(location);
    }
  };
}

export function dropCueCopy(): void {
  const copy = currentCopy;
  setCueCopy(undefined);
  if (copy) {
    drops.get(copy.location)?.(copy);
  }
}

export type LaneTarget = { location: string; left: number; width: number };

export function getLaneTarget(clientX: number, clientY: number): LaneTarget | undefined {
  const track = document.elementFromPoint(clientX, clientY)?.closest(`[${TRACK_ATTRIBUTE}]`);
  const location = track?.getAttribute(TRACK_ATTRIBUTE);
  const lane = location && track?.querySelector(`[${LANE_ATTRIBUTE}="${CSS.escape(location)}"]`);
  if (!location || !lane) {
    return undefined;
  }
  const { left, width } = lane.getBoundingClientRect();
  return { location, left, width };
}

export function getLaneProps(location: string) {
  return { [LANE_ATTRIBUTE]: location };
}

export function getTrackProps(location: string) {
  return { [TRACK_ATTRIBUTE]: location };
}

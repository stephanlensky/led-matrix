import type { MixxxCue, MixxxCueType } from "./library.ts";

export const MAIN_CUE_COLOR = 0xff7a01;
export const INTRO_OUTRO_COLOR = 0x2c5c9a;

export type CueRange = {
  start: number;
  end: number;
  color: number;
};

export type CueMarker = {
  position: number;
  color: number;
  label: string;
  title: string;
};

export type CueMarkers = {
  ranges: CueRange[];
  markers: CueMarker[];
};

const RANGE_LABELS: Partial<Record<MixxxCueType, string>> = {
  loop: "Loop",
  intro: "Intro",
  outro: "Outro",
};

function getCueColor(cue: MixxxCue): number {
  if (cue.type === "main") {
    return MAIN_CUE_COLOR;
  }
  if (cue.type === "intro" || cue.type === "outro") {
    return INTRO_OUTRO_COLOR;
  }
  return cue.color;
}

function getHotcueTitle(cue: MixxxCue, number: number): string {
  return cue.label ? `Hotcue ${number}: ${cue.label}` : `Hotcue ${number}`;
}

export function getCueMarkers(cues: readonly MixxxCue[]): CueMarkers {
  const ranges: CueRange[] = [];
  const markers: CueMarker[] = [];
  for (const cue of cues) {
    const color = getCueColor(cue);
    const rangeLabel = RANGE_LABELS[cue.type];
    if (
      rangeLabel !== undefined &&
      cue.start !== undefined &&
      cue.end !== undefined &&
      cue.end > cue.start
    ) {
      ranges.push({ start: cue.start, end: cue.end, color });
    }
    if (cue.hotcue !== undefined && cue.start !== undefined) {
      const number = cue.hotcue + 1;
      markers.push({
        position: cue.start,
        color,
        label: String(number),
        title: getHotcueTitle(cue, number),
      });
    } else if (cue.type === "main" && cue.start !== undefined) {
      markers.push({ position: cue.start, color, label: "C", title: "Main cue" });
    } else if (rangeLabel !== undefined) {
      for (const [position, suffix] of [
        [cue.start, "start"],
        [cue.end, "end"],
      ] as const) {
        if (position !== undefined) {
          markers.push({ position, color, label: "", title: `${rangeLabel} ${suffix}` });
        }
      }
    }
  }
  return { ranges, markers };
}

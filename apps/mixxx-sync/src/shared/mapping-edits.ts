import { z } from "zod";
import { type Cue, type MappingFile, cuesSchema } from "./mapping.ts";

export type AnimationCue = Cue & { animation: string };

export type CueRange = {
  beat: number;
  end: number | undefined;
};

function getCueWithEnd(cue: AnimationCue, end: number | undefined): AnimationCue {
  const { end: _end, ...rest } = cue;
  return end === undefined ? rest : { ...rest, end };
}

function getExplicitCues(cues: readonly Cue[]): AnimationCue[] {
  let animation = "";
  return cues.map((cue) => {
    animation = cue.animation ?? animation;
    return { ...cue, animation };
  });
}

function getTrackCues(file: MappingFile, location: string): AnimationCue[] {
  return getExplicitCues(file.tracks[location] ?? []);
}

function getCueAt(cues: readonly AnimationCue[], index: number): AnimationCue {
  const cue = cues[index];
  if (!cue) {
    throw new Error(`Cue ${index} not found`);
  }
  return cue;
}

function setTrackCues(file: MappingFile, location: string, cues: readonly Cue[]): MappingFile {
  const tracks = { ...file.tracks };
  if (cues.length === 0) {
    delete tracks[location];
    return { tracks };
  }
  const sorted = cues.toSorted((a, b) => a.beat - b.beat);
  const result = cuesSchema.safeParse(sorted);
  if (!result.success) {
    throw new Error(z.prettifyError(result.error));
  }
  tracks[location] = result.data;
  return { tracks };
}

export function addCue(file: MappingFile, location: string, cue: AnimationCue): MappingFile {
  const cues = getTrackCues(file, location).filter(({ beat }) => beat !== cue.beat);
  const previous = cues.findLast(({ beat }) => beat < cue.beat);
  if (previous?.end !== undefined && previous.end > cue.beat) {
    previous.end = cue.beat;
  }
  return setTrackCues(file, location, [...cues, cue]);
}

export function clearCueEnd(file: MappingFile, location: string, index: number): MappingFile {
  const cues = getTrackCues(file, location);
  cues[index] = getCueWithEnd(getCueAt(cues, index), undefined);
  return setTrackCues(file, location, cues);
}

export function moveCue(
  file: MappingFile,
  location: string,
  index: number,
  beat: number,
): MappingFile {
  const cues = getTrackCues(file, location);
  const cue = getCueAt(cues, index);
  const end = cue.end === undefined ? undefined : cue.end + beat - cue.beat;
  cues[index] = getCueWithEnd({ ...cue, beat }, end);
  return setTrackCues(file, location, cues);
}

export function resizeCue(
  file: MappingFile,
  location: string,
  index: number,
  { beat, end }: CueRange,
): MappingFile {
  const cues = getTrackCues(file, location);
  cues[index] = getCueWithEnd({ ...getCueAt(cues, index), beat }, end);
  return setTrackCues(file, location, cues);
}

export function removeCue(file: MappingFile, location: string, index: number): MappingFile {
  const cues = getTrackCues(file, location);
  getCueAt(cues, index);
  return setTrackCues(
    file,
    location,
    cues.filter((_cue, cueIndex) => cueIndex !== index),
  );
}

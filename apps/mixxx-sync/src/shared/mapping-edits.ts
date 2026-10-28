import { z } from "zod";
import {
  type Cue,
  type ExplicitCue,
  type MappingFile,
  cuesSchema,
  getExplicitCues,
} from "./mapping.ts";

export type AnimationCue = ExplicitCue;

export type CueRange = {
  beat: number;
  end: number | undefined;
};

function getCueWithEnd(cue: AnimationCue, end: number | undefined): AnimationCue {
  const { end: _end, ...rest } = cue;
  return end === undefined ? rest : { ...rest, end };
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

export function pasteCue(
  file: MappingFile,
  location: string,
  cue: AnimationCue,
  beat: number,
): MappingFile {
  const { loops, ...rest } = cue;
  const next = getTrackCues(file, location).find((other) => other.beat > beat)?.beat ?? Infinity;
  const end = rest.end === undefined ? undefined : rest.end + beat - rest.beat;
  const copy = getCueWithEnd(
    { ...rest, beat },
    end === undefined ? undefined : Math.min(end, next),
  );
  return addCue(
    file,
    location,
    loops === undefined || end === undefined || end > next ? copy : { ...copy, loops },
  );
}

export function pasteCues(
  file: MappingFile,
  location: string,
  cues: readonly AnimationCue[],
  delta: number,
): MappingFile {
  return cues
    .toSorted((a, b) => a.beat - b.beat)
    .reduce((current, cue) => pasteCue(current, location, cue, cue.beat + delta), file);
}

export function replaceCue(
  file: MappingFile,
  location: string,
  index: number,
  { animation, section, params }: Pick<AnimationCue, "animation" | "section" | "params">,
): MappingFile {
  const cues = getTrackCues(file, location);
  const { beat, end } = getCueAt(cues, index);
  cues[index] = getCueWithEnd(
    {
      beat,
      animation,
      ...(section === undefined ? {} : { section }),
      ...(params === undefined ? {} : { params }),
    },
    end,
  );
  return setTrackCues(file, location, cues);
}

export function clearCueEnd(file: MappingFile, location: string, index: number): MappingFile {
  const cues = getTrackCues(file, location);
  const { loops: _loops, ...cue } = getCueAt(cues, index);
  cues[index] = getCueWithEnd(cue, undefined);
  return setTrackCues(file, location, cues);
}

export function setCueLoops(
  file: MappingFile,
  location: string,
  index: number,
  loops: { end: number; count: number } | undefined,
): MappingFile {
  const cues = getTrackCues(file, location);
  const { loops: _loops, ...cue } = getCueAt(cues, index);
  cues[index] = loops === undefined ? cue : { ...cue, end: loops.end, loops: loops.count };
  return setTrackCues(file, location, cues);
}

export function setCueTrim(
  file: MappingFile,
  location: string,
  index: number,
  isTrimmed: boolean,
): MappingFile {
  const cues = getTrackCues(file, location);
  const { trim: _trim, offset: _offset, ...cue } = getCueAt(cues, index);
  cues[index] = isTrimmed ? { ...cue, trim: true } : cue;
  return setTrackCues(file, location, cues);
}

export function trimCueStart(
  file: MappingFile,
  location: string,
  index: number,
  beat: number,
): MappingFile {
  const cues = getTrackCues(file, location);
  const { offset: current, ...cue } = getCueAt(cues, index);
  const offset = (current ?? 0) + beat - cue.beat;
  cues[index] = offset > 0 ? { ...cue, beat, offset } : { ...cue, beat };
  return setTrackCues(file, location, cues);
}

export function moveCues(
  file: MappingFile,
  location: string,
  indices: readonly number[],
  delta: number,
): MappingFile {
  const cues = getTrackCues(file, location);
  for (const index of indices) {
    const cue = getCueAt(cues, index);
    cues[index] = getCueWithEnd(
      { ...cue, beat: cue.beat + delta },
      cue.end === undefined ? undefined : cue.end + delta,
    );
  }
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

export function setCuesParam(
  file: MappingFile,
  location: string,
  indices: readonly number[],
  name: string,
  option: string | undefined,
): MappingFile {
  const cues = getTrackCues(file, location);
  for (const index of indices) {
    const { params: current, ...cue } = getCueAt(cues, index);
    const { [name]: _option, ...rest } = current ?? {};
    const params = option === undefined ? rest : { ...rest, [name]: option };
    cues[index] = Object.keys(params).length === 0 ? cue : { ...cue, params };
  }
  return setTrackCues(file, location, cues);
}

export function removeCues(
  file: MappingFile,
  location: string,
  indices: readonly number[],
): MappingFile {
  const cues = getTrackCues(file, location);
  for (const index of indices) {
    getCueAt(cues, index);
  }
  return setTrackCues(
    file,
    location,
    cues.filter((_cue, index) => !indices.includes(index)),
  );
}

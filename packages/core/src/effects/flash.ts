const UNITS = 1e6;

export type VisibleFlash = { index: number; progress: number };

export function getVisibleFlash(
  beat: number,
  flashesPerBeat: number,
  duty: number,
  bpm: number,
  fps: number,
  reverse = false,
): VisibleFlash | undefined {
  const position = Math.round(beat * flashesPerBeat * UNITS);
  const index = Math.floor(position / UNITS);
  const forwardPhase = position - index * UNITS;
  const phase = reverse ? UNITS - 1 - forwardPhase : forwardPhase;
  const frameLength = Math.round(((bpm * flashesPerBeat) / (60 * fps)) * UNITS);
  const length = Math.max(Math.round(duty * UNITS), frameLength);
  return phase < length ? { index, progress: phase / length } : undefined;
}

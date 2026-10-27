export type BeatSelection = { start: number; end: number };

export type Loop = { start: number; end: number };

export function getBeatSelection(anchor: number, beat: number): BeatSelection {
  return { start: Math.min(anchor, beat), end: Math.max(anchor, beat) };
}

function getBeatLabel(beat: number): string {
  return String(Number(beat.toFixed(2)));
}

export function getSelectionLabel({ start, end }: BeatSelection): string {
  const count = getBeatLabel(end - start);
  return `${getBeatLabel(start)} – ${getBeatLabel(end)} · ${count} ${count === "1" ? "beat" : "beats"}`;
}

export function isInLoop(time: number, { start, end }: Loop): boolean {
  return time >= start && time < end;
}

export function getLoopedTime(previousTime: number, time: number, loop: Loop): number | undefined {
  return previousTime < loop.end && time >= loop.end ? loop.start : undefined;
}

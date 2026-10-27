export type Beats =
  | { type: "grid"; bpm: number; firstBeat: number }
  | { type: "map"; positions: number[] };

function getGridOffset(bpm: number, firstBeat: number): number {
  return Math.ceil((-firstBeat * bpm) / 60);
}

function getFirstMapIndex(positions: number[]): number {
  const index = positions.findIndex((position) => position >= 0);
  return index === -1 ? positions.length : index;
}

function getMapInterval(positions: number[], position: number): number {
  let low = 0;
  let high = positions.length - 2;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (positions[middle]! <= position) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

export function getBeat(beats: Beats, position: number): number {
  if (beats.type === "grid") {
    return (
      ((position - beats.firstBeat) * beats.bpm) / 60 - getGridOffset(beats.bpm, beats.firstBeat)
    );
  }
  const { positions } = beats;
  const index = getMapInterval(positions, position);
  const start = positions[index]!;
  const end = positions[index + 1]!;
  return index - getFirstMapIndex(positions) + (position - start) / (end - start);
}

export function getPosition(beats: Beats, beat: number): number {
  if (beats.type === "grid") {
    return beats.firstBeat + ((beat + getGridOffset(beats.bpm, beats.firstBeat)) * 60) / beats.bpm;
  }
  const { positions } = beats;
  const absolute = beat + getFirstMapIndex(positions);
  const index = Math.min(Math.max(Math.floor(absolute), 0), positions.length - 2);
  const start = positions[index]!;
  const end = positions[index + 1]!;
  return start + (absolute - index) * (end - start);
}

export function getBpm(beats: Beats, beat: number): number {
  if (beats.type === "grid") {
    return beats.bpm;
  }
  const { positions } = beats;
  const absolute = beat + getFirstMapIndex(positions);
  const index = Math.min(Math.max(Math.floor(absolute), 0), positions.length - 2);
  return 60 / (positions[index + 1]! - positions[index]!);
}

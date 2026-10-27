import type { Track } from "./library.ts";
import type { MappingFile } from "./mapping.ts";

export type TrackFilter = {
  search: string;
  isMappedOnly: boolean;
};

export function getFilteredTracks(
  tracks: readonly Track[],
  { search, isMappedOnly }: TrackFilter,
  mapping: MappingFile | undefined,
): readonly Track[] {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0 && !isMappedOnly) {
    return tracks;
  }
  return tracks.filter((track) => {
    if (isMappedOnly && !mapping?.tracks[track.location]) {
      return false;
    }
    const text = `${track.title} ${track.artist}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function getTrackNumberLabel({ playlistPosition, trackNumber }: Track): string {
  return playlistPosition === undefined ? trackNumber : String(playlistPosition);
}

export function getDurationLabel(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export function getBpmLabel(bpm: number): string {
  return bpm > 0 ? bpm.toFixed(1) : "";
}

export function getColorLabel(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

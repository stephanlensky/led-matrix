import type { Beats } from "./beats.ts";

export type Playlist = {
  id: number;
  name: string;
  trackCount: number;
};

export type Track = {
  id: number;
  location: string;
  artist: string;
  title: string;
  album: string;
  trackNumber: string;
  duration: number;
  bpm: number;
  sampleRate: number;
  color: number | undefined;
  playlistPosition: number | undefined;
};

export type MixxxCueType = "hotcue" | "main" | "loop" | "jump" | "intro" | "outro";

export type MixxxCue = {
  type: MixxxCueType;
  hotcue: number | undefined;
  label: string;
  color: number;
  start: number | undefined;
  end: number | undefined;
};

export type TrackDetails = {
  cues: MixxxCue[];
  beats: Beats | undefined;
};

export type WaveformType = "summary" | "full";

export type Waveform = {
  visualSampleRate: number;
  low: Uint8Array;
  mid: Uint8Array;
  high: Uint8Array;
  all: Uint8Array;
};

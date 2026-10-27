import type { Output } from "@led-matrix/core";
import type { Playlist, Track, TrackDetails, Waveform, WaveformType } from "./library.ts";
import type { MappingFile, MappingState } from "./mapping.ts";

export type Settings = {
  serverUrl: string;
  output: Output;
  socketPath: string;
  mappingFile: string;
  mixxxDatabasePath: string;
};

export const daemonSettingKeys = [
  "serverUrl",
  "output",
  "socketPath",
  "mappingFile",
] as const satisfies readonly (keyof Settings)[];

export type UiState = Record<string, unknown>;

export type FileSetting = "mappingFile" | "mixxxDatabasePath";

export type CueStatus =
  | { beat: number; animationId: string; section: number }
  | { beat: number; animationId: null };

export type DaemonStatus = {
  isRunning: boolean;
  isMixxxConnected: boolean;
  trackCount: number | undefined;
  mappingErrors: string[];
  liveDeck: string | undefined;
  trackLocation: string | undefined;
  cue: CueStatus | undefined;
};

export const LOG_LIMIT = 500;

export type LogEntry = {
  id: number;
  time: number;
  message: string;
};

export type Api = {
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<Settings>;
  showFileDialog(setting: FileSetting): Promise<string | undefined>;
  getStatus(): Promise<DaemonStatus>;
  getLog(): Promise<LogEntry[]>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getPlaylists(): Promise<Playlist[]>;
  getTracks(playlistId?: number): Promise<Track[]>;
  getTrackDetails(trackId: number): Promise<TrackDetails | undefined>;
  getWaveform(trackId: number, type: WaveformType): Promise<Waveform | undefined>;
  getMapping(): Promise<MappingState>;
  setMapping(mapping: MappingFile): Promise<MappingFile>;
  getUiState(key: string): unknown;
  setUiState(key: string, value: unknown): void;
  onSettings(listener: (settings: Settings) => void): () => void;
  onStatus(listener: (status: DaemonStatus) => void): () => void;
  onLog(listener: (entry: LogEntry) => void): () => void;
  onMapping(listener: (state: MappingState) => void): () => void;
};

export const channels = {
  getSettings: "settings:get",
  setSettings: "settings:set",
  settings: "settings:changed",
  showFileDialog: "file:show-dialog",
  getStatus: "daemon:get-status",
  getLog: "daemon:get-log",
  start: "daemon:start",
  stop: "daemon:stop",
  status: "daemon:status",
  log: "daemon:log",
  getPlaylists: "library:get-playlists",
  getTracks: "library:get-tracks",
  getTrackDetails: "library:get-track-details",
  getWaveform: "library:get-waveform",
  getMapping: "mapping:get",
  setMapping: "mapping:set",
  mapping: "mapping:changed",
  getUiState: "ui-state:get",
  setUiState: "ui-state:set",
} as const;

import type { DeviceState, Output, ParameterSelection } from "@led-matrix/core";
import type { Playlist, Track, TrackDetails, Waveform, WaveformType } from "./library.ts";
import type { MappingFile, MappingState, ResolvedCue } from "./mapping.ts";

export type OutputMode = "server" | "local";

export type Settings = {
  serverUrl: string;
  outputMode: OutputMode;
  output: Output;
  serialPort: string | null;
  socketPath: string;
  mappingFile: string;
  mixxxDatabasePath: string;
  startDaemonOnLaunch: boolean;
};

export const daemonSettingKeys = [
  "serverUrl",
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
  isPlaying: boolean;
};

export type LivePosition = {
  location: string;
  beat: number;
  bpm: number;
  isPlaying: boolean;
  time: number;
};

export type TrackOutput = {
  type: "track";
  position: LivePosition;
  cues: ResolvedCue[];
};

export type PreviewOutput = {
  type: "preview";
  animationId: string;
  section: number;
  params: ParameterSelection | undefined;
  bpm: number;
};

export type EditorOutput = TrackOutput | PreviewOutput;

export type ContentOrigin = "server" | "cache";

export type ContentState = {
  origin: ContentOrigin | null;
  savedAt: number | null;
  error: string | null;
};

export type LocalDeviceState = DeviceState & {
  path: string | null;
  bytesPerSecond: number;
  droppedFrames: number;
};

export type LocalDevice = {
  device: LocalDeviceState;
  content: ContentState;
  log: LogEntry[];
};

export const LOG_LIMIT = 500;

export const BOARD_LOG_LIMIT = 50;

export type LogEntry = {
  id: number;
  time: number;
  message: string;
};

export type Api = {
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<Settings>;
  showFileDialog(setting: FileSetting): Promise<string | undefined>;
  getSerialPorts(): Promise<string[]>;
  getLocalDevice(): Promise<LocalDevice | undefined>;
  setLocalBrightness(brightness: number): Promise<LocalDevice | undefined>;
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
  setEditorOutput(output: EditorOutput): void;
  stopEditorOutput(): void;
  getUiState(key: string): unknown;
  setUiState(key: string, value: unknown): void;
  onSettings(listener: (settings: Settings) => void): () => void;
  onStatus(listener: (status: DaemonStatus) => void): () => void;
  onLog(listener: (entry: LogEntry) => void): () => void;
  onPosition(listener: (position: LivePosition | undefined) => void): () => void;
  onMapping(listener: (state: MappingState) => void): () => void;
};

export const channels = {
  getSettings: "settings:get",
  setSettings: "settings:set",
  settings: "settings:changed",
  showFileDialog: "file:show-dialog",
  getSerialPorts: "local:get-serial-ports",
  getLocalDevice: "local:get-device",
  setLocalBrightness: "local:set-brightness",
  getStatus: "daemon:get-status",
  getLog: "daemon:get-log",
  start: "daemon:start",
  stop: "daemon:stop",
  status: "daemon:status",
  log: "daemon:log",
  position: "daemon:position",
  getPlaylists: "library:get-playlists",
  getTracks: "library:get-tracks",
  getTrackDetails: "library:get-track-details",
  getWaveform: "library:get-waveform",
  getMapping: "mapping:get",
  setMapping: "mapping:set",
  mapping: "mapping:changed",
  setEditorOutput: "editor-output:set",
  stopEditorOutput: "editor-output:stop",
  getUiState: "ui-state:get",
  setUiState: "ui-state:set",
} as const;

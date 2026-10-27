import type { Output } from "@led-matrix/core";

export type Settings = {
  serverUrl: string;
  output: Output;
  socketPath: string;
  mappingFile: string;
};

export type CueStatus = {
  beat: number;
  animationId: string;
  section: number;
};

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
  showMappingFileDialog(): Promise<string | undefined>;
  getStatus(): Promise<DaemonStatus>;
  getLog(): Promise<LogEntry[]>;
  start(): Promise<void>;
  stop(): Promise<void>;
  onStatus(listener: (status: DaemonStatus) => void): () => void;
  onLog(listener: (entry: LogEntry) => void): () => void;
};

export const channels = {
  getSettings: "settings:get",
  setSettings: "settings:set",
  showMappingFileDialog: "mapping-file:show-dialog",
  getStatus: "daemon:get-status",
  getLog: "daemon:get-log",
  start: "daemon:start",
  stop: "daemon:stop",
  status: "daemon:status",
  log: "daemon:log",
} as const;

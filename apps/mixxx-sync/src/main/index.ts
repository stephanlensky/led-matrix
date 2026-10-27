import { join } from "node:path";
import { BrowserWindow, app, dialog, ipcMain, protocol } from "electron";
import {
  type FileSetting,
  LOG_LIMIT,
  type LogEntry,
  type Settings,
  channels,
  daemonSettingKeys,
} from "../shared/api.ts";
import { TRACK_AUDIO_SCHEME, type WaveformType } from "../shared/library.ts";
import type { MappingFile } from "../shared/mapping.ts";
import { createDaemon } from "./daemon.ts";
import { createMappingFile } from "./mapping-file.ts";
import { createMixxxLibrary } from "./mixxx-library.ts";
import { getDefaultSettings, getStoredSettings, setStoredSettings } from "./settings.ts";
import { createTrackAudioHandler } from "./track-audio.ts";

protocol.registerSchemesAsPrivileged([
  {
    scheme: TRACK_AUDIO_SCHEME,
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
  },
]);

const settingsPath = join(app.getPath("userData"), "settings.json");
let settings: Settings = await getStoredSettings(
  settingsPath,
  getDefaultSettings(app.getAppPath()),
);
const logEntries: LogEntry[] = [];

function send(channel: string, value: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, value);
  }
}

function log(message: string): void {
  const entry = { id: (logEntries.at(-1)?.id ?? 0) + 1, time: Date.now(), message };
  console.log(message);
  logEntries.push(entry);
  logEntries.splice(0, logEntries.length - LOG_LIMIT);
  send(channels.log, entry);
}

const library = createMixxxLibrary(() => settings.mixxxDatabasePath);
const mappingFile = createMappingFile({
  getPath: () => settings.mappingFile,
  onChange: (state) => send(channels.mapping, state),
});
const daemon = createDaemon({ log, onStatus: (status) => send(channels.status, status) });

ipcMain.handle(channels.getSettings, () => settings);
const fileFilters: Record<FileSetting, Electron.FileFilter[]> = {
  mappingFile: [{ name: "Mapping", extensions: ["json"] }],
  mixxxDatabasePath: [{ name: "Mixxx database", extensions: ["sqlite"] }],
};

ipcMain.handle(channels.setSettings, async (_event, value: Settings) => {
  if (
    daemon.getStatus().isRunning &&
    daemonSettingKeys.some((key) => value[key] !== settings[key])
  ) {
    throw new Error("Stop the daemon to change the daemon settings");
  }
  settings = await setStoredSettings(settingsPath, value);
  send(channels.settings, settings);
  void mappingFile.updatePath();
  return settings;
});
ipcMain.handle(channels.showFileDialog, async (event, setting: FileSetting) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = {
    defaultPath: settings[setting],
    filters: fileFilters[setting],
    properties: ["openFile" as const],
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  return result.filePaths[0];
});
ipcMain.handle(channels.getStatus, () => daemon.getStatus());
ipcMain.handle(channels.getLog, () => logEntries);
ipcMain.handle(channels.start, () => daemon.start(settings));
ipcMain.handle(channels.stop, () => daemon.stop());
ipcMain.handle(channels.getPlaylists, () => library.getPlaylists());
ipcMain.handle(channels.getTracks, (_event, playlistId?: number) => library.getTracks(playlistId));
ipcMain.handle(channels.getTrackDetails, (_event, trackId: number) =>
  library.getTrackDetails(trackId),
);
ipcMain.handle(channels.getWaveform, (_event, trackId: number, type: WaveformType) =>
  library.getTrackWaveform(trackId, type),
);
ipcMain.handle(channels.getMapping, () => mappingFile.getMapping());
ipcMain.handle(channels.setMapping, (_event, mapping: MappingFile) =>
  mappingFile.setMapping(mapping),
);

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
    },
  });
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  protocol.handle(
    TRACK_AUDIO_SCHEME,
    createTrackAudioHandler((trackId) => library.getTrackLocation(trackId)),
  );
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  daemon.stop();
  library.close();
  mappingFile.close();
  app.quit();
});

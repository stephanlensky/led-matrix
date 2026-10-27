import { join } from "node:path";
import { BrowserWindow, app, dialog, ipcMain } from "electron";
import { LOG_LIMIT, type LogEntry, type Settings, channels } from "../shared/api.ts";
import { createDaemon } from "./daemon.ts";
import { getDefaultSettings, getStoredSettings, setStoredSettings } from "./settings.ts";

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

const daemon = createDaemon({ log, onStatus: (status) => send(channels.status, status) });

ipcMain.handle(channels.getSettings, () => settings);
ipcMain.handle(channels.setSettings, async (_event, value: Settings) => {
  settings = await setStoredSettings(settingsPath, value);
  return settings;
});
ipcMain.handle(channels.showMappingFileDialog, async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = {
    defaultPath: settings.mappingFile,
    filters: [{ name: "Mapping", extensions: ["json"] }],
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

function createWindow(): void {
  const window = new BrowserWindow({
    width: 960,
    height: 840,
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

void app.whenReady().then(createWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  daemon.stop();
  app.quit();
});

import { type IpcRendererEvent, contextBridge, ipcRenderer } from "electron";
import {
  type Api,
  type DaemonStatus,
  type LogEntry,
  type Settings,
  channels,
} from "../shared/api.ts";

type Events = {
  [channels.settings]: Settings;
  [channels.status]: DaemonStatus;
  [channels.log]: LogEntry;
};

function subscribe<C extends keyof Events>(
  channel: C,
  listener: (value: Events[C]) => void,
): () => void {
  const handler = (_event: IpcRendererEvent, value: Events[C]) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

const api: Api = {
  getSettings: () => ipcRenderer.invoke(channels.getSettings),
  setSettings: (settings) => ipcRenderer.invoke(channels.setSettings, settings),
  showFileDialog: (setting) => ipcRenderer.invoke(channels.showFileDialog, setting),
  getStatus: () => ipcRenderer.invoke(channels.getStatus),
  getLog: () => ipcRenderer.invoke(channels.getLog),
  start: () => ipcRenderer.invoke(channels.start),
  stop: () => ipcRenderer.invoke(channels.stop),
  onSettings: (listener) => subscribe(channels.settings, listener),
  onStatus: (listener) => subscribe(channels.status, listener),
  onLog: (listener) => subscribe(channels.log, listener),
};

contextBridge.exposeInMainWorld("api", api);

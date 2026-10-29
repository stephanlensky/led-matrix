import type { Frame } from "@led-matrix/core";
import { type IpcRendererEvent, contextBridge, ipcRenderer } from "electron";
import {
  type Api,
  type DaemonStatus,
  type LivePosition,
  type LogEntry,
  type Settings,
  type UiState,
  channels,
} from "../shared/api.ts";
import type { MappingState } from "../shared/mapping.ts";

type Events = {
  [channels.settings]: Settings;
  [channels.status]: DaemonStatus;
  [channels.log]: LogEntry;
  [channels.position]: LivePosition | undefined;
  [channels.mapping]: MappingState;
  [channels.localFrame]: Frame;
};

function subscribe<C extends keyof Events>(
  channel: C,
  listener: (value: Events[C]) => void,
): () => void {
  const handler = (_event: IpcRendererEvent, value: Events[C]) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

let uiState: UiState = ipcRenderer.sendSync(channels.getUiState);

const api: Api = {
  getSettings: () => ipcRenderer.invoke(channels.getSettings),
  setSettings: (settings) => ipcRenderer.invoke(channels.setSettings, settings),
  showFileDialog: (setting) => ipcRenderer.invoke(channels.showFileDialog, setting),
  getSerialPorts: () => ipcRenderer.invoke(channels.getSerialPorts),
  getLocalDevice: () => ipcRenderer.invoke(channels.getLocalDevice),
  setLocalBrightness: (brightness) => ipcRenderer.invoke(channels.setLocalBrightness, brightness),
  getStatus: () => ipcRenderer.invoke(channels.getStatus),
  getLog: () => ipcRenderer.invoke(channels.getLog),
  start: () => ipcRenderer.invoke(channels.start),
  stop: () => ipcRenderer.invoke(channels.stop),
  getPlaylists: () => ipcRenderer.invoke(channels.getPlaylists),
  getTracks: (playlistId) => ipcRenderer.invoke(channels.getTracks, playlistId),
  getTrackDetails: (trackId) => ipcRenderer.invoke(channels.getTrackDetails, trackId),
  getWaveform: (trackId, type) => ipcRenderer.invoke(channels.getWaveform, trackId, type),
  getMapping: () => ipcRenderer.invoke(channels.getMapping),
  setMapping: (mapping) => ipcRenderer.invoke(channels.setMapping, mapping),
  setEditorOutput: (output) => ipcRenderer.send(channels.setEditorOutput, output),
  stopEditorOutput: () => ipcRenderer.send(channels.stopEditorOutput),
  getUiState: (key) => uiState[key],
  setUiState(key, value) {
    uiState = { ...uiState, [key]: value };
    ipcRenderer.send(channels.setUiState, key, value);
  },
  onSettings: (listener) => subscribe(channels.settings, listener),
  onStatus: (listener) => subscribe(channels.status, listener),
  onLog: (listener) => subscribe(channels.log, listener),
  onPosition: (listener) => subscribe(channels.position, listener),
  onMapping: (listener) => subscribe(channels.mapping, listener),
  onLocalFrame(listener) {
    const unsubscribe = subscribe(channels.localFrame, listener);
    ipcRenderer.send(channels.setLocalFrameStream, true);
    return () => {
      unsubscribe();
      ipcRenderer.send(channels.setLocalFrameStream, false);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);

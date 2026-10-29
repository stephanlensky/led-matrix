import { describe, expect, it, vi } from "vitest";
import type { Settings } from "../shared/api.ts";
import type { LocalClient } from "./local-client.ts";
import { createOutput, getOutputKey } from "./output.ts";
import { disabledRenderDeviceState } from "./render-protocol.ts";
import { createServerClient } from "./server.ts";

const settings: Settings = {
  serverUrl: "https://led-matrix.example.com",
  outputMode: "server",
  output: "device",
  serialPort: null,
  socketPath: "/run/user/1000/mixxx-control.sock",
  forwardPort: null,
  volumePort: null,
  bindHost: "0.0.0.0",
  mappingFile: "/app/mapping.json",
  mixxxDatabasePath: "/home/user/.mixxx/mixxxdb.sqlite",
  startDaemonOnLaunch: true,
};

const localSettings: Settings = { ...settings, outputMode: "local" };

function getUnused(): Promise<never> {
  return Promise.reject(new Error("Not used"));
}

function createFakeLocal(serialPort: string | null, load: LocalClient["load"]) {
  const loadContent = vi.fn<LocalClient["load"]>(load);
  const close = vi.fn<() => void>();
  const client: LocalClient = {
    getState: getUnused,
    getAnimations: loadContent,
    load: loadContent,
    play: getUnused,
    stop: getUnused,
    pause: getUnused,
    setTimeline: getUnused,
    setClock: getUnused,
    setBrightness: () => undefined,
    setFrameStream: () => undefined,
    getDeviceState: () => disabledRenderDeviceState,
    close,
  };
  return { client, serialPort, load: loadContent, close };
}

function setup(initial: Settings, load: LocalClient["load"] = () => Promise.resolve([])) {
  const locals: Array<ReturnType<typeof createFakeLocal>> = [];
  const logs: string[] = [];
  const createServer = vi.fn<typeof createServerClient>(createServerClient);
  const output = createOutput(initial, {
    createServer,
    createLocal: (serialPort) => {
      const local = createFakeLocal(serialPort, load);
      locals.push(local);
      return local.client;
    },
    log: (message) => logs.push(message),
  });
  return { output, locals, logs, createServer };
}

describe("getOutputKey", () => {
  it("ignores the server output and URL in local mode", () => {
    expect(getOutputKey({ ...localSettings, output: "simulator", serverUrl: "http://other" })).toBe(
      getOutputKey(localSettings),
    );
    expect(getOutputKey({ ...localSettings, serialPort: "/dev/ttyACM0" })).not.toBe(
      getOutputKey(localSettings),
    );
  });

  it("ignores the serial port in server mode", () => {
    expect(getOutputKey({ ...settings, serialPort: "/dev/ttyACM0" })).toBe(getOutputKey(settings));
    expect(getOutputKey({ ...settings, output: "simulator" })).not.toBe(getOutputKey(settings));
  });
});

describe("createOutput", () => {
  it("uses a server client without starting a render process", () => {
    const { output, locals, createServer } = setup(settings);
    expect(createServer).toHaveBeenCalledWith(settings.serverUrl, "device");
    expect(output.getClient()).toBe(createServer.mock.results[0]?.value);
    expect(output.getLocal()).toBeUndefined();
    expect(locals).toEqual([]);
  });

  it("starts the local client and loads content in local mode", () => {
    const { output, locals } = setup(localSettings);
    expect(locals).toHaveLength(1);
    expect(output.getClient()).toBe(locals[0]!.client);
    expect(output.getLocal()).toBe(locals[0]!.client);
    expect(locals[0]!.load).toHaveBeenCalledTimes(1);
  });

  it("logs a failed content load", async () => {
    const { logs } = setup(localSettings, () => Promise.reject(new Error("offline")));
    await vi.waitFor(() => expect(logs).toContain("Failed to load local content: offline"));
  });

  it("keeps the client when nothing relevant changed", () => {
    const { output, locals } = setup(localSettings);
    const client = output.getClient();
    expect(output.set({ ...localSettings, output: "simulator", socketPath: "/other" })).toBe(false);
    expect(output.getClient()).toBe(client);
    expect(locals[0]!.close).not.toHaveBeenCalled();
  });

  it("closes the local client when switching to the server", () => {
    const { output, locals, createServer } = setup(localSettings);
    expect(output.set(settings)).toBe(true);
    expect(locals[0]!.close).toHaveBeenCalledTimes(1);
    expect(output.getLocal()).toBeUndefined();
    expect(createServer).toHaveBeenCalledWith(settings.serverUrl, "device");
    expect(output.getClient()).toBe(createServer.mock.results[0]?.value);
  });

  it("starts a local client when switching from the server", () => {
    const { output, locals } = setup(settings);
    const server = output.getClient();
    expect(output.set(localSettings)).toBe(true);
    expect(locals).toHaveLength(1);
    expect(output.getClient()).toBe(locals[0]!.client);
    expect(output.getClient()).not.toBe(server);
  });

  it("restarts the local client when the serial port changes", () => {
    const { output, locals } = setup(localSettings);
    expect(output.set({ ...localSettings, serialPort: "/dev/ttyACM1" })).toBe(true);
    expect(locals[0]!.close).toHaveBeenCalledTimes(1);
    expect(locals[1]!.serialPort).toBe("/dev/ttyACM1");
    expect(output.getClient()).toBe(locals[1]!.client);
  });

  it("creates a new server client when the server output changes", () => {
    const { output, createServer } = setup(settings);
    const server = output.getClient();
    expect(output.set({ ...settings, output: "simulator" })).toBe(true);
    expect(createServer).toHaveBeenLastCalledWith(settings.serverUrl, "simulator");
    expect(output.getClient()).not.toBe(server);
  });

  it("closes the local client on close", () => {
    const { output, locals } = setup(localSettings);
    output.close();
    expect(locals[0]!.close).toHaveBeenCalledTimes(1);
  });
});

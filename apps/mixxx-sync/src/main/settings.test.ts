import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Settings } from "../shared/api.ts";
import { getStoredSettings, setStoredSettings } from "./settings.ts";

const defaults: Settings = {
  serverUrl: "https://led-matrix.example.com",
  outputMode: "server",
  output: "device",
  serialPort: null,
  socketPath: "/run/user/1000/mixxx-control.sock",
  mappingFile: "/app/mapping.json",
  mixxxDatabasePath: "/home/user/.mixxx/mixxxdb.sqlite",
  startDaemonOnLaunch: true,
};

describe("stored settings", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
  });

  async function getPath(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "settings-"));
    directories.push(directory);
    return join(directory, "settings.json");
  }

  it("returns the defaults without a settings file", async () => {
    expect(await getStoredSettings(await getPath(), defaults)).toEqual(defaults);
  });

  it("fills settings added after the file was written with defaults", async () => {
    const path = await getPath();
    await writeFile(
      path,
      JSON.stringify({ serverUrl: "http://localhost:3000", output: "simulator", socketPath: "/s" }),
    );
    expect(await getStoredSettings(path, defaults)).toEqual({
      ...defaults,
      serverUrl: "http://localhost:3000",
      output: "simulator",
      socketPath: "/s",
    });
  });

  it("keeps valid settings when another one is invalid", async () => {
    const path = await getPath();
    await writeFile(
      path,
      JSON.stringify({ outputMode: "bluetooth", serialPort: "/dev/ttyACM1", socketPath: "/s" }),
    );
    expect(await getStoredSettings(path, defaults)).toEqual({
      ...defaults,
      serialPort: "/dev/ttyACM1",
      socketPath: "/s",
    });
  });

  it("returns the defaults for a corrupt file", async () => {
    const path = await getPath();
    await writeFile(path, "[1, 2");
    expect(await getStoredSettings(path, defaults)).toEqual(defaults);
    await writeFile(path, "[1, 2]");
    expect(await getStoredSettings(path, defaults)).toEqual(defaults);
  });

  it("round-trips the local output settings", async () => {
    const path = await getPath();
    const settings: Settings = { ...defaults, outputMode: "local", serialPort: "/dev/ttyACM0" };
    expect(await setStoredSettings(path, settings)).toEqual(settings);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(settings);
    expect(await getStoredSettings(path, defaults)).toEqual(settings);
  });

  it("rejects invalid settings", async () => {
    const path = await getPath();
    await expect(setStoredSettings(path, { ...defaults, serialPort: "" })).rejects.toThrow(
      "serialPort",
    );
  });
});

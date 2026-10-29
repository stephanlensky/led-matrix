import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { outputSchema } from "@led-matrix/core";
import { z } from "zod";
import type { Settings } from "../shared/api.ts";

export const outputModeSchema = z.enum(["server", "local"]);

export const settingsSchema = z.object({
  serverUrl: z.url(),
  outputMode: outputModeSchema,
  output: outputSchema,
  serialPort: z.string().min(1).nullable(),
  socketPath: z.string().min(1),
  mappingFile: z.string().min(1),
  mixxxDatabasePath: z.string().min(1),
  startDaemonOnLaunch: z.boolean(),
});

const storedSettingsSchema = z.record(z.string(), z.unknown());

export function getDefaultSettings(appPath: string): Settings {
  return {
    serverUrl: process.env["LED_MATRIX_URL"] ?? "https://led-matrix.cardinal.slensky.com",
    outputMode: "server",
    output: outputSchema.catch("device").parse(process.env["LED_MATRIX_OUTPUT"]),
    serialPort: null,
    socketPath:
      process.env["MIXXX_SOCKET"] ??
      join(process.env["XDG_RUNTIME_DIR"] ?? "/tmp", "mixxx-control.sock"),
    mappingFile: join(appPath, "mapping.json"),
    mixxxDatabasePath: process.env["MIXXX_DATABASE"] ?? join(homedir(), ".mixxx", "mixxxdb.sqlite"),
    startDaemonOnLaunch: true,
  };
}

export async function getStoredSettings(path: string, defaults: Settings): Promise<Settings> {
  let stored: unknown;
  try {
    stored = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return defaults;
  }
  const result = storedSettingsSchema.safeParse(stored);
  if (!result.success) {
    return defaults;
  }
  const entries = Object.entries(settingsSchema.shape).flatMap(([key, schema]) => {
    const value = schema.safeParse(result.data[key]);
    return value.success ? [[key, value.data]] : [];
  });
  return { ...defaults, ...Object.fromEntries(entries) };
}

export async function setStoredSettings(path: string, settings: Settings): Promise<Settings> {
  const result = settingsSchema.safeParse(settings);
  if (!result.success) {
    throw new Error(z.prettifyError(result.error));
  }
  await writeFile(path, `${JSON.stringify(result.data, null, 2)}\n`);
  return result.data;
}

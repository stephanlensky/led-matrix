import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { outputSchema } from "@led-matrix/core";
import { z } from "zod";
import type { Settings } from "../shared/api.ts";

export const settingsSchema = z.object({
  serverUrl: z.url(),
  output: outputSchema,
  socketPath: z.string().min(1),
  mappingFile: z.string().min(1),
});

export function getDefaultSettings(appPath: string): Settings {
  return {
    serverUrl: process.env["LED_MATRIX_URL"] ?? "http://localhost:3000",
    output: outputSchema.catch("device").parse(process.env["LED_MATRIX_OUTPUT"]),
    socketPath:
      process.env["MIXXX_SOCKET"] ??
      join(process.env["XDG_RUNTIME_DIR"] ?? "/tmp", "mixxx-deck-state.sock"),
    mappingFile: join(appPath, "mapping.json"),
  };
}

export async function getStoredSettings(path: string, defaults: Settings): Promise<Settings> {
  let stored: unknown;
  try {
    stored = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return defaults;
  }
  const result = settingsSchema.partial().safeParse(stored);
  return result.success ? { ...defaults, ...result.data } : defaults;
}

export async function setStoredSettings(path: string, settings: Settings): Promise<Settings> {
  const result = settingsSchema.safeParse(settings);
  if (!result.success) {
    throw new Error(z.prettifyError(result.error));
  }
  await writeFile(path, `${JSON.stringify(result.data, null, 2)}\n`);
  return result.data;
}

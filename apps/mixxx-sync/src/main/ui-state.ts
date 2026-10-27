import { writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { UiState } from "../shared/api.ts";

const WRITE_DELAY = 500;

async function readUiState(path: string): Promise<UiState> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as UiState)
      : {};
  } catch {
    return {};
  }
}

function getUiStateText(state: UiState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export async function createUiStateFile(path: string) {
  let state = await readUiState(path);
  let timeout: NodeJS.Timeout | undefined;

  return {
    getState: () => state,
    set(key: string, value: unknown) {
      const { [key]: _, ...rest } = state;
      state = value === undefined ? rest : { ...rest, [key]: value };
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = undefined;
        void writeFile(path, getUiStateText(state)).catch(() => {});
      }, WRITE_DELAY);
    },
    flush() {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
        writeFileSync(path, getUiStateText(state));
      }
    },
  };
}

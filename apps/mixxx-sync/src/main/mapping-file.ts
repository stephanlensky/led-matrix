import { randomUUID } from "node:crypto";
import { type FSWatcher, watch } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import {
  type Cue,
  type MappingFile,
  type MappingState,
  emptyMapping,
  mappingSchema,
} from "../shared/mapping.ts";

const RELOAD_DELAY = 100;

const cueKeys = ["beat", "end", "animation", "section"] as const satisfies readonly (keyof Cue)[];

function getCueText(cue: Cue): string {
  const fields = cueKeys
    .filter((key) => cue[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}: ${JSON.stringify(cue[key])}`);
  return `{ ${fields.join(", ")} }`;
}

export function getMappingText(file: MappingFile): string {
  const tracks = Object.entries(file.tracks).map(([location, cues]) => {
    const cueLines = cues.map((cue) => `      ${getCueText(cue)}`).join(",\n");
    return `    ${JSON.stringify(location)}: [\n${cueLines}\n    ]`;
  });
  const tracksText = tracks.length === 0 ? "{}" : `{\n${tracks.join(",\n")}\n  }`;
  return `{\n  "tracks": ${tracksText}\n}\n`;
}

export function getParsedMapping(text: string): MappingFile {
  const result = mappingSchema.safeParse(JSON.parse(text));
  if (!result.success) {
    throw new Error(z.prettifyError(result.error));
  }
  return result.data;
}

export async function readMappingFile(path: string): Promise<MappingFile> {
  return getParsedMapping(await readFile(path, "utf8"));
}

async function readMappingText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function writeMappingFile(path: string, file: MappingFile): Promise<string> {
  const text = getMappingText(getParsedMapping(JSON.stringify(file)));
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, text);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return text;
}

export type MappingFileOptions = {
  getPath: () => string;
  onChange: (state: MappingState) => void;
};

export function createMappingFile({ getPath, onChange }: MappingFileOptions) {
  let lastText: string | undefined;
  let watchedPath: string | undefined;
  let watcher: FSWatcher | undefined;
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  let writeQueue: Promise<unknown> = Promise.resolve();

  async function getState(): Promise<MappingState> {
    const path = getPath();
    try {
      const text = await readMappingText(path);
      lastText = text;
      return { mapping: text === undefined ? emptyMapping : getParsedMapping(text) };
    } catch (error) {
      return { error: `Failed to load ${path}: ${getErrorMessage(error)}` };
    }
  }

  async function reload(): Promise<void> {
    const text = await readMappingText(getPath()).catch(() => null);
    if (text === lastText) {
      return;
    }
    onChange(await getState());
  }

  function setWatcher(): void {
    const path = getPath();
    if (path === watchedPath) {
      return;
    }
    watcher?.close();
    watcher = undefined;
    watchedPath = path;
    try {
      watcher = watch(dirname(path), (_event, fileName) => {
        if (fileName !== basename(path)) {
          return;
        }
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => void reload(), RELOAD_DELAY);
      });
    } catch {
      watcher = undefined;
    }
  }

  return {
    async getMapping(): Promise<MappingState> {
      setWatcher();
      return getState();
    },
    setMapping(file: MappingFile): Promise<MappingFile> {
      const path = getPath();
      const write = writeQueue.then(async () => {
        lastText = await writeMappingFile(path, file);
        return getParsedMapping(lastText);
      });
      writeQueue = write.catch(() => undefined);
      return write;
    },
    async updatePath(): Promise<void> {
      if (watchedPath === undefined || getPath() === watchedPath) {
        return;
      }
      setWatcher();
      onChange(await getState());
    },
    close(): void {
      clearTimeout(reloadTimer);
      watcher?.close();
    },
  };
}

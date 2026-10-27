import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { outputSchema } from "@led-matrix/core";
import { type Mapping, getResolvedMapping, mappingSchema } from "./mapping.ts";
import { connectToMixxx } from "./mixxx.ts";
import { createServerClient } from "./server.ts";
import { createSync } from "./sync.ts";

const RETRY_DELAY = 5000;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    server: { type: "string", default: process.env["LED_MATRIX_URL"] ?? "http://localhost:3000" },
    output: { type: "string", default: process.env["LED_MATRIX_OUTPUT"] ?? "device" },
    socket: {
      type: "string",
      default:
        process.env["MIXXX_SOCKET"] ??
        join(process.env["XDG_RUNTIME_DIR"] ?? "/tmp", "mixxx-deck-state.sock"),
    },
  },
});

const mappingFile = resolve(positionals[0] ?? join(import.meta.dirname, "../mapping.json"));
const server = createServerClient(values.server, outputSchema.parse(values.output));
let mapping: Mapping = new Map();

async function loadMapping(): Promise<void> {
  const file = mappingSchema.parse(JSON.parse(await readFile(mappingFile, "utf8")));
  const resolved = getResolvedMapping(file, await server.getAnimations());
  for (const error of resolved.errors) {
    console.log(`Mapping error: ${error}`);
  }
  mapping = resolved.mapping;
  console.log(`Loaded ${mapping.size} tracks from ${mappingFile}`);
}

async function loadMappingUntilReady(): Promise<void> {
  try {
    await loadMapping();
  } catch (error) {
    console.log(
      `Failed to load mapping: ${error instanceof Error ? error.message : String(error)}`,
    );
    setTimeout(() => void loadMappingUntilReady(), RETRY_DELAY);
  }
}

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
watch(dirname(mappingFile), (_event, fileName) => {
  if (fileName !== basename(mappingFile)) {
    return;
  }
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void loadMappingUntilReady(), 100);
});

await loadMappingUntilReady();

const sync = createSync({ server, getMapping: () => mapping });

console.log(`Waiting for Mixxx at ${values.socket}`);
connectToMixxx({
  path: values.socket,
  onState: (state) => void sync.update(state),
  onConnect: () => console.log(`Connected to Mixxx at ${values.socket}`),
  onDisconnect: (error) =>
    console.log(`Disconnected from Mixxx${error ? `: ${error.message}` : ""}`),
  onInvalidMessage: (line, error) => console.log(`Invalid message from Mixxx: ${line}`, error),
});

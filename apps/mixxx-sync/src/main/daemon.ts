import { type FSWatcher, watch } from "node:fs";
import { basename, dirname } from "node:path";
import type { DaemonStatus, Settings } from "../shared/api.ts";
import { type Mapping, getResolvedMapping } from "../shared/mapping.ts";
import { readMappingFile } from "./mapping-file.ts";
import { connectToMixxx } from "./mixxx.ts";
import { createServerClient } from "./server.ts";
import { createSync } from "./sync.ts";

const RETRY_DELAY = 5000;

export type DaemonOptions = {
  log: (message: string) => void;
  onStatus: (status: DaemonStatus) => void;
};

type Session = {
  stop: () => void;
};

const stoppedStatus: DaemonStatus = {
  isRunning: false,
  isMixxxConnected: false,
  trackCount: undefined,
  mappingErrors: [],
  liveDeck: undefined,
  trackLocation: undefined,
  cue: undefined,
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createDaemon({ log, onStatus }: DaemonOptions) {
  let session: Session | undefined;
  let status = stoppedStatus;

  function setStatus(update: Partial<DaemonStatus>): void {
    status = { ...status, ...update };
    onStatus(status);
  }

  function start(settings: Settings): Session {
    const { serverUrl, output, socketPath, mappingFile } = settings;
    const server = createServerClient(serverUrl, output);
    let isStopped = false;
    let mapping: Mapping = new Map();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;

    async function loadMapping(): Promise<void> {
      const file = await readMappingFile(mappingFile);
      const resolved = getResolvedMapping(file, await server.getAnimations());
      if (isStopped) {
        return;
      }
      for (const error of resolved.errors) {
        log(`Mapping error: ${error}`);
      }
      mapping = resolved.mapping;
      setStatus({ trackCount: mapping.size, mappingErrors: resolved.errors });
      log(`Loaded ${mapping.size} tracks from ${mappingFile}`);
    }

    async function loadMappingUntilReady(): Promise<void> {
      clearTimeout(retryTimer);
      try {
        await loadMapping();
      } catch (error) {
        if (isStopped) {
          return;
        }
        log(`Failed to load mapping: ${getErrorMessage(error)}`);
        retryTimer = setTimeout(() => void loadMappingUntilReady(), RETRY_DELAY);
      }
    }

    let watcher: FSWatcher | undefined;
    try {
      watcher = watch(dirname(mappingFile), (_event, fileName) => {
        if (fileName !== basename(mappingFile)) {
          return;
        }
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => void loadMappingUntilReady(), 100);
      });
    } catch (error) {
      log(`Failed to watch mapping file: ${getErrorMessage(error)}`);
    }

    void loadMappingUntilReady();

    const sync = createSync({
      server,
      getMapping: () => mapping,
      log,
      onStatus: (syncStatus) => {
        if (!isStopped) {
          setStatus(syncStatus);
        }
      },
    });

    log(`Waiting for Mixxx at ${socketPath}`);
    const connection = connectToMixxx({
      path: socketPath,
      onState: (state) => void sync.update(state),
      onConnect: () => {
        setStatus({ isMixxxConnected: true });
        log(`Connected to Mixxx at ${socketPath}`);
      },
      onDisconnect: (error) => {
        setStatus({ isMixxxConnected: false });
        log(`Disconnected from Mixxx${error ? `: ${error.message}` : ""}`);
      },
      onInvalidMessage: (line, error) =>
        log(`Invalid message from Mixxx: ${line} (${getErrorMessage(error)})`),
    });

    return {
      stop(): void {
        isStopped = true;
        clearTimeout(retryTimer);
        clearTimeout(reloadTimer);
        watcher?.close();
        connection.close();
      },
    };
  }

  return {
    getStatus: (): DaemonStatus => status,
    start(settings: Settings): void {
      if (session) {
        return;
      }
      session = start(settings);
      setStatus({ isRunning: true });
      log("Started");
    },
    stop(): void {
      if (!session) {
        return;
      }
      session.stop();
      session = undefined;
      setStatus(stoppedStatus);
      log("Stopped");
    },
  };
}

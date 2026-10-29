import { type FSWatcher, watch } from "node:fs";
import type { Server } from "node:http";
import { basename, dirname } from "node:path";
import type { DaemonStatus, LivePosition, Settings } from "../shared/api.ts";
import { type Mapping, getResolvedMapping } from "../shared/mapping.ts";
import { readMappingFile } from "./mapping-file.ts";
import { listen } from "./listen.ts";
import { connectToMixxx } from "./mixxx.ts";
import type { ServerClient } from "./server.ts";
import { type SocketForward, createSocketForward } from "./socket-forward.ts";
import { createSync } from "./sync.ts";
import { createVolumeServer } from "./volume-server.ts";

const RETRY_DELAY = 5000;

export type DaemonOptions = {
  getClient: () => ServerClient;
  log: (message: string) => void;
  onStatus: (status: DaemonStatus) => void;
  onPosition: (position: LivePosition | undefined) => void;
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
  isPlaying: false,
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createDaemon({ getClient, log, onStatus, onPosition }: DaemonOptions) {
  let session: Session | undefined;
  let status = stoppedStatus;

  function setStatus(update: Partial<DaemonStatus>): void {
    status = { ...status, ...update };
    onStatus(status);
  }

  function start(settings: Settings): Session {
    const { socketPath, mappingFile, forwardPort, volumePort, bindHost } = settings;
    const server = getClient();
    let isStopped = false;
    let mapping: Mapping = new Map();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    let isMixxxConnected = false;
    let mainGain: number | undefined;

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
      onPosition: (position) => {
        if (!isStopped) {
          onPosition(position);
        }
      },
    });

    log(`Waiting for Mixxx at ${socketPath}`);
    const connection = connectToMixxx({
      path: socketPath,
      onState: (state) => {
        mainGain = state.decks.mainGain;
        void sync.update(state);
      },
      onConnect: () => {
        isMixxxConnected = true;
        setStatus({ isMixxxConnected: true });
        log(`Connected to Mixxx at ${socketPath}`);
      },
      onDisconnect: (error) => {
        isMixxxConnected = false;
        setStatus({ isMixxxConnected: false });
        log(`Disconnected from Mixxx${error ? `: ${error.message}` : ""}`);
      },
      onInvalidMessage: (line, error) =>
        log(`Invalid message from Mixxx: ${line} (${getErrorMessage(error)})`),
    });

    let forward: SocketForward | undefined;
    if (forwardPort !== null) {
      forward = createSocketForward(socketPath, log);
      listen(forward.server, {
        name: "Socket forward",
        host: bindHost,
        port: forwardPort,
        protocol: "tcp",
        log,
      });
    }

    let volumeServer: Server | undefined;
    if (volumePort !== null) {
      volumeServer = createVolumeServer({
        getMainGain: () => mainGain,
        isConnected: () => isMixxxConnected,
        setMainGain: (parameter) => connection.send({ type: "setMainGain", parameter }),
      });
      listen(volumeServer, {
        name: "Volume page",
        host: bindHost,
        port: volumePort,
        protocol: "http",
        log,
      });
    }

    return {
      stop(): void {
        isStopped = true;
        forward?.close();
        volumeServer?.close();
        volumeServer?.closeAllConnections();
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
      onPosition(undefined);
      log("Stopped");
    },
  };
}

import type { Output } from "@led-matrix/core";
import type { Settings } from "../shared/api.ts";
import type { LocalClient } from "./local-client.ts";
import { type ServerClient, createServerClient } from "./server.ts";

export type OutputOptions = {
  createServer?: (baseUrl: string, output: Output) => ServerClient;
  createLocal: (serialPort: string | null) => LocalClient;
  log?: (message: string) => void;
};

type Current = {
  key: string;
  client: ServerClient;
  local: LocalClient | undefined;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getOutputKey({ outputMode, serverUrl, output, serialPort }: Settings): string {
  return JSON.stringify(
    outputMode === "local" ? [outputMode, serialPort] : [outputMode, serverUrl, output],
  );
}

export function createOutput(
  settings: Settings,
  { createServer = createServerClient, createLocal, log = console.log }: OutputOptions,
) {
  function create(value: Settings): Current {
    const key = getOutputKey(value);
    if (value.outputMode === "server") {
      log(`Using ${value.output} output on ${value.serverUrl}`);
      return { key, client: createServer(value.serverUrl, value.output), local: undefined };
    }
    log(`Using local USB output on ${value.serialPort ?? "the detected serial port"}`);
    const local = createLocal(value.serialPort);
    void local.load().catch((error: unknown) => {
      log(`Failed to load local content: ${getErrorMessage(error)}`);
    });
    return { key, client: local, local };
  }

  let current = create(settings);

  return {
    getClient: (): ServerClient => current.client,
    getLocal: (): LocalClient | undefined => current.local,
    set(value: Settings): boolean {
      if (current.key === getOutputKey(value)) {
        return false;
      }
      current.local?.close();
      current = create(value);
      return true;
    },
    close(): void {
      current.local?.close();
    },
  };
}

import type { EditorOutput, PreviewOutput, Settings } from "../shared/api.ts";
import type { Mapping } from "../shared/mapping.ts";
import { type ServerClient, createServerClient } from "./server.ts";
import { createSync } from "./sync.ts";

const NUDGE_INTERVAL = 250;
const SYNC_TIMEOUT = 1000;

type Sync = ReturnType<typeof createSync>;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createEditorOutput(log: (message: string) => void) {
  const logOutput = (message: string) => log(`Editor output: ${message}`);
  let server: ServerClient | undefined;
  let serverKey: string | undefined;
  let sync: Sync | undefined;
  let mapping: Mapping = new Map();
  let lastSetAt = -Infinity;
  let previewKey: string | undefined;
  let isPreviewBusy = false;
  let lastPreviewError: string | undefined;

  function getServer({ serverUrl, output }: Settings): ServerClient {
    const key = `${serverUrl}\n${output}`;
    if (!server || key !== serverKey) {
      server = createServerClient(serverUrl, output);
      serverKey = key;
      sync = undefined;
      previewKey = undefined;
    }
    return server;
  }

  async function setPreview(current: ServerClient, preview: PreviewOutput): Promise<void> {
    const { animationId: id, section, params, bpm } = preview;
    const key = JSON.stringify([id, section, params, bpm]);
    if (key === previewKey || isPreviewBusy) {
      return;
    }
    isPreviewBusy = true;
    try {
      await current.play({ id, section, params, beat: 0, bpm });
      previewKey = key;
      lastPreviewError = undefined;
      logOutput(`Previewing ${id} section ${section}`);
    } catch (error) {
      const message = getErrorMessage(error);
      if (message !== lastPreviewError) {
        logOutput(`Server request failed: ${message}`);
        lastPreviewError = message;
      }
    } finally {
      isPreviewBusy = false;
    }
  }

  return {
    set(settings: Settings, output: EditorOutput): void {
      const current = getServer(settings);
      const now = Date.now();
      if (now - lastSetAt > SYNC_TIMEOUT) {
        sync = undefined;
        previewKey = undefined;
      }
      lastSetAt = now;
      if (output.type === "preview") {
        sync = undefined;
        void setPreview(current, output);
        return;
      }
      previewKey = undefined;
      mapping = new Map([[output.position.location, output.cues]]);
      sync ??= createSync({
        server: current,
        getMapping: () => mapping,
        nudgeInterval: NUDGE_INTERVAL,
        log: logOutput,
      });
      void sync.follow(output.position);
    },
    async stop(): Promise<void> {
      const current = server;
      server = undefined;
      sync = undefined;
      previewKey = undefined;
      lastSetAt = -Infinity;
      if (!current) {
        return;
      }
      try {
        await current.stop();
        logOutput("Stopped");
      } catch (error) {
        logOutput(`Server request failed: ${getErrorMessage(error)}`);
      }
    },
  };
}

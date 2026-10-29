import {
  createDeviceLink,
  createFrameCache,
  createPlaybackEngine,
  createRenderer,
} from "@led-matrix/core";
import { nodeCanvas } from "@led-matrix/core/node-canvas";
import { createSerialTransport } from "@led-matrix/core/node-device";
import {
  type RenderEvent,
  type RenderMessage,
  type RenderOptions,
  renderOptionsSchema,
} from "./render-protocol.ts";
import { createClipStore, createRenderService, getErrorMessage } from "./render-service.ts";

const { fps, bpm, devicePath, latencyOffset }: RenderOptions = renderOptionsSchema.parse(
  JSON.parse(process.argv[2] ?? "{}"),
);

function send(event: RenderEvent): void {
  process.send?.(event);
}

function log(message: string): void {
  send({ type: "log", message });
}

const clips = createClipStore();
const engine = createPlaybackEngine({
  renderer: createRenderer({
    fps,
    canvas: nodeCanvas,
    clips: clips.library,
    cache: createFrameCache(),
  }),
  fps,
  bpm,
  getLatency: () => device.getLatency(),
  onError: (error) => log(`Failed to render animation: ${getErrorMessage(error)}`),
});
const transport = createSerialTransport({
  path: devicePath,
  onError: (error) => log(`Serial device error: ${getErrorMessage(error)}`),
});
const device = createDeviceLink({
  engine,
  transport,
  latencyOffset,
  onLog: (text) => log(`Device: ${text}`),
});
device.subscribe((state) =>
  send({ type: "device", state: { ...state, path: transport.getPath() } }),
);
const service = createRenderService({
  engine,
  clips,
  setBrightness: (brightness) => device.setBrightness(brightness),
  send,
});
process.on("message", (message: RenderMessage) => service.handle(message));
process.on("disconnect", () => process.exit());
engine.start();

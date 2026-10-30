import {
  createDeviceLink,
  createFrameCache,
  createPlaybackEngine,
  createRenderer,
} from "@led-matrix/core";
import { nodeCanvas } from "@led-matrix/core/node-canvas";
import { createSerialTransport, deflate } from "@led-matrix/core/node-device";
import {
  type RenderEvent,
  type RenderMessage,
  type RenderOptions,
  renderOptionsSchema,
} from "./render-protocol.ts";
import { createRecorder } from "./recorder.ts";
import { createClipStore, createRenderService, getErrorMessage } from "./render-service.ts";

const EXIT_DELAY = 100;

const { fps, bpm, devicePath, latencyOffset }: RenderOptions = renderOptionsSchema.parse(
  JSON.parse(process.argv[2] ?? "{}"),
);

function send(event: RenderEvent): void {
  if (process.connected) {
    process.send?.(event);
  }
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
  deflate,
  onLog: (text) => send({ type: "deviceLog", text }),
});
device.subscribe((state) =>
  send({
    type: "device",
    state: {
      ...state,
      path: transport.getPath(),
      bytesPerSecond: transport.getBytesPerSecond(),
      droppedFrames: transport.getDroppedFrames(),
    },
  }),
);
const recorder = createRecorder({
  fps,
  onState: (state) => send({ type: "recording", state }),
});
engine.subscribe({ setFrame: (frame) => recorder.setFrame(frame) });
const service = createRenderService({
  engine,
  clips,
  setBrightness: (brightness) => device.setBrightness(brightness),
  setRecording(directory) {
    if (directory === null) {
      recorder.stop();
    } else {
      void recorder.start(directory);
    }
  },
  getLatency: () => device.getLatency(),
  send,
});
function exit(): void {
  recorder.stop();
  engine.stop();
  engine.tick();
  setTimeout(() => process.exit(), EXIT_DELAY);
}

process.on("message", (message: RenderMessage) => service.handle(message));
process.once("disconnect", exit);
process.once("SIGTERM", exit);
engine.start();

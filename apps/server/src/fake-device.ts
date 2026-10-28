import { createSocket } from "node:dgram";
import { parseArgs } from "node:util";
import {
  DEVICE_PORT,
  DeviceFeature,
  DeviceMode,
  FRAME_TIMEOUT_MS,
  type Frame,
  HEIGHT,
  SERVER_PORT,
  STATUS_INTERVAL_MS,
  WIDTH,
  createFrame,
  createFrameAssembler,
  decodeMessage,
  encodeStatus,
  getPixel,
} from "@led-matrix/core";

const { values: options } = parseArgs({
  options: {
    port: { type: "string", default: String(DEVICE_PORT) },
    server: { type: "string", default: "127.0.0.1" },
    "server-port": { type: "string", default: String(SERVER_PORT) },
    loss: { type: "string", default: "0" },
    brightness: { type: "string", default: "255" },
    raw: { type: "boolean", default: false },
  },
});

const loss = Number(options.loss);
const isTerminal = process.stdout.isTTY;
const startedAt = performance.now();
const assembler = createFrameAssembler();
const socket = createSocket("udp4");

let brightness = Number(options.brightness);
let frame = createFrame();
let lastFrameAt: number | undefined;
let shownSequence = 0;
let framesShown = 0;
let framesShownAtLastStatus = 0;
let fps = 0;
let isDirty = true;

function getMode() {
  return lastFrameAt !== undefined && performance.now() - lastFrameAt < FRAME_TIMEOUT_MS
    ? DeviceMode.streaming
    : DeviceMode.idle;
}

function getModeName(): string {
  return getMode() === DeviceMode.streaming ? "streaming" : "idle";
}

function sendStatus(): void {
  const status = encodeStatus({
    width: WIDTH,
    height: HEIGHT,
    brightness,
    mode: getMode(),
    features: options.raw ? 0 : DeviceFeature.compressedFrames,
    uptimeMs: performance.now() - startedAt,
    framesShown,
    framesDropped: assembler.getFramesDropped(),
    shownSequence,
    shownAgeMs: lastFrameAt === undefined ? 0 : Math.round(performance.now() - lastFrameAt),
  });
  socket.send(status, Number(options["server-port"]), options.server);
}

function getColor(displayed: Frame, x: number, y: number): string {
  return getPixel(displayed, x, y)
    .map((value) => Math.round((value * brightness) / 255))
    .join(";");
}

function getStatusLine(): string {
  return [
    `mode ${getModeName()}`,
    `${fps} fps`,
    `shown ${framesShown}`,
    `dropped ${assembler.getFramesDropped()}`,
    `brightness ${brightness}`,
  ].join("  ");
}

function draw(): void {
  if (!isDirty) {
    return;
  }
  isDirty = false;
  const displayed = getMode() === DeviceMode.streaming ? frame : createFrame();
  const lines: string[] = [];
  for (let y = 0; y < HEIGHT; y += 2) {
    let line = "";
    for (let x = 0; x < WIDTH; x += 1) {
      line += `\x1b[38;2;${getColor(displayed, x, y)}m\x1b[48;2;${getColor(displayed, x, y + 1)}m▀`;
    }
    lines.push(`${line}\x1b[0m`);
  }
  process.stdout.write(`\x1b[H${lines.join("\n")}\n\x1b[2K${getStatusLine()}\n`);
}

socket.on("message", (data) => {
  if (Math.random() < loss) {
    return;
  }
  const message = decodeMessage(data);
  if (message?.type === "frame") {
    const assembled = assembler.add(message);
    if (assembled) {
      frame = assembled;
      lastFrameAt = performance.now();
      shownSequence = message.sequence;
      framesShown += 1;
      isDirty = true;
    }
  } else if (message?.type === "setBrightness") {
    brightness = message.brightness;
    isDirty = true;
    sendStatus();
  }
});

socket.bind(Number(options.port), () => {
  console.log(`Fake device listening on UDP port ${socket.address().port}`);
  sendStatus();
});

setInterval(() => {
  fps = Math.round(((framesShown - framesShownAtLastStatus) * 1000) / STATUS_INTERVAL_MS);
  framesShownAtLastStatus = framesShown;
  sendStatus();
  if (isTerminal) {
    isDirty = true;
  } else {
    console.log(getStatusLine());
  }
}, STATUS_INTERVAL_MS);

if (isTerminal) {
  process.stdout.write("\x1b[?25l\x1b[2J");
  setInterval(draw, 1000 / 30);
  process.on("SIGINT", () => {
    process.stdout.write("\x1b[0m\x1b[?25h\n");
    process.exit(0);
  });
}

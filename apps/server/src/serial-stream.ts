import { execFileSync } from "node:child_process";
import { createReadStream, createWriteStream, readdirSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  DeviceMode,
  type Frame,
  createFrame,
  createSerialDecoder,
  decodeMessage,
  encodeCompressedFrame,
  encodeFrame,
  encodeSerialPacket,
  encodeSetBrightness,
  setPixel,
} from "@led-matrix/core";

const { values: options } = parseArgs({
  options: {
    device: { type: "string" },
    fps: { type: "string", default: "30" },
    seconds: { type: "string", default: "15" },
    raw: { type: "boolean", default: false },
    pattern: { type: "string", default: "shape" },
    brightness: { type: "string" },
    "brightness-at": { type: "string", default: "5" },
  },
});

function getDevice(): string {
  if (options.device) {
    return options.device;
  }
  const name = readdirSync("/dev/serial/by-id").find((entry) =>
    entry.startsWith("usb-Adafruit_MatrixPortal_ESP32-S3"),
  );
  if (!name) {
    throw new Error("board not found");
  }
  return `/dev/serial/by-id/${name}`;
}

const device = getDevice();
execFileSync("stty", ["-F", device, "raw", "-echo"]);
const input = createReadStream(device);
const output = createWriteStream(device);
const decoder = createSerialDecoder();
const fps = Number(options.fps);
const startedAt = performance.now();
const sentAt = new Map<number, number>();
const latencies: number[] = [];
const statuses: Array<{ at: number; framesShown: number; framesDropped: number }> = [];
let sequence = 0;
let bytesSent = 0;
let maxBuffered = 0;
let lateTicks = 0;

function getFrame(index: number): Frame {
  const frame = createFrame();
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      if (options.pattern === "noise") {
        const value = Math.imul(x * 73856093 + y * 19349663 + index * 83492791, 2654435761) >>> 0;
        setPixel(frame, x, y, [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff]);
      } else if (options.pattern === "gradient") {
        setPixel(frame, x, y, [(x * 4 + index) % 256, (y * 4) % 256, (x + y + index) % 256]);
      } else {
        const dx = x - 32 - 20 * Math.cos(index / 15);
        const dy = y - 32 - 20 * Math.sin(index / 15);
        if (dx * dx + dy * dy < 100) {
          setPixel(frame, x, y, [255, 40, 160]);
        } else if (x === index % 64) {
          setPixel(frame, x, y, [0, 200, 255]);
        }
      }
    }
  }
  return frame;
}

function write(packet: Uint8Array): void {
  const encoded = encodeSerialPacket(packet);
  bytesSent += encoded.length;
  output.write(encoded);
}

input.on("data", (chunk: Buffer) => {
  const now = performance.now();
  for (const packet of decoder.add(chunk)) {
    const message = decodeMessage(packet);
    if (message?.type === "log") {
      console.log(`log: ${message.text}`);
    } else if (message?.type === "status") {
      const { status } = message;
      const sent = sentAt.get(status.shownSequence);
      const latency = sent === undefined ? undefined : now - status.shownAgeMs - sent;
      if (latency !== undefined && status.mode === DeviceMode.streaming) {
        latencies.push(latency);
      }
      statuses.push({
        at: now,
        framesShown: status.framesShown,
        framesDropped: status.framesDropped,
      });
      console.log(
        `status: mode ${status.mode} brightness ${status.brightness} shown ${status.framesShown} dropped ${status.framesDropped} seq ${status.shownSequence} age ${status.shownAgeMs} latency ${latency?.toFixed(1) ?? "-"} ms`,
      );
    } else {
      console.log(`unknown packet ${Buffer.from(packet).toString("hex").slice(0, 40)}`);
    }
  }
});

output.write(Uint8Array.of(0));
let nextAt = performance.now();
let brightnessSent = false;
const timer = setInterval(() => {
  const now = performance.now();
  if (now - nextAt > 1000 / fps) {
    lateTicks += 1;
  }
  nextAt = now;
  const elapsed = (now - startedAt) / 1000;
  if (options.brightness && !brightnessSent && elapsed >= Number(options["brightness-at"])) {
    brightnessSent = true;
    console.log(`sending brightness ${options.brightness}`);
    write(encodeSetBrightness(Number(options.brightness)));
  }
  const frame = getFrame(sequence);
  const packets = options.raw
    ? encodeFrame(frame, sequence)
    : encodeCompressedFrame(frame, sequence);
  for (const packet of packets) {
    write(packet);
  }
  sentAt.set(sequence, performance.now());
  sequence += 1;
  maxBuffered = Math.max(maxBuffered, output.writableLength);
  if (elapsed >= Number(options.seconds)) {
    finish();
  }
}, 1000 / fps);

function finish(): void {
  clearInterval(timer);
  setTimeout(() => {
    const seconds = (performance.now() - startedAt) / 1000;
    const sorted = latencies.toSorted((a, b) => a - b);
    const first = statuses.find((status) => status.at - startedAt > 2000);
    const last = statuses.at(-1);
    console.log(
      `sent ${sequence} frames, ${(bytesSent / seconds / 1024).toFixed(1)} KB/s, ${(bytesSent / sequence).toFixed(0)} bytes/frame, max buffered ${maxBuffered}, late ticks ${lateTicks}`,
    );
    if (first && last && last !== first) {
      const span = (last.at - first.at) / 1000;
      console.log(
        `device: ${((last.framesShown - first.framesShown) / span).toFixed(1)} fps shown, ${last.framesDropped - first.framesDropped} dropped over ${span.toFixed(1)} s`,
      );
    }
    if (sorted.length > 0) {
      console.log(
        `latency ms: min ${sorted[0]!.toFixed(1)} median ${sorted[Math.floor(sorted.length / 2)]!.toFixed(1)} max ${sorted.at(-1)!.toFixed(1)} (${sorted.length} samples)`,
      );
    }
    process.exit(0);
  }, 1500);
}

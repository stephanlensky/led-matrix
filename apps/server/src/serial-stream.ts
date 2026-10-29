import { parseArgs } from "node:util";
import {
  DeviceMode,
  type Frame,
  createFrame,
  encodeCompressedFrame,
  encodeFrame,
  encodeSetBrightness,
  setPixel,
} from "@led-matrix/core";
import { createSerialTransport, encodeSerialFrame } from "@led-matrix/core/node-device";

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

const fps = Number(options.fps);
const sentAt = new Map<number, number>();
const latencies: number[] = [];
const statuses: Array<{ at: number; framesShown: number; framesDropped: number }> = [];
let startedAt = 0;
let sequence = 0;
let frameIndex = 0;
let bytesSent = 0;
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

const transport = createSerialTransport({
  path: options.device,
  onError: (error) => console.log(`serial error: ${String(error)}`),
});

transport.subscribe({
  setConnected(connected) {
    console.log(`serial ${connected ? `open ${transport.getPath()}` : "closed"}`);
    if (connected && startedAt === 0) {
      start();
    }
  },
  setMessage(message) {
    const now = performance.now();
    if (message.type === "log") {
      console.log(`log: ${message.text}`);
      return;
    }
    if (message.type !== "status") {
      return;
    }
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
      `status: mode ${status.mode} brightness ${status.brightness} shown ${status.framesShown} dropped ${status.framesDropped} seq ${status.shownSequence} age ${status.shownAgeMs} latency ${latency?.toFixed(1) ?? "-"} ms, ${(transport.getBytesPerSecond() / 1024).toFixed(1)} KB/s`,
    );
  },
});

function start(): void {
  startedAt = performance.now();
  let nextAt = startedAt;
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
      transport.send(encodeSetBrightness(Number(options.brightness)));
    }
    const frame = getFrame(frameIndex);
    frameIndex += 1;
    const packets = options.raw
      ? encodeFrame(frame, sequence)
      : encodeCompressedFrame(frame, sequence);
    if (transport.sendFrame(packets)) {
      bytesSent += encodeSerialFrame(packets).length;
      sentAt.set(sequence, performance.now());
      sequence += 1;
    }
    if (elapsed >= Number(options.seconds)) {
      clearInterval(timer);
      setTimeout(finish, 1500);
    }
  }, 1000 / fps);
}

function finish(): void {
  const seconds = (performance.now() - startedAt) / 1000;
  const sorted = latencies.toSorted((a, b) => a - b);
  const first = statuses.find((status) => status.at - startedAt > 2000);
  const last = statuses.at(-1);
  console.log(
    `sent ${sequence} of ${frameIndex} frames (${transport.getDroppedFrames()} dropped by backpressure), ${(bytesSent / seconds / 1024).toFixed(1)} KB/s, ${(bytesSent / Math.max(sequence, 1)).toFixed(0)} bytes/frame, late ticks ${lateTicks}`,
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
  transport.close();
  process.exit(0);
}

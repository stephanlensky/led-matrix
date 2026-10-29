import { execFile } from "node:child_process";
import { type Socket, createSocket } from "node:dgram";
import { once } from "node:events";
import {
  createReadStream,
  createWriteStream,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { promisify } from "node:util";
import type { DeviceAddress, DeviceTransportListener } from "./device-link.ts";
import {
  DEVICE_PORT,
  type DeviceMessage,
  SERIAL_DELIMITER,
  SERVER_PORT,
  createSerialDecoder,
  decodeMessage,
  encodeSerialPacket,
} from "./device-protocol.ts";

const ADAFRUIT_VENDOR_ID = "239a";
const SERIAL_BY_ID_PREFIX = "usb-Adafruit_MatrixPortal_ESP32-S3_";
const USB_PACKET_SIZE = 64;
const THROUGHPUT_WINDOW_MS = 1000;

const execFileAsync = promisify(execFile);

function setMessage(listeners: Set<DeviceTransportListener>, message: DeviceMessage): void {
  for (const listener of listeners) {
    listener.setMessage?.(message);
  }
}

function bind(socket: Socket, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, () => {
      socket.off("error", reject);
      resolve();
    });
  });
}

export type UdpTransportOptions = {
  port?: number;
  host?: string;
  onError?: (error: unknown) => void;
};

export type UdpTransport = Awaited<ReturnType<typeof createUdpTransport>>;

export async function createUdpTransport({
  port = SERVER_PORT,
  host,
  onError,
}: UdpTransportOptions = {}) {
  const socket = createSocket("udp4");
  const listeners = new Set<DeviceTransportListener>();
  let target: DeviceAddress | null = host ? { address: host, port: DEVICE_PORT } : null;

  function send(packet: Uint8Array): void {
    if (target) {
      socket.send(packet, target.port, target.address);
    }
  }

  socket.on("error", (error) => onError?.(error));
  socket.on("message", (data, remote) => {
    const message = decodeMessage(data);
    if (message?.type !== "status") {
      return;
    }
    target = host ? target : { address: remote.address, port: remote.port };
    setMessage(listeners, message);
  });

  await bind(socket, port);

  return {
    getPort: () => socket.address().port,
    getAddress: () => target,
    send,
    sendFrame(packets: Uint8Array[]): boolean {
      for (const packet of packets) {
        send(packet);
      }
      return true;
    },
    subscribe(listener: DeviceTransportListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close(): void {
      listeners.clear();
      socket.close();
    },
  };
}

function readDirectory(path: string): string[] {
  try {
    return readdirSync(path).toSorted();
  } catch {
    return [];
  }
}

function getVendorId(ttyPath: string): string | undefined {
  try {
    const interfacePath = realpathSync(join(ttyPath, "device"));
    return readFileSync(join(dirname(interfacePath), "idVendor"), "utf8").trim();
  } catch {
    return undefined;
  }
}

export type SerialDeviceDirectories = {
  byIdDirectory?: string;
  ttyDirectory?: string;
  deviceDirectory?: string;
};

export function findSerialDevice({
  byIdDirectory = "/dev/serial/by-id",
  ttyDirectory = "/sys/class/tty",
  deviceDirectory = "/dev",
}: SerialDeviceDirectories = {}): string | undefined {
  const byId = readDirectory(byIdDirectory).find((name) => name.startsWith(SERIAL_BY_ID_PREFIX));
  if (byId) {
    return join(byIdDirectory, byId);
  }
  const tty = readDirectory(ttyDirectory).find(
    (name) =>
      name.startsWith("ttyACM") && getVendorId(join(ttyDirectory, name)) === ADAFRUIT_VENDOR_ID,
  );
  return tty === undefined ? undefined : join(deviceDirectory, tty);
}

export type SerialPort = { input: Readable; output: Writable };

export async function openSerialPort(path: string): Promise<SerialPort> {
  await execFileAsync("stty", ["-F", path, "raw", "-echo"]);
  const input = createReadStream(path);
  const output = createWriteStream(path, { flags: "r+" });
  try {
    await Promise.all([once(input, "open"), once(output, "open")]);
  } catch (error) {
    input.destroy();
    output.destroy();
    throw error;
  }
  return { input, output };
}

export type SerialTransportOptions = {
  path?: string;
  findPath?: () => string | undefined;
  open?: (path: string) => Promise<SerialPort>;
  maxPendingBytes?: number;
  minRetryMs?: number;
  maxRetryMs?: number;
  getTime?: () => number;
  onError?: (error: unknown) => void;
};

export type SerialTransport = ReturnType<typeof createSerialTransport>;

export function encodeSerialFrame(packets: Uint8Array[]): Uint8Array {
  const encoded = packets.map(encodeSerialPacket);
  const size = encoded.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(size % USB_PACKET_SIZE === 0 ? size + 1 : size);
  let offset = 0;
  for (const chunk of encoded) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export function createSerialTransport({
  path,
  findPath = findSerialDevice,
  open = openSerialPort,
  maxPendingBytes = 0,
  minRetryMs = 250,
  maxRetryMs = 5000,
  getTime = () => performance.now(),
  onError,
}: SerialTransportOptions = {}) {
  const listeners = new Set<DeviceTransportListener>();
  const writes: Array<{ at: number; bytes: number }> = [];
  let port: SerialPort | undefined;
  let openPath: string | null = null;
  let retryMs = minRetryMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isClosed = false;
  let lastError: string | undefined;
  let droppedFrames = 0;

  function setConnected(connected: boolean): void {
    for (const listener of listeners) {
      listener.setConnected?.(connected);
    }
  }

  function setError(error: unknown): void {
    const text = String(error);
    if (text !== lastError) {
      lastError = text;
      onError?.(error);
    }
  }

  function scheduleConnect(): void {
    if (isClosed) {
      return;
    }
    timer = setTimeout(() => void connect(), retryMs);
    retryMs = Math.min(retryMs * 2, maxRetryMs);
  }

  function disconnect(opened: SerialPort, error?: unknown): void {
    if (port !== opened) {
      return;
    }
    port = undefined;
    openPath = null;
    opened.input.destroy();
    opened.output.destroy();
    if (error !== undefined) {
      setError(error);
    }
    setConnected(false);
    scheduleConnect();
  }

  function attach(opened: SerialPort, devicePath: string): void {
    const decoder = createSerialDecoder();
    port = opened;
    openPath = devicePath;
    retryMs = minRetryMs;
    lastError = undefined;
    opened.input.on("data", (chunk: Uint8Array) => {
      for (const packet of decoder.add(chunk)) {
        const message = decodeMessage(packet);
        if (message) {
          setMessage(listeners, message);
        }
      }
    });
    opened.input.on("error", (error) => disconnect(opened, error));
    opened.input.on("close", () => disconnect(opened));
    opened.output.on("error", (error) => disconnect(opened, error));
    opened.output.on("close", () => disconnect(opened));
    opened.output.write(Uint8Array.of(SERIAL_DELIMITER));
    setConnected(true);
  }

  async function connect(): Promise<void> {
    timer = undefined;
    const devicePath = path ?? findPath();
    if (devicePath === undefined) {
      scheduleConnect();
      return;
    }
    try {
      const opened = await open(devicePath);
      if (isClosed) {
        opened.input.destroy();
        opened.output.destroy();
        return;
      }
      attach(opened, devicePath);
    } catch (error) {
      setError(error);
      scheduleConnect();
    }
  }

  function write(bytes: Uint8Array): void {
    port?.output.write(bytes, (error) => {
      if (!error) {
        writes.push({ at: getTime(), bytes: bytes.length });
      }
    });
  }

  function getBytesPerSecond(): number {
    const since = getTime() - THROUGHPUT_WINDOW_MS;
    while (writes.length > 0 && writes[0]!.at < since) {
      writes.shift();
    }
    return (writes.reduce((total, entry) => total + entry.bytes, 0) * 1000) / THROUGHPUT_WINDOW_MS;
  }

  void connect();

  return {
    getAddress: (): DeviceAddress | null => null,
    getPath: () => openPath,
    isOpen: () => port !== undefined,
    getBytesPerSecond,
    getDroppedFrames: () => droppedFrames,
    send(packet: Uint8Array): void {
      write(encodeSerialPacket(packet));
    },
    sendFrame(packets: Uint8Array[]): boolean {
      if (!port) {
        return false;
      }
      if (port.output.writableLength > maxPendingBytes) {
        droppedFrames++;
        return false;
      }
      write(encodeSerialFrame(packets));
      return true;
    },
    subscribe(listener: DeviceTransportListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close(): void {
      isClosed = true;
      clearTimeout(timer);
      listeners.clear();
      if (port) {
        const opened = port;
        port = undefined;
        openPath = null;
        opened.input.destroy();
        opened.output.destroy();
      }
    },
  };
}

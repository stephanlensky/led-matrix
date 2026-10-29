import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type DeviceMessage,
  DeviceMode,
  type DeviceStatus,
  createSerialDecoder,
  decodeMessage,
  encodeLog,
  encodeSerialPacket,
  encodeSetBrightness,
  encodeStatus,
} from "./device-protocol.ts";
import {
  type SerialPort,
  type SerialTransport,
  type SerialTransportOptions,
  createSerialTransport,
  encodeSerialFrame,
  findSerialDevice,
  getSerialDevices,
} from "./node-device.ts";

const status: DeviceStatus = {
  width: 64,
  height: 64,
  brightness: 255,
  mode: DeviceMode.idle,
  features: 1,
  uptimeMs: 1000,
  framesShown: 0,
  framesDropped: 0,
  shownSequence: 0,
  shownAgeMs: 0,
};

function createFakePort() {
  const written: Uint8Array[] = [];
  const pending: Array<() => void> = [];
  const state = { isBlocked: false };
  const input = new PassThrough();
  const output = new Writable({
    write(chunk: Uint8Array, _encoding, callback) {
      written.push(chunk);
      if (state.isBlocked) {
        pending.push(() => callback());
      } else {
        callback();
      }
    },
  });
  return {
    port: { input, output } satisfies SerialPort,
    written,
    state,
    release() {
      state.isBlocked = false;
      for (const callback of pending.splice(0)) {
        callback();
      }
    },
    getPackets(): Uint8Array[] {
      return createSerialDecoder().add(Buffer.concat(written));
    },
  };
}

describe("encodeSerialFrame", () => {
  it("joins COBS packets and avoids sizes that end on a full USB packet", () => {
    const packets = [Uint8Array.of(1, 0, 2), new Uint8Array(57).fill(7)];
    const bytes = encodeSerialFrame(packets);
    expect(bytes).toHaveLength(65);
    expect(bytes.at(-1)).toBe(0);
    expect(createSerialDecoder().add(bytes)).toEqual(packets);
    expect(encodeSerialFrame([Uint8Array.of(1)])).toHaveLength(3);
  });
});

describe("findSerialDevice", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true });
    }
  });

  function createDirectories() {
    const root = mkdtempSync(join(tmpdir(), "serial-"));
    directories.push(root);
    const byIdDirectory = join(root, "by-id");
    const ttyDirectory = join(root, "tty");
    mkdirSync(byIdDirectory);
    mkdirSync(ttyDirectory);
    function addTty(name: string, vendorId: string) {
      const usbDevice = join(root, "usb", name);
      mkdirSync(join(usbDevice, "interface"), { recursive: true });
      writeFileSync(join(usbDevice, "idVendor"), `${vendorId}\n`);
      mkdirSync(join(ttyDirectory, name));
      symlinkSync(join(usbDevice, "interface"), join(ttyDirectory, name, "device"));
    }
    return { byIdDirectory, ttyDirectory, deviceDirectory: "/dev", addTty };
  }

  it("prefers the by-id link of the MatrixPortal", () => {
    const { addTty, ...options } = createDirectories();
    addTty("ttyACM0", "239a");
    writeFileSync(join(options.byIdDirectory, "usb-Other_Device-if00"), "");
    writeFileSync(join(options.byIdDirectory, "usb-Adafruit_MatrixPortal_ESP32-S3_68:ee-if00"), "");
    expect(findSerialDevice(options)).toBe(
      join(options.byIdDirectory, "usb-Adafruit_MatrixPortal_ESP32-S3_68:ee-if00"),
    );
  });

  it("falls back to the Adafruit vendor id in sysfs", () => {
    const { addTty, ...options } = createDirectories();
    addTty("ttyACM0", "2341");
    addTty("ttyACM1", "239a");
    expect(findSerialDevice(options)).toBe("/dev/ttyACM1");
  });

  it("returns undefined when no board is attached", () => {
    const { addTty, ...options } = createDirectories();
    addTty("ttyACM0", "2341");
    expect(findSerialDevice(options)).toBeUndefined();
  });

  it("lists by-id links and ACM ttys of any vendor", () => {
    const { addTty, ...options } = createDirectories();
    addTty("ttyACM1", "239a");
    addTty("ttyACM0", "2341");
    mkdirSync(join(options.ttyDirectory, "ttyS0"));
    writeFileSync(join(options.byIdDirectory, "usb-Other_Device-if00"), "");
    expect(getSerialDevices(options)).toEqual([
      join(options.byIdDirectory, "usb-Other_Device-if00"),
      "/dev/ttyACM0",
      "/dev/ttyACM1",
    ]);
  });
});

describe("serial transport", () => {
  const transports: SerialTransport[] = [];

  afterEach(() => {
    for (const transport of transports.splice(0)) {
      transport.close();
    }
  });

  function setup(
    ports: Array<ReturnType<typeof createFakePort>>,
    options: Partial<SerialTransportOptions> = {},
  ) {
    const open = vi.fn<(path: string) => Promise<SerialPort>>(async () => {
      const next = ports.shift();
      if (!next) {
        throw new Error("ENOENT");
      }
      return next.port;
    });
    const onError = vi.fn<(error: unknown) => void>();
    const transport = createSerialTransport({
      findPath: () => "/dev/ttyACM0",
      open,
      minRetryMs: 1,
      maxRetryMs: 4,
      onError,
      ...options,
    });
    transports.push(transport);
    return { transport, open, onError };
  }

  it("sends a lone delimiter on open and frames packets with COBS", async () => {
    const fake = createFakePort();
    const { transport, open } = setup([fake], { path: "/dev/custom" });
    await vi.waitFor(() => expect(transport.isOpen()).toBe(true));
    expect(open).toHaveBeenCalledWith("/dev/custom");
    expect(transport.getPath()).toBe("/dev/custom");
    expect([...fake.written[0]!]).toEqual([0]);

    transport.send(encodeSetBrightness(40));
    expect(transport.sendFrame([Uint8Array.of(1, 2), Uint8Array.of(0, 3)])).toBe(true);
    expect(fake.getPackets()).toEqual([
      encodeSetBrightness(40),
      Uint8Array.of(1, 2),
      Uint8Array.of(0, 3),
    ]);
    await vi.waitFor(() => expect(transport.getBytesPerSecond()).toBeGreaterThan(0));
  });

  it("drops frames while writes are pending instead of queueing them", async () => {
    const fake = createFakePort();
    const { transport } = setup([fake]);
    await vi.waitFor(() => expect(transport.isOpen()).toBe(true));
    fake.state.isBlocked = true;
    expect(transport.sendFrame([Uint8Array.of(1)])).toBe(true);
    expect(transport.sendFrame([Uint8Array.of(2)])).toBe(false);
    expect(transport.sendFrame([Uint8Array.of(3)])).toBe(false);
    expect(transport.getDroppedFrames()).toBe(2);
    transport.send(encodeSetBrightness(40));
    fake.release();
    expect(transport.sendFrame([Uint8Array.of(4)])).toBe(true);
    expect(fake.getPackets()).toEqual([
      Uint8Array.of(1),
      encodeSetBrightness(40),
      Uint8Array.of(4),
    ]);
  });

  it("decodes status and log messages from the device", async () => {
    const fake = createFakePort();
    const { transport } = setup([fake]);
    const setMessage = vi.fn<(message: DeviceMessage) => void>();
    transport.subscribe({ setMessage });
    await vi.waitFor(() => expect(transport.isOpen()).toBe(true));
    const bytes = Buffer.concat([
      encodeSerialPacket(encodeStatus(status)),
      encodeSerialPacket(encodeLog("booted")),
    ]);
    fake.port.input.write(bytes.subarray(0, 10));
    fake.port.input.write(bytes.subarray(10));
    await vi.waitFor(() => expect(setMessage).toHaveBeenCalledTimes(2));
    expect(setMessage.mock.calls.map(([message]) => message)).toEqual([
      decodeMessage(encodeStatus(status)),
      { type: "log", text: "booted" },
    ]);
  });

  it("reports disconnects and reconnects with backoff", async () => {
    const first = createFakePort();
    const second = createFakePort();
    const { transport, open, onError } = setup([first, second], { minRetryMs: 50 });
    const setConnected = vi.fn<(connected: boolean) => void>();
    transport.subscribe({ setConnected });
    await vi.waitFor(() => expect(setConnected).toHaveBeenCalledWith(true));

    first.port.input.destroy(new Error("EIO"));
    await vi.waitFor(() => expect(setConnected).toHaveBeenCalledWith(false));
    expect(transport.isOpen()).toBe(false);
    expect(transport.sendFrame([Uint8Array.of(1)])).toBe(false);
    expect(onError).toHaveBeenCalledWith(new Error("EIO"));

    await vi.waitFor(() => expect(transport.isOpen()).toBe(true));
    expect(setConnected.mock.calls).toEqual([[true], [false], [true]]);
    expect([...second.written[0]!]).toEqual([0]);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("retries until the device appears", async () => {
    const fake = createFakePort();
    const ports: Array<ReturnType<typeof createFakePort>> = [];
    const { transport, open, onError } = setup(ports);
    await vi.waitFor(() => expect(open.mock.calls.length).toBeGreaterThan(2));
    expect(onError).toHaveBeenCalledTimes(1);
    ports.push(fake);
    await vi.waitFor(() => expect(transport.isOpen()).toBe(true));
  });
});

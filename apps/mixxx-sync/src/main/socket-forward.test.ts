import { mkdtemp, rm } from "node:fs/promises";
import {
  type ListenOptions,
  type Server,
  type Socket,
  createConnection,
  createServer,
} from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSocketForward } from "./socket-forward.ts";

function listen(server: Server, options: ListenOptions): Promise<void> {
  return new Promise((resolve) => server.listen(options, resolve));
}

function getPort(server: Server): number {
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Server is not listening on a TCP port");
  }
  return address.port;
}

function getData(socket: Socket): Promise<string> {
  return new Promise((resolve) => socket.once("data", (data) => resolve(data.toString())));
}

function getClose(socket: Socket): Promise<boolean> {
  return new Promise((resolve) => socket.once("close", () => resolve(true)));
}

describe("socket forward", () => {
  const cleanups: (() => void)[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
    await Promise.all(
      directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
    );
  });

  async function getSocketPath(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "socket-forward-"));
    directories.push(directory);
    return join(directory, "mixxx.sock");
  }

  async function startMixxx(path: string) {
    const sockets: Socket[] = [];
    const accepted: Socket[] = [];
    const waiting: ((socket: Socket) => void)[] = [];
    const server = createServer((socket) => {
      sockets.push(socket);
      const resolve = waiting.shift();
      if (resolve) {
        resolve(socket);
      } else {
        accepted.push(socket);
      }
    });
    await listen(server, { path });
    cleanups.push(() => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close();
    });
    return {
      getClient(): Promise<Socket> {
        const socket = accepted.shift();
        return socket ? Promise.resolve(socket) : new Promise((resolve) => waiting.push(resolve));
      },
    };
  }

  async function startForward(path: string, messages: string[] = []) {
    const forward = createSocketForward(path, (message) => messages.push(message));
    await listen(forward.server, { port: 0, host: "127.0.0.1" });
    cleanups.push(() => forward.close());
    return { ...forward, port: getPort(forward.server) };
  }

  async function connect(port: number): Promise<Socket> {
    const socket = createConnection(port, "127.0.0.1");
    cleanups.push(() => socket.destroy());
    await new Promise((resolve) => socket.once("connect", resolve));
    return socket;
  }

  it("pipes data both ways through a new Unix socket connection per client", async () => {
    const path = await getSocketPath();
    const mixxx = await startMixxx(path);
    const { port } = await startForward(path);

    const first = await connect(port);
    const firstMixxx = await mixxx.getClient();
    const second = await connect(port);
    const secondMixxx = await mixxx.getClient();

    const fromMixxx = getData(first);
    firstMixxx.write('{"type":"decks"}\n');
    expect(await fromMixxx).toBe('{"type":"decks"}\n');

    const toMixxx = getData(secondMixxx);
    second.write('{"type":"setMainGain","parameter":0.5}\n');
    expect(await toMixxx).toBe('{"type":"setMainGain","parameter":0.5}\n');
  });

  it("closes the TCP client when Mixxx closes and the reverse", async () => {
    const path = await getSocketPath();
    const mixxx = await startMixxx(path);
    const { port } = await startForward(path);

    const first = await connect(port);
    const firstMixxx = await mixxx.getClient();
    const firstClosed = getClose(first);
    firstMixxx.destroy();
    expect(await firstClosed).toBe(true);

    const second = await connect(port);
    const secondMixxx = await mixxx.getClient();
    const secondMixxxClosed = getClose(secondMixxx);
    second.destroy();
    expect(await secondMixxxClosed).toBe(true);
  });

  it("drops clients while Mixxx is not running and keeps listening", async () => {
    const path = await getSocketPath();
    const messages: string[] = [];
    const { port } = await startForward(path, messages);

    const dropped = await connect(port);
    expect(await getClose(dropped)).toBe(true);
    expect(messages).toEqual([expect.stringContaining("Mixxx is not reachable")]);

    const mixxx = await startMixxx(path);
    const client = await connect(port);
    const mixxxClient = await mixxx.getClient();
    const data = getData(client);
    mixxxClient.write("hello\n");
    expect(await data).toBe("hello\n");
  });

  it("closes open connections when closed", async () => {
    const path = await getSocketPath();
    const mixxx = await startMixxx(path);
    const forward = await startForward(path);

    const client = await connect(forward.port);
    const mixxxClient = await mixxx.getClient();
    const closed = Promise.all([getClose(client), getClose(mixxxClient)]);
    forward.close();
    expect(await closed).toEqual([true, true]);
  });
});

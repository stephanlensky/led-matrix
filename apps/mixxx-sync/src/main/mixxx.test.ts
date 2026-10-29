import { mkdtemp, rm } from "node:fs/promises";
import { type Socket, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type MixxxState, connectToMixxx } from "./mixxx.ts";

describe("connectToMixxx", () => {
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

  it("parses the main gain and sends commands as JSON lines", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mixxx-"));
    directories.push(directory);
    const path = join(directory, "mixxx.sock");
    const client = new Promise<Socket>((resolve) => {
      const server = createServer(resolve);
      server.listen(path);
      cleanups.push(() => server.close());
    });
    const states: MixxxState[] = [];
    const connected = Promise.withResolvers<void>();
    const connection = connectToMixxx({
      path,
      onState: (state) => states.push(state),
      onConnect: () => connected.resolve(),
    });
    cleanups.push(() => connection.close());
    expect(connection.send({ type: "setMainGain", parameter: 0.5 })).toBe(false);

    const socket = await client;
    cleanups.push(() => socket.destroy());
    await connected.promise;
    const received = new Promise<string>((resolve) =>
      socket.once("data", (data) => resolve(data.toString())),
    );
    expect(connection.send({ type: "setMainGain", value: 2 })).toBe(true);
    expect(await received).toBe('{"type":"setMainGain","value":2}\n');

    socket.write(
      '{"type":"decks","time":0,"outputLatency":0,"crossfader":0,"mainGain":1.5,"decks":[]}\n',
    );
    await expect.poll(() => states.at(-1)?.decks.mainGain).toBe(1.5);
  });
});

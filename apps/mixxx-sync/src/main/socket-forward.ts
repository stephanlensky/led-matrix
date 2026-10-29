import { type Server, type Socket, createConnection, createServer } from "node:net";

export type SocketForward = {
  server: Server;
  close: () => void;
};

export function createSocketForward(
  socketPath: string,
  log: (message: string) => void,
): SocketForward {
  const sockets = new Set<Socket>();

  function track(socket: Socket): void {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  }

  const server = createServer((client) => {
    const address = `${client.remoteAddress}:${client.remotePort}`;
    const mixxx = createConnection(socketPath);
    let isConnected = false;
    track(client);
    track(mixxx);
    mixxx.on("connect", () => {
      isConnected = true;
      log(`Forwarding ${address} to Mixxx`);
    });
    mixxx.on("error", (error) => {
      if (!isConnected) {
        log(`Dropped ${address}: Mixxx is not reachable at ${socketPath} (${error.message})`);
      }
    });
    client.on("error", () => undefined);
    mixxx.on("close", () => client.destroy());
    client.on("close", () => {
      mixxx.destroy();
      if (isConnected) {
        log(`Closed forward for ${address}`);
      }
    });
    client.pipe(mixxx);
    mixxx.pipe(client);
  });

  return {
    server,
    close(): void {
      server.close();
      for (const socket of sockets) {
        socket.destroy();
      }
    },
  };
}

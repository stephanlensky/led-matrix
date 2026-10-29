import type { Server } from "node:net";
import { networkInterfaces } from "node:os";

export type ListenOptions = {
  name: string;
  host: string;
  port: number;
  protocol: "tcp" | "http";
  log: (message: string) => void;
};

function getHosts(host: string): string[] {
  if (host !== "0.0.0.0") {
    return [host];
  }
  const addresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4")
    .map((entry) => entry.address);
  return addresses.length > 0 ? addresses : [host];
}

export function listen(server: Server, { name, host, port, protocol, log }: ListenOptions): void {
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      log(`${name}: port ${port} is already in use on ${host}`);
    } else if (error.code === "EACCES") {
      log(`${name}: no permission to listen on ${host}:${port}`);
    } else {
      log(`${name} error: ${error.message}`);
    }
  });
  server.listen(port, host, () => {
    const urls = getHosts(host).map((address) => `${protocol}://${address}:${port}`);
    log(`${name} listening on ${urls.join(", ")}`);
  });
}

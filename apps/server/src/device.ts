import { type DeviceLinkOptions, createDeviceLink } from "@led-matrix/core";
import {
  type UdpTransportOptions,
  createUdpTransport,
  deflate,
} from "@led-matrix/core/node-device";

export type UdpDeviceLinkOptions = UdpTransportOptions & Omit<DeviceLinkOptions, "transport">;

export type UdpDeviceLink = Awaited<ReturnType<typeof createUdpDeviceLink>>;

export async function createUdpDeviceLink({
  port,
  host,
  onError,
  ...options
}: UdpDeviceLinkOptions) {
  const transport = await createUdpTransport({ port, host, onError });
  return { ...createDeviceLink({ deflate, ...options, transport }), getPort: transport.getPort };
}

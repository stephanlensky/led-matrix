import {
  type DeviceState,
  type Frame,
  type PlaybackState,
  createFrame,
  streamMessageSchema,
} from "@led-matrix/core";
import { useEffect, useState } from "react";

const RECONNECT_DELAY_MS = 1000;

export type Stream = {
  frame: Frame;
  state: PlaybackState | undefined;
  device: DeviceState | undefined;
  isConnected: boolean;
};

export function useStream(url: string): Stream {
  const [frame, setFrame] = useState<Frame>(createFrame);
  const [state, setState] = useState<PlaybackState>();
  const [device, setDevice] = useState<DeviceState>();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let isClosed = false;

    function connect() {
      socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      socket.addEventListener("open", () => setIsConnected(true));
      socket.addEventListener("message", (event: MessageEvent<ArrayBuffer | string>) => {
        if (typeof event.data !== "string") {
          setFrame(new Uint8ClampedArray(event.data));
          return;
        }
        const message = streamMessageSchema.parse(JSON.parse(event.data));
        if (message.type === "state") {
          setState(message.state);
        } else {
          setDevice(message.device);
        }
      });
      socket.addEventListener("close", () => {
        setIsConnected(false);
        if (!isClosed) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });
    }

    connect();
    return () => {
      isClosed = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [url]);

  return { frame, state, device, isConnected };
}

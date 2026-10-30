import type { DeviceState, DeviceStatus } from "@led-matrix/core";
import type { ApiClient } from "@led-matrix/ui/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentState, LocalDevice, LogEntry, RecordingState } from "../../shared/api.ts";
import { getErrorMessage } from "./errors.ts";

const UPDATE_INTERVAL = 1000;

export type UsbState = {
  path: string | null;
  bytesPerSecond: number;
  droppedFrames: number;
};

export type DeviceInfo = {
  state: DeviceState;
  usb: UsbState | null;
  content: ContentState | null;
  recording: RecordingState | null;
  log: LogEntry[] | null;
};

export type DeviceSource = {
  getDevice(): Promise<DeviceInfo>;
  setBrightness(brightness: number): Promise<DeviceInfo>;
  setRecording?(isRecording: boolean): Promise<DeviceInfo>;
};

export type Device = {
  info: DeviceInfo | undefined;
  fps: number | undefined;
  error: string | undefined;
  setBrightness: (brightness: number) => Promise<void>;
  setRecording: (isRecording: boolean) => Promise<void>;
};

type FpsSample = { status: DeviceStatus | null; fps: number | undefined };

function getServerInfo(state: DeviceState): DeviceInfo {
  return { state, usb: null, content: null, recording: null, log: null };
}

export function getServerDeviceSource(api: ApiClient): DeviceSource {
  return {
    getDevice: () => api.getDevice().then(getServerInfo),
    setBrightness: (brightness) => api.setBrightness(brightness).then(getServerInfo),
  };
}

function getLocalInfo(local: LocalDevice | undefined): DeviceInfo {
  if (!local) {
    throw new Error("Local output is not running");
  }
  const { path, bytesPerSecond, droppedFrames, ...state } = local.device;
  return {
    state,
    usb: { path, bytesPerSecond, droppedFrames },
    content: local.content,
    recording: local.recording,
    log: local.log,
  };
}

export const localDeviceSource: DeviceSource = {
  getDevice: () => window.api.getLocalDevice().then(getLocalInfo),
  setBrightness: (brightness) => window.api.setLocalBrightness(brightness).then(getLocalInfo),
  setRecording: (isRecording) => window.api.setLocalRecording(isRecording).then(getLocalInfo),
};

function getFps(previous: DeviceStatus | null, current: DeviceStatus | null): number | undefined {
  if (!previous || !current) {
    return undefined;
  }
  const elapsedMs = current.uptimeMs - previous.uptimeMs;
  const frames = current.framesShown - previous.framesShown;
  return elapsedMs > 0 && frames >= 0 ? (frames * 1000) / elapsedMs : undefined;
}

export function useDevice(source: DeviceSource): Device {
  const [info, setInfo] = useState<DeviceInfo>();
  const [fps, setFps] = useState<number>();
  const [error, setError] = useState<string>();
  const fpsSampleRef = useRef<FpsSample>({ status: null, fps: undefined });

  const setDevice = useCallback((next: DeviceInfo | undefined) => {
    const status = next?.state.status ?? null;
    const sample = fpsSampleRef.current;
    if (status?.uptimeMs !== sample.status?.uptimeMs) {
      fpsSampleRef.current = { status, fps: getFps(sample.status, status) };
    }
    setInfo(next);
    setFps(fpsSampleRef.current.fps);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    fpsSampleRef.current = { status: null, fps: undefined };
    const update = () =>
      source.getDevice().then(
        (device) => {
          if (isCurrent) {
            setDevice(device);
            setError(undefined);
          }
        },
        (cause: unknown) => {
          if (isCurrent) {
            setDevice(undefined);
            setError(getErrorMessage(cause));
          }
        },
      );
    void update();
    const interval = setInterval(() => void update(), UPDATE_INTERVAL);
    return () => {
      isCurrent = false;
      clearInterval(interval);
    };
  }, [source, setDevice]);

  const setResult = useCallback(
    (result: Promise<DeviceInfo>) =>
      result.then(
        (device) => {
          setDevice(device);
          setError(undefined);
        },
        (cause: unknown) => setError(getErrorMessage(cause)),
      ),
    [setDevice],
  );

  const setBrightness = useCallback(
    (brightness: number) => setResult(source.setBrightness(brightness)),
    [source, setResult],
  );

  const setRecording = useCallback(
    async (isRecording: boolean) => {
      if (source.setRecording) {
        await setResult(source.setRecording(isRecording));
      }
    },
    [source, setResult],
  );

  return { info, fps, error, setBrightness, setRecording };
}

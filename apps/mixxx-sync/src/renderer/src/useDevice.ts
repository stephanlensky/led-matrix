import type { DeviceState } from "@led-matrix/core";
import type { ApiClient } from "@led-matrix/ui/lib/api";
import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "./errors.ts";

const UPDATE_INTERVAL = 1000;

export type Device = {
  state: DeviceState | undefined;
  error: string | undefined;
  setBrightness: (brightness: number) => Promise<void>;
};

export function useDevice(api: ApiClient): Device {
  const [state, setState] = useState<DeviceState>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isCurrent = true;
    const update = () =>
      api.getDevice().then(
        (device) => {
          if (isCurrent) {
            setState(device);
            setError(undefined);
          }
        },
        (cause: unknown) => {
          if (isCurrent) {
            setState(undefined);
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
  }, [api]);

  const setBrightness = useCallback(
    (brightness: number) =>
      api.setBrightness(brightness).then(
        (device) => {
          setState(device);
          setError(undefined);
        },
        (cause: unknown) => setError(getErrorMessage(cause)),
      ),
    [api],
  );

  return { state, error, setBrightness };
}

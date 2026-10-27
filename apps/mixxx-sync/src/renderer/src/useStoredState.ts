import { useCallback, useState } from "react";

export function useStoredState<T>(
  key: string,
  defaultValue: T,
  parse: (value: unknown) => T | undefined,
): [T, (value: T | undefined) => void] {
  const [value, setValue] = useState(() => parse(window.api.getUiState(key)) ?? defaultValue);
  const set = useCallback(
    (next: T | undefined) => {
      setValue(next ?? defaultValue);
      window.api.setUiState(key, next);
    },
    [key, defaultValue],
  );
  return [value, set];
}

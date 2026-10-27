import { useEffect, useState } from "react";
import type { Settings } from "../../shared/api.ts";

export function useSettings(): Settings | undefined {
  const [settings, setSettings] = useState<Settings>();
  useEffect(() => {
    const unsubscribe = window.api.onSettings(setSettings);
    void window.api.getSettings().then(setSettings);
    return unsubscribe;
  }, []);
  return settings;
}

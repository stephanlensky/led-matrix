import { useEffect, useState } from "react";
import { type DaemonStatus, LOG_LIMIT, type LogEntry } from "../../shared/api.ts";

export function useDaemonStatus(): DaemonStatus | undefined {
  const [status, setStatus] = useState<DaemonStatus>();
  useEffect(() => {
    const unsubscribe = window.api.onStatus(setStatus);
    void window.api.getStatus().then(setStatus);
    return unsubscribe;
  }, []);
  return status;
}

export function useLog(): LogEntry[] {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  useEffect(() => {
    let received: LogEntry[] = [];
    const unsubscribe = window.api.onLog((entry) => {
      received = [...received, entry];
      setEntries((current) => [...current, entry].slice(-LOG_LIMIT));
    });
    void window.api.getLog().then((stored) => {
      const lastId = stored.at(-1)?.id ?? 0;
      setEntries([...stored, ...received.filter(({ id }) => id > lastId)].slice(-LOG_LIMIT));
    });
    return unsubscribe;
  }, []);
  return entries;
}

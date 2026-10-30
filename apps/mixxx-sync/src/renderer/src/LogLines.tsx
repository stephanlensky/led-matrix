import type { LogEntry } from "../../shared/api.ts";

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function LogLines({ entries }: { entries: readonly LogEntry[] }) {
  return (
    <>
      {entries.map(({ id, time, message }) => (
        <div key={id} className="flex gap-3">
          <span className="shrink-0 text-muted-foreground">{timeFormat.format(time)}</span>
          <span className="break-all">{message}</span>
        </div>
      ))}
    </>
  );
}

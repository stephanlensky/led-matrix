import { cn } from "@led-matrix/ui/lib/utils";
import { type PointerEvent, useCallback, useState } from "react";
import { useStoredState } from "./useStoredState.ts";

export type StoredSize = {
  value: number;
  min: number;
  max: number;
  set: (value: number) => void;
  reset: () => void;
};

function getPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function useStoredSize(
  key: string,
  defaultValue: number,
  min: number,
  max: number,
): StoredSize {
  const [value, setValue] = useStoredState(key, defaultValue, getPositiveNumber);
  const set = useCallback(
    (next: number) => setValue(Math.round(Math.min(max, Math.max(min, next)))),
    [setValue, min, max],
  );
  const reset = useCallback(() => setValue(undefined), [setValue]);
  return { value, min, max, set, reset };
}

type Drag = { pointerId: number; start: number; value: number; max: number };

export function ResizeHandle({
  axis,
  direction,
  size,
  getMax,
  className,
}: {
  axis: "x" | "y";
  direction: 1 | -1;
  size: StoredSize;
  getMax?: () => number;
  className?: string;
}) {
  const [drag, setDrag] = useState<Drag>();
  const getPosition = (event: PointerEvent<HTMLElement>) =>
    axis === "x" ? event.clientX : event.clientY;

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-valuenow={size.value}
      aria-valuemin={size.min}
      aria-valuemax={size.max}
      data-dragging={drag ? "" : undefined}
      className={cn(
        "absolute z-10 touch-none transition-colors select-none hover:bg-ring/60 data-dragging:bg-ring",
        axis === "x" ? "inset-y-0 w-1.5 cursor-col-resize" : "inset-x-0 h-1.5 cursor-row-resize",
        className,
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({
          pointerId: event.pointerId,
          start: getPosition(event),
          value: size.value,
          max: Math.min(size.max, getMax?.() ?? size.max),
        });
      }}
      onPointerMove={(event) => {
        if (drag?.pointerId === event.pointerId) {
          const next = drag.value + direction * (getPosition(event) - drag.start);
          size.set(Math.min(drag.max, next));
        }
      }}
      onPointerUp={() => setDrag(undefined)}
      onPointerCancel={() => setDrag(undefined)}
      onDoubleClick={size.reset}
    />
  );
}

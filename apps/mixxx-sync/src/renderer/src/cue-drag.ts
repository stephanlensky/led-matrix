import type { DragEvent } from "react";
import { z } from "zod";

export const CUE_DRAG_TYPE = "application/x-led-matrix-cue";

const cueDragSchema = z.object({
  animationId: z.string(),
  section: z.int().min(0).optional(),
});

export type CueDrag = z.infer<typeof cueDragSchema>;

let currentDrag: CueDrag | undefined;

export function setCueDrag(event: DragEvent<HTMLElement>, drag: CueDrag): void {
  currentDrag = drag;
  event.dataTransfer.setData(CUE_DRAG_TYPE, JSON.stringify(drag));
  event.dataTransfer.effectAllowed = "copy";
}

export function getCurrentCueDrag(): CueDrag | undefined {
  return currentDrag;
}

export function hasCueDrag(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes(CUE_DRAG_TYPE);
}

export function getCueDrag(event: DragEvent<HTMLElement>): CueDrag | undefined {
  try {
    const result = cueDragSchema.safeParse(JSON.parse(event.dataTransfer.getData(CUE_DRAG_TYPE)));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

import type { Frame } from "@led-matrix/core";
import { type ReactNode, useRef } from "react";
import { Panel, usePanelPitch } from "./Panel.tsx";

const FRAME_INSET = 26;
const FOOTER_HEIGHT = 44;

type MatrixFrameProps = {
  frame: Frame;
  showGrid: boolean;
  footer?: ReactNode;
};

export function MatrixFrame({ frame, showGrid, footer }: MatrixFrameProps) {
  const containerRef = useRef<HTMLElement>(null);
  const pitch = usePanelPitch(
    containerRef,
    FRAME_INSET,
    FRAME_INSET + (footer ? FOOTER_HEIGHT : 0),
  );

  return (
    <section ref={containerRef} className="relative min-h-[50svh] min-w-0">
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border bg-neutral-900 p-3">
            <Panel frame={frame} pitch={pitch} showGrid={showGrid} />
          </div>
          {footer}
        </div>
      </div>
    </section>
  );
}

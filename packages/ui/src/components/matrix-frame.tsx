import type { Frame } from "@led-matrix/core";
import { type ReactNode, useRef } from "react";
import { cn } from "cn";
import { Panel, usePanelPitch } from "./panel.tsx";

const FRAME_INSET = 26;
const FOOTER_GAP = 12;

type MatrixFrameProps = {
  frame: Frame;
  showGrid: boolean;
  footer?: ReactNode;
  footerHeight?: number;
  overlay?: ReactNode;
  className?: string;
};

export function MatrixFrame({
  frame,
  showGrid,
  footer,
  footerHeight = 0,
  overlay,
  className,
}: MatrixFrameProps) {
  const containerRef = useRef<HTMLElement>(null);
  const pitch = usePanelPitch(
    containerRef,
    FRAME_INSET,
    FRAME_INSET + (footer ? footerHeight + FOOTER_GAP : 0),
  );

  return (
    <section ref={containerRef} className={cn("relative min-h-[50svh] min-w-0", className)}>
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col gap-3">
          <div className="relative rounded-xl border bg-neutral-900 p-3">
            <Panel frame={frame} pitch={pitch} showGrid={showGrid} />
            {overlay && <div className="absolute top-5 right-5">{overlay}</div>}
          </div>
          {footer}
        </div>
      </div>
    </section>
  );
}

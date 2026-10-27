import { type PointerEvent, type RefObject, useRef } from "react";

type Drag = { pointerId: number; startX: number; startScrollLeft: number };

function getScale(bar: HTMLElement, element: HTMLElement): number {
  const width = bar.getBoundingClientRect().width;
  return width > 0 ? element.scrollWidth / width : 0;
}

export function TrackScrollbar({
  scrollRef,
  thumbRef,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  thumbRef: RefObject<HTMLDivElement | null>;
}) {
  const dragRef = useRef<Drag>(undefined);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const element = scrollRef.current;
    if (event.button !== 0 || !element) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const bar = event.currentTarget;
    const isThumb = event.target instanceof Node && thumbRef.current?.contains(event.target);
    if (!isThumb) {
      const x = event.clientX - bar.getBoundingClientRect().left;
      element.scrollLeft = x * getScale(bar, element) - element.clientWidth / 2;
    }
    bar.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: element.scrollLeft,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const element = scrollRef.current;
    if (!drag || !element || event.pointerId !== drag.pointerId) {
      return;
    }
    element.scrollLeft =
      drag.startScrollLeft + (event.clientX - drag.startX) * getScale(event.currentTarget, element);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerId === dragRef.current?.pointerId) {
      dragRef.current = undefined;
    }
  }

  return (
    <div
      className="group relative h-2.5 cursor-default"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-muted/60" />
      <div
        ref={thumbRef}
        className="absolute inset-y-0.5 rounded-full bg-muted-foreground/50 group-hover:bg-muted-foreground/80"
      />
    </div>
  );
}

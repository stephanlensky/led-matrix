import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FULL_RANGE, type TrackRange, getRenderRange } from "../../shared/track-scale.ts";
import { type Player, usePlayerState } from "./player.ts";

export const MAX_ZOOM = 64;
const ZOOM_SPEED = 0.002;

export type TrackView = { zoom: number; start: number };

export type TrackViews = Map<number, TrackView>;

export type TrackZoom = {
  zoom: number;
  range: TrackRange;
  setZoom: (zoom: number) => void;
};

const DEFAULT_VIEW: TrackView = { zoom: 1, start: 0 };

function getClamped(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function createTrackViews(): TrackViews {
  return new Map();
}

export function useTrackZoom(
  scrollRef: RefObject<HTMLElement | null>,
  thumbRef: RefObject<HTMLElement | null>,
  views: TrackViews,
  trackId: number,
): TrackZoom {
  const [initialView] = useState(() => views.get(trackId) ?? DEFAULT_VIEW);
  const [zoom, setZoom] = useState(initialView.zoom);
  const [range, setRange] = useState(FULL_RANGE);
  const viewRef = useRef({ ...initialView, isPending: true });

  function setView(view: TrackView) {
    if (view.zoom > 1) {
      views.set(trackId, view);
    } else {
      views.delete(trackId);
    }
  }

  function update() {
    const element = scrollRef.current;
    if (!element || element.scrollWidth === 0) {
      return;
    }
    const start = element.scrollLeft / element.scrollWidth;
    const size = element.clientWidth / element.scrollWidth;
    const next = getRenderRange(start, size);
    setRange((current) =>
      current.start === next.start && current.end === next.end ? current : next,
    );
    const thumb = thumbRef.current;
    if (thumb) {
      thumb.style.left = `${start * 100}%`;
      thumb.style.width = `${size * 100}%`;
    }
  }

  function setZoomAt(value: number, x: number) {
    const view = viewRef.current;
    const nextZoom = getClamped(value, 1, MAX_ZOOM);
    if (nextZoom === view.zoom) {
      return;
    }
    const position = view.start + x / view.zoom;
    viewRef.current = {
      zoom: nextZoom,
      start: getClamped(position - x / nextZoom, 0, 1 - 1 / nextZoom),
      isPending: true,
    };
    setView(viewRef.current);
    setZoom(nextZoom);
  }

  const handlersRef = useRef({ update, setView, setZoomAt });
  useEffect(() => {
    handlersRef.current = { update, setView, setZoomAt };
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        return;
      }
      event.preventDefault();
      const width = element.clientWidth;
      if (width === 0) {
        return;
      }
      const x = (event.clientX - element.getBoundingClientRect().left) / width;
      handlersRef.current.setZoomAt(viewRef.current.zoom * Math.exp(-event.deltaY * ZOOM_SPEED), x);
    };
    const handleScroll = () => {
      const view = viewRef.current;
      if (!view.isPending && element.scrollWidth > 0) {
        view.start = element.scrollLeft / element.scrollWidth;
        handlersRef.current.setView(view);
      }
      handlersRef.current.update();
    };
    const observer = new ResizeObserver(() => handlersRef.current.update());
    observer.observe(element);
    element.addEventListener("wheel", handleWheel, { passive: false });
    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", handleWheel);
      element.removeEventListener("scroll", handleScroll);
    };
  }, [scrollRef]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const view = viewRef.current;
    if (element && view.isPending && view.zoom === zoom) {
      element.scrollLeft = view.start * element.scrollWidth;
      view.isPending = false;
    }
    handlersRef.current.update();
  }, [scrollRef, zoom]);

  return { zoom, range, setZoom: (value: number) => setZoomAt(value, 0.5) };
}

export function usePlayheadFollow(
  scrollRef: RefObject<HTMLElement | null>,
  player: Player,
  trackId: number,
  duration: number,
) {
  const { track, isPlaying } = usePlayerState(player);
  const isFollowing = isPlaying && track?.id === trackId && duration > 0;

  useEffect(() => {
    if (!isFollowing) {
      return undefined;
    }
    let request = 0;
    let wasVisible = false;
    const update = () => {
      request = requestAnimationFrame(update);
      const element = scrollRef.current;
      if (!element || element.scrollWidth <= element.clientWidth) {
        wasVisible = false;
        return;
      }
      const x = (player.getTime() / duration) * element.scrollWidth;
      const right = element.scrollLeft + element.clientWidth;
      if (wasVisible && x > right) {
        element.scrollLeft = x;
      }
      wasVisible = x >= element.scrollLeft && x <= element.scrollLeft + element.clientWidth;
    };
    request = requestAnimationFrame(update);
    return () => cancelAnimationFrame(request);
  }, [scrollRef, player, duration, isFollowing]);
}

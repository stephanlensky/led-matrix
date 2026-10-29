import {
  type Frame,
  type ParameterSelection,
  type StoredAnimation,
  createFrame,
  getParameterAnimation,
  getSectionPosition,
} from "@led-matrix/core";
import { Button } from "@led-matrix/ui/components/button";
import { MatrixFrame } from "@led-matrix/ui/components/matrix-frame";
import { useBrowserClips } from "@led-matrix/ui/lib/clips";
import { useStream } from "@led-matrix/ui/lib/stream";
import { PauseIcon, PlayIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAnimationLane, getLanePosition } from "../../shared/animation-lane.ts";
import type { LivePosition } from "../../shared/api.ts";
import { type Beats, getBeat, getPosition } from "../../shared/beats.ts";
import type { Track } from "../../shared/library.ts";
import type { Cue, MappingFile } from "../../shared/mapping.ts";
import { getFraction } from "../../shared/track-scale.ts";
import type { AnimationSource } from "./AnimationLane.tsx";
import { type Player, type PlayerState, usePlayerState } from "./player.ts";
import { type TrackDataCache, useLoad } from "./useLibrary.ts";

const blankFrame = createFrame();
const FRAME_CLASS = "h-full min-h-0";
export const DEFAULT_BPM = 120;

export type LiveSource = { type: "server"; url: string } | { type: "local" };

export type AnimationPreview = {
  animationId: string;
  section: number | undefined;
  params: ParameterSelection | undefined;
};

export function getTrackCues(
  { track }: PlayerState,
  mapping: MappingFile | undefined,
): Cue[] | undefined {
  return track && mapping?.tracks[track.location];
}

export function isTrackActive(state: PlayerState, mapping: MappingFile | undefined): boolean {
  const cues = getTrackCues(state, mapping);
  return state.isPlaying && cues !== undefined && cues.length > 0;
}

export function PlayButton({ player, track }: { player: Player; track: Track }) {
  const { track: current, isPlaying, error } = usePlayerState(player);
  const isCurrent = current?.id === track.id;
  const isTrackPlaying = isCurrent && isPlaying;
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={isTrackPlaying ? "Pause" : "Play"}
      title={isCurrent ? error : undefined}
      className={isCurrent && error ? "text-destructive" : undefined}
      onClick={() => player.toggle(track)}
    >
      {isTrackPlaying ? <PauseIcon /> : <PlayIcon />}
    </Button>
  );
}

export function Playhead({ player, duration }: { player: Player; duration: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let request = 0;
    const update = () => {
      if (ref.current) {
        ref.current.style.left = `${getFraction(player.getTime(), duration) * 100}%`;
      }
      request = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(request);
  }, [player, duration]);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_3px_black]"
    />
  );
}

function getLiveBeat(position: LivePosition, time: number): number {
  return position.isPlaying
    ? position.beat + ((time - position.time) * position.bpm) / 60_000
    : position.beat;
}

export function LivePlayhead({
  location,
  beats,
  duration,
}: {
  location: string;
  beats: Beats;
  duration: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let position: LivePosition | undefined;
    const unsubscribe = window.api.onPosition((next) => {
      position = next;
    });
    let request = 0;
    const update = () => {
      request = requestAnimationFrame(update);
      const element = ref.current;
      if (!element) {
        return;
      }
      element.hidden = position?.location !== location;
      if (position?.location === location) {
        const seconds = getPosition(beats, getLiveBeat(position, Date.now()));
        element.style.left = `${getFraction(seconds, duration) * 100}%`;
      }
    };
    update();
    return () => {
      cancelAnimationFrame(request);
      unsubscribe();
    };
  }, [location, beats, duration]);

  return (
    <div
      ref={ref}
      hidden
      className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-emerald-400 shadow-[0_0_3px_black]"
    />
  );
}

function TrackSimulator({
  track,
  cues,
  player,
  cache,
  source,
}: {
  track: Track;
  cues: readonly Cue[] | undefined;
  player: Player;
  cache: TrackDataCache;
  source: AnimationSource;
}) {
  const { subscribe } = useBrowserClips();
  const load = useCallback(() => cache.get(track.id), [cache, track.id]);
  const data = useLoad(load);
  const beats = data.status === "loaded" ? data.value.details?.beats : undefined;
  const { animationsById, renderer, fps } = source;
  const blocks = useMemo(
    () =>
      beats && cues && animationsById
        ? getAnimationLane(cues, animationsById, beats, track.duration, fps).blocks
        : [],
    [beats, cues, animationsById, track.duration, fps],
  );
  const [frame, setFrame] = useState<Frame>(blankFrame);

  useEffect(() => {
    const frameDuration = 1000 / fps;
    let request = 0;
    let lastKey: string | undefined;
    const blankKey = "blank";
    const update = () => {
      request = requestAnimationFrame(update);
      const lanePosition = beats && getLanePosition(blocks, getBeat(beats, player.getTime()), fps);
      if (!lanePosition) {
        if (lastKey !== blankKey) {
          lastKey = blankKey;
          setFrame(blankFrame);
        }
        return;
      }
      const { block, position } = lanePosition;
      const frameTime = Math.floor(position.time / frameDuration) * frameDuration;
      const key = `${block.beat}:${position.index}:${position.cycle}:${frameTime}`;
      if (key !== lastKey) {
        lastKey = key;
        setFrame(
          renderer.render(block.animation, frameTime, block.bpm, position.index, position.cycle),
        );
      }
    };
    request = requestAnimationFrame(update);
    const unsubscribe = subscribe(() => {
      lastKey = undefined;
    });
    return () => {
      cancelAnimationFrame(request);
      unsubscribe();
    };
  }, [beats, blocks, player, renderer, fps, subscribe]);

  return <MatrixFrame frame={frame} showGrid className={FRAME_CLASS} />;
}

function PreviewSimulator({
  animation,
  preview,
  bpm,
  source,
}: {
  animation: StoredAnimation;
  preview: AnimationPreview;
  bpm: number;
  source: AnimationSource;
}) {
  const { subscribe } = useBrowserClips();
  const { renderer, fps } = source;
  const [frame, setFrame] = useState<Frame>(blankFrame);

  useEffect(() => {
    const frameDuration = 1000 / fps;
    const current = { index: preview.section ?? 0, startedAt: performance.now() };
    let request = 0;
    let lastKey: string | undefined;
    const update = (now: number) => {
      request = requestAnimationFrame(update);
      const position = getSectionPosition(animation, { current, next: undefined }, now, bpm, fps);
      const frameTime = Math.floor(position.time / frameDuration) * frameDuration;
      const key = `${position.index}:${position.cycle}:${frameTime}`;
      if (key !== lastKey) {
        lastKey = key;
        setFrame(renderer.render(animation, frameTime, bpm, position.index, position.cycle));
      }
    };
    request = requestAnimationFrame(update);
    const unsubscribe = subscribe(() => {
      lastKey = undefined;
    });
    return () => {
      cancelAnimationFrame(request);
      unsubscribe();
    };
  }, [animation, preview, bpm, renderer, fps, subscribe]);

  return <MatrixFrame frame={frame} showGrid className={FRAME_CLASS} />;
}

function LiveSimulator({ streamUrl }: { streamUrl: string }) {
  const { frame } = useStream(streamUrl);
  return <MatrixFrame frame={frame} showGrid className={FRAME_CLASS} />;
}

function LocalLiveSimulator() {
  const [frame, setFrame] = useState<Frame>(blankFrame);
  useEffect(() => window.api.onLocalFrame(setFrame), []);
  return <MatrixFrame frame={frame} showGrid className={FRAME_CLASS} />;
}

export function PlaybackSimulator({
  player,
  mapping,
  cache,
  source,
  preview,
  live,
  onPreviewChange,
  onLiveViewEnd,
}: {
  player: Player;
  mapping: MappingFile | undefined;
  cache: TrackDataCache;
  source: AnimationSource;
  preview: AnimationPreview | undefined;
  live: LiveSource | undefined;
  onPreviewChange: (preview: AnimationPreview | undefined) => void;
  onLiveViewEnd: () => void;
}) {
  const state = usePlayerState(player);
  const { track, isPlaying } = state;
  const cues = getTrackCues(state, mapping);
  const isActive = isTrackActive(state, mapping);
  const previewSource = preview && source.animationsById?.get(preview.animationId);
  const previewParams = preview?.params;
  const previewAnimation = useMemo(
    () => previewSource && getParameterAnimation(previewSource, previewParams),
    [previewSource, previewParams],
  );

  useEffect(() => {
    if (isActive) {
      onPreviewChange(undefined);
    }
  }, [isActive, onPreviewChange]);

  useEffect(() => {
    if (isPlaying) {
      onLiveViewEnd();
    }
  }, [isPlaying, onLiveViewEnd]);

  if (live?.type === "local") {
    return <LocalLiveSimulator />;
  }
  if (live?.type === "server") {
    return <LiveSimulator streamUrl={live.url} />;
  }
  if (preview && previewAnimation && !isActive) {
    return (
      <PreviewSimulator
        animation={previewAnimation}
        preview={preview}
        bpm={track?.bpm || DEFAULT_BPM}
        source={source}
      />
    );
  }
  if (!track) {
    return <MatrixFrame frame={blankFrame} showGrid className={FRAME_CLASS} />;
  }
  return (
    <TrackSimulator
      key={track.id}
      track={track}
      cues={cues}
      player={player}
      cache={cache}
      source={source}
    />
  );
}

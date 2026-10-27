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
import { getBeat } from "../../shared/beats.ts";
import type { Track } from "../../shared/library.ts";
import type { Cue, MappingFile } from "../../shared/mapping.ts";
import { getFraction } from "../../shared/track-scale.ts";
import type { AnimationSource } from "./AnimationLane.tsx";
import { type Player, usePlayerState } from "./player.ts";
import { type TrackDataCache, useLoad } from "./useLibrary.ts";

const blankFrame = createFrame();
const FRAME_CLASS = "h-full min-h-0";
const DEFAULT_BPM = 120;

export type AnimationPreview = {
  animationId: string;
  section: number | undefined;
  params: ParameterSelection | undefined;
};

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
      const key = `${block.beat}:${position.index}:${frameTime}`;
      if (key !== lastKey) {
        lastKey = key;
        setFrame(renderer.render(block.animation, frameTime, block.bpm, position.index));
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
      const key = `${position.index}:${frameTime}`;
      if (key !== lastKey) {
        lastKey = key;
        setFrame(renderer.render(animation, frameTime, bpm, position.index));
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

export function PlaybackSimulator({
  player,
  mapping,
  cache,
  source,
  preview,
  liveStreamUrl,
  onPreviewChange,
  onLiveViewEnd,
}: {
  player: Player;
  mapping: MappingFile | undefined;
  cache: TrackDataCache;
  source: AnimationSource;
  preview: AnimationPreview | undefined;
  liveStreamUrl: string | undefined;
  onPreviewChange: (preview: AnimationPreview | undefined) => void;
  onLiveViewEnd: () => void;
}) {
  const { track, isPlaying } = usePlayerState(player);
  const cues = track && mapping?.tracks[track.location];
  const isTrackActive = isPlaying && cues !== undefined && cues.length > 0;
  const previewSource = preview && source.animationsById?.get(preview.animationId);
  const previewParams = preview?.params;
  const previewAnimation = useMemo(
    () => previewSource && getParameterAnimation(previewSource, previewParams),
    [previewSource, previewParams],
  );

  useEffect(() => {
    if (isTrackActive) {
      onPreviewChange(undefined);
    }
  }, [isTrackActive, onPreviewChange]);

  useEffect(() => {
    if (isPlaying) {
      onLiveViewEnd();
    }
  }, [isPlaying, onLiveViewEnd]);

  if (liveStreamUrl !== undefined) {
    return <LiveSimulator streamUrl={liveStreamUrl} />;
  }
  if (preview && previewAnimation && !isTrackActive) {
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

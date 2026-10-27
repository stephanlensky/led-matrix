import { type Frame, createFrame } from "@led-matrix/core";
import { Button } from "@led-matrix/ui/components/button";
import { MatrixFrame } from "@led-matrix/ui/components/matrix-frame";
import { useClipsVersion } from "@led-matrix/ui/lib/clips";
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
  const clipsVersion = useClipsVersion();
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
    return () => cancelAnimationFrame(request);
  }, [beats, blocks, player, renderer, fps, clipsVersion]);

  return <MatrixFrame frame={frame} showGrid />;
}

export function PlaybackSimulator({
  player,
  mapping,
  cache,
  source,
}: {
  player: Player;
  mapping: MappingFile | undefined;
  cache: TrackDataCache;
  source: AnimationSource;
}) {
  const { track } = usePlayerState(player);
  if (!track) {
    return <MatrixFrame frame={blankFrame} showGrid />;
  }
  return (
    <TrackSimulator
      key={track.id}
      track={track}
      cues={mapping?.tracks[track.location]}
      player={player}
      cache={cache}
      source={source}
    />
  );
}

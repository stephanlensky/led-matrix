import {
  type Animation,
  type Frame,
  type SectionPlayback,
  createFrame,
  createRenderer,
  getCurrentPlayback,
  getNextSection,
  getSectionCursor,
  getSectionPosition,
} from "@led-matrix/core";
import { Grid3x3Icon, PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { browserCanvas } from "./browserCanvas.ts";
import { browserClips, subscribeClips } from "./clipLibrary.ts";
import { MatrixFrame } from "./MatrixFrame.tsx";
import { Timeline, type TimelinePosition } from "./Timeline.tsx";
import { Button } from "@/components/ui/button";

type PreviewProps = {
  animation: Animation | undefined;
  section?: number;
  bpm: number;
  fps: number;
  showGrid: boolean;
  onShowGridChange: (showGrid: boolean) => void;
};

const INITIAL_PLAYBACK: SectionPlayback = {
  current: { index: 0, startedAt: 0 },
  next: undefined,
};

export function Preview({
  animation,
  section = 0,
  bpm,
  fps,
  showGrid,
  onShowGridChange,
}: PreviewProps) {
  const [frame, setFrame] = useState<Frame>(createFrame);
  const [position, setPosition] = useState<TimelinePosition>({
    index: 0,
    progress: 0,
    nextIndex: undefined,
  });
  const [isPlaying, setIsPlaying] = useState(true);
  const [renderer] = useState(() =>
    createRenderer({ fps, canvas: browserCanvas, clips: browserClips }),
  );
  const clockRef = useRef(0);
  const playbackRef = useRef(INITIAL_PLAYBACK);
  const isPlayingRef = useRef(isPlaying);
  const animationRef = useRef(animation);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    animationRef.current = animation;
  }, [isPlaying, animation]);

  useEffect(() => {
    const frameDuration = 1000 / fps;
    let lastRendered: { animation: Animation; index: number; frameTime: number } | undefined;
    let lastTime = performance.now();
    let requestId = 0;
    const unsubscribe = subscribeClips(() => {
      lastRendered = undefined;
    });

    function tick(now: number) {
      const current = animationRef.current;
      if (isPlayingRef.current) {
        clockRef.current += now - lastTime;
      }
      lastTime = now;
      if (current) {
        const playback = getCurrentPlayback(playbackRef.current, clockRef.current);
        playbackRef.current = playback;
        const { index, time, length } = getSectionPosition(
          current,
          playback,
          clockRef.current,
          bpm,
          fps,
        );
        const frameTime = Math.floor(time / frameDuration) * frameDuration;
        if (
          lastRendered?.animation !== current ||
          lastRendered.index !== index ||
          lastRendered.frameTime !== frameTime
        ) {
          lastRendered = { animation: current, index, frameTime };
          setFrame(renderer.render(current, frameTime, bpm, index));
        }
        const progress = time / length;
        const nextIndex = playback.next?.index;
        setPosition((previous) =>
          previous.index === index &&
          previous.progress === progress &&
          previous.nextIndex === nextIndex
            ? previous
            : { index, progress, nextIndex },
        );
      }
      requestId = requestAnimationFrame(tick);
    }

    requestId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(requestId);
      unsubscribe();
    };
  }, [renderer, bpm, fps]);

  function seek(index: number, progress: number) {
    const current = animationRef.current;
    if (current?.sections[index]) {
      playbackRef.current = {
        current: getSectionCursor(current, index, progress, clockRef.current, bpm, fps),
        next: undefined,
      };
    }
  }

  function advance() {
    if (animation) {
      const playback = getCurrentPlayback(playbackRef.current, clockRef.current);
      playbackRef.current = {
        current: playback.current,
        next: getNextSection(animation, playback, clockRef.current, bpm, fps, "end"),
      };
    }
  }

  const seekRef = useRef(seek);
  useEffect(() => {
    seekRef.current = seek;
  });

  useEffect(() => {
    seekRef.current(section, 0);
  }, [section]);

  return (
    <MatrixFrame
      frame={frame}
      showGrid={showGrid}
      footer={
        <Timeline
          animation={animation}
          position={animation ? position : undefined}
          bpm={bpm}
          fps={fps}
          controls={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={isPlaying ? "Pause preview" : "Play preview"}
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </Button>
          }
          actions={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Pixel grid"
              aria-pressed={showGrid}
              className="aria-pressed:bg-muted"
              onClick={() => onShowGridChange(!showGrid)}
            >
              <Grid3x3Icon />
            </Button>
          }
          onSeek={seek}
          onAdvance={advance}
        />
      }
    />
  );
}

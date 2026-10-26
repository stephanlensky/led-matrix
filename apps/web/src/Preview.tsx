import {
  type Animation,
  type Frame,
  createFrame,
  createRenderer,
  getAnimationLength,
} from "@led-matrix/core";
import { Grid3x3Icon, PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { browserCanvas } from "./browserCanvas.ts";
import { browserClips, subscribeClips } from "./clipLibrary.ts";
import { MatrixFrame } from "./MatrixFrame.tsx";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type PreviewProps = {
  animation: Animation | undefined;
  bpm: number;
  fps: number;
  showGrid: boolean;
  onShowGridChange: (showGrid: boolean) => void;
};

function getPositionLabel(animation: Animation | undefined, progress: number, bpm: number): string {
  if (!animation) {
    return "";
  }
  const { mode } = animation;
  if (mode.type === "loop" && "beats" in mode) {
    return `${(progress * mode.beats).toFixed(1)} / ${mode.beats} beats`;
  }
  if (mode.type === "loop") {
    return `${Math.floor(progress * mode.frames)} / ${mode.frames} frames`;
  }
  const length = getAnimationLength(mode, bpm, 1) / 1000;
  return `${(progress * length).toFixed(1)} / ${length.toFixed(1)} s`;
}

export function Preview({ animation, bpm, fps, showGrid, onShowGridChange }: PreviewProps) {
  const [frame, setFrame] = useState<Frame>(createFrame);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [renderer] = useState(() =>
    createRenderer({ fps, canvas: browserCanvas, clips: browserClips }),
  );
  const elapsedRef = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  const animationRef = useRef(animation);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    animationRef.current = animation;
  }, [isPlaying, animation]);

  useEffect(() => {
    const frameDuration = 1000 / fps;
    let lastRendered: { animation: Animation; frameTime: number } | undefined;
    let lastTime = performance.now();
    let requestId = 0;
    const unsubscribe = subscribeClips(() => {
      lastRendered = undefined;
    });

    function tick(now: number) {
      const current = animationRef.current;
      if (isPlayingRef.current) {
        elapsedRef.current += now - lastTime;
      }
      lastTime = now;
      if (current) {
        const length = getAnimationLength(current.mode, bpm, fps);
        elapsedRef.current %= length;
        const frameTime = Math.floor(elapsedRef.current / frameDuration) * frameDuration;
        if (lastRendered?.animation !== current || lastRendered.frameTime !== frameTime) {
          lastRendered = { animation: current, frameTime };
          setFrame(renderer.render(current, frameTime, bpm));
          setProgress(frameTime / length);
        }
      }
      requestId = requestAnimationFrame(tick);
    }

    requestId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(requestId);
      unsubscribe();
    };
  }, [renderer, bpm, fps]);

  function seek(value: number) {
    if (animation) {
      elapsedRef.current = value * getAnimationLength(animation.mode, bpm, fps);
    }
  }

  return (
    <MatrixFrame
      frame={frame}
      showGrid={showGrid}
      footer={
        <div className="flex h-8 items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={isPlaying ? "Pause preview" : "Play preview"}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Slider
            aria-label="Preview position"
            min={0}
            max={1}
            step={0.001}
            value={progress}
            onValueChange={(value) => seek(Array.isArray(value) ? (value[0] ?? 0) : value)}
          />
          <span className="shrink-0 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {getPositionLabel(animation, progress, bpm)}
          </span>
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
        </div>
      }
    />
  );
}

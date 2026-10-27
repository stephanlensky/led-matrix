import {
  type Output,
  type PlaybackState,
  type SectionPlayback,
  type StoredAnimation,
  getFittedAnimation,
  getSectionPosition,
} from "@led-matrix/core";
import { PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import { Timeline, type TimelinePosition } from "@led-matrix/ui/components/timeline";
import { Button } from "@led-matrix/ui/components/button";

type LiveTimelineProps = {
  output: Output;
  state: PlaybackState | undefined;
  animations: readonly StoredAnimation[];
};

type SeekTarget = { index: number; progress: number };

function getPlayback(state: PlaybackState, receivedAt: number): SectionPlayback | undefined {
  const { section } = state;
  if (!section) {
    return undefined;
  }
  return {
    current: { index: section.index, startedAt: receivedAt - section.time },
    next: section.next
      ? { index: section.next.index, startedAt: receivedAt + section.next.delay }
      : undefined,
  };
}

export function LiveTimeline({ output, state, animations }: LiveTimelineProps) {
  const [position, setPosition] = useState<TimelinePosition>();
  const [error, setError] = useState<string>();
  const pendingSeek = useRef<SeekTarget>(undefined);
  const isSeeking = useRef(false);
  const animation = animations.find(({ id }) => id === state?.animationId);
  const isPaused = state?.paused ?? false;

  useEffect(() => {
    const receivedAt = performance.now();
    const playback = state && getPlayback(state, receivedAt);
    if (!animation || !state || !playback) {
      return undefined;
    }
    let requestId = 0;
    function tick(now: number) {
      if (animation && state && playback) {
        const time = state.paused ? receivedAt : now;
        const {
          index,
          time: sectionTime,
          length,
        } = getSectionPosition(
          getFittedAnimation(animation, state.fit),
          playback,
          time,
          state.bpm,
          state.fps,
        );
        const { next } = playback;
        const nextIndex = next && time < next.startedAt ? next.index : undefined;
        setPosition({ index, progress: sectionTime / length, nextIndex });
      }
      requestId = requestAnimationFrame(tick);
    }
    requestId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(requestId);
  }, [animation, state]);

  function run(action: () => Promise<unknown>) {
    return action()
      .then(() => setError(undefined))
      .catch((cause: unknown) => setError(String(cause)));
  }

  function sendSeeks() {
    const seek = pendingSeek.current;
    isSeeking.current = seek !== undefined;
    if (!seek) {
      return;
    }
    pendingSeek.current = undefined;
    void run(() => api.seek(output, seek.index, seek.progress)).then(sendSeeks);
  }

  function seekTo(index: number, progress: number) {
    pendingSeek.current = { index, progress };
    if (!isSeeking.current) {
      sendSeeks();
    }
  }

  return (
    <div className="relative">
      <Timeline
        animation={animation}
        position={animation ? position : undefined}
        bpm={state?.bpm ?? 120}
        fps={state?.fps ?? 30}
        controls={
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={isPaused ? "Resume" : "Pause"}
              disabled={!animation}
              onClick={() => void run(() => (isPaused ? api.resume(output) : api.pause(output)))}
            >
              {isPaused || !animation ? <PlayIcon /> : <PauseIcon />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Stop"
              disabled={!state?.animationId}
              onClick={() => void run(() => api.stop(output))}
            >
              <SquareIcon />
            </Button>
          </>
        }
        onSeek={seekTo}
        onAdvance={() => void run(() => api.advance(output))}
      />
      {error && <p className="absolute top-full text-xs text-destructive">{error}</p>}
    </div>
  );
}

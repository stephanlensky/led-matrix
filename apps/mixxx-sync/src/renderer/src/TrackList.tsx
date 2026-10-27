import { Button } from "@led-matrix/ui/components/button";
import { Input } from "@led-matrix/ui/components/input";
import { Label } from "@led-matrix/ui/components/label";
import { ListEmpty } from "@led-matrix/ui/components/list-row";
import { Slider } from "@led-matrix/ui/components/slider";
import { Switch } from "@led-matrix/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@led-matrix/ui/components/tooltip";
import { TruncatedText } from "@led-matrix/ui/components/truncated-text";
import { KeyboardIcon, RadioIcon, SearchIcon, ZoomInIcon } from "lucide-react";
import {
  Fragment,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { getPosition } from "../../shared/beats.ts";
import type { MixxxCue, Track } from "../../shared/library.ts";
import type { BeatSelection } from "../../shared/loop.ts";
import type { CueStatus } from "../../shared/api.ts";
import type { Cue, MappingFile } from "../../shared/mapping.ts";
import {
  getBpmLabel,
  getColorLabel,
  getDurationLabel,
  getFilteredTracks,
  getTrackNumberLabel,
} from "../../shared/track-list.ts";
import { type TrackRange, getFraction } from "../../shared/track-scale.ts";
import { type AnimationSource, type LaneEditor, AnimationLane } from "./AnimationLane.tsx";
import { PlayButton, Playhead } from "./Playback.tsx";
import { TrackScrollbar } from "./TrackScrollbar.tsx";
import { type Player, usePlayerState } from "./player.ts";
import { type LoadState, type TrackDataCache, useTrackData } from "./useLibrary.ts";
import {
  MAX_ZOOM,
  type TrackViews,
  createTrackViews,
  usePlayheadFollow,
  useTrackZoom,
} from "./useTrackZoom.ts";
import { WaveformLane } from "./WaveformLane.tsx";

const ROW_HEIGHT = 172;
const OVERSCAN = 4;
const NO_CUES: readonly MixxxCue[] = [];
const SHORTCUTS = [
  ["Space", "Play or pause"],
  ["← →", "Move the selected block by a beat"],
  ["Shift + ← →", "Move the selected block by a bar"],
  ["Delete", "Remove the selected block"],
  ["Escape", "Clear the selection or loop"],
  ["Ctrl + Z", "Undo"],
  ["Ctrl + Shift + Z", "Redo"],
  ["Ctrl + F", "Search"],
  ["Drag waveform", "Loop a selection"],
  ["Alt + drag", "Place or select without snapping"],
  ["Shift + drag block", "Duplicate the block"],
  ["Drop on a block", "Replace its animation"],
  ["Ctrl + scroll", "Zoom the track"],
  ["Shift + scroll", "Scroll the zoomed track"],
] as const;

export type LiveTrack = { location: string; cue: CueStatus | undefined };

function Lane({ className, children }: { className: string; children?: ReactNode }) {
  return (
    <div
      className={`flex items-center justify-center rounded-sm bg-muted/40 text-xs text-muted-foreground ${className}`}
    >
      {children}
    </div>
  );
}

type LaneProps = {
  cache: TrackDataCache;
  cues: readonly Cue[] | undefined;
  source: AnimationSource;
  editor: LaneEditor;
  liveCue: CueStatus | undefined;
};

type RowProps = LaneProps & {
  track: Track;
  player: Player;
  isLive: boolean;
  views: TrackViews;
};

function TrackLanes({
  track,
  range,
  player,
  selection,
  cache,
  cues,
  source,
  editor,
  liveCue,
}: LaneProps & {
  track: Track;
  range: TrackRange;
  player: Player;
  selection: BeatSelection | undefined;
}) {
  const data = useTrackData(cache, track.id);

  if (data.status === "error") {
    return (
      <Lane className="flex-1">
        <span className="text-destructive">{data.error}</span>
      </Lane>
    );
  }
  const { details, waveform } = data.status === "loaded" ? data.value : {};
  const isLoaded = data.status === "loaded";
  const beats = details?.beats;

  function setSelection(next: BeatSelection | undefined) {
    if (next && beats) {
      const loop = { start: getPosition(beats, next.start), end: getPosition(beats, next.end) };
      player.setLoop(track, loop, next);
    } else {
      player.clearLoop();
    }
  }

  return (
    <>
      {isLoaded ? (
        <WaveformLane
          trackId={track.id}
          cache={cache}
          range={range}
          duration={track.duration}
          waveform={waveform}
          beats={beats}
          cues={details?.cues ?? NO_CUES}
          selection={selection}
          onSelectionChange={setSelection}
        />
      ) : (
        <Lane className="mt-2 h-20" />
      )}
      {isLoaded ? (
        <AnimationLane
          range={range}
          duration={track.duration}
          beats={beats}
          cues={cues}
          mixxxCues={details?.cues ?? NO_CUES}
          location={track.location}
          source={source}
          editor={editor}
          liveCue={liveCue}
        />
      ) : (
        <Lane className="h-8" />
      )}
    </>
  );
}

function TrackRow({ track, player, isLive, views, ...props }: RowProps) {
  const { track: current, loop } = usePlayerState(player);
  const isCurrent = current?.id === track.id;
  const selection = loop?.trackId === track.id ? loop.beats : undefined;
  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const { zoom, range, setZoom } = useTrackZoom(scrollRef, thumbRef, views, track.id);
  usePlayheadFollow(scrollRef, player, track.id, track.duration);

  function seek(event: MouseEvent<HTMLDivElement>) {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    if (width > 0) {
      player.seek(track, getFraction((event.clientX - left) / width, 1) * track.duration);
    }
  }

  return (
    <div
      className={`flex h-full flex-col gap-1.5 border-b border-l-2 px-3 py-2 ${isLive ? "border-l-emerald-400 bg-emerald-400/5" : "border-l-transparent"}`}
      onPointerDownCapture={() => player.focus(track)}
      onWheelCapture={(event) => {
        if (event.ctrlKey || event.shiftKey || event.deltaX !== 0) {
          player.focus(track);
        }
      }}
    >
      <div className="flex h-5 items-center gap-3 text-sm">
        <PlayButton player={player} track={track} />
        <span className="w-8 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {getTrackNumberLabel(track)}
        </span>
        <span
          className="size-2.5 shrink-0 rounded-full border"
          style={
            track.color === undefined
              ? undefined
              : { backgroundColor: getColorLabel(track.color), borderColor: "transparent" }
          }
        />
        <TruncatedText className="max-w-[40%] font-medium">
          {track.title || track.location}
        </TruncatedText>
        {isLive && (
          <span className="shrink-0 rounded-sm bg-emerald-400/15 px-1 text-[10px] font-medium text-emerald-400 uppercase">
            Live
          </span>
        )}
        <TruncatedText className="max-w-[25%] text-muted-foreground">{track.artist}</TruncatedText>
        <TruncatedText className="flex-1 text-muted-foreground">{track.album}</TruncatedText>
        <div className="flex w-28 shrink-0 items-center gap-1.5 text-muted-foreground">
          <ZoomInIcon className="size-3.5 shrink-0" />
          <Slider
            aria-label="Zoom"
            min={0}
            max={Math.log2(MAX_ZOOM)}
            step={0.01}
            value={Math.log2(zoom)}
            onValueChange={(value) => setZoom(2 ** Number(value))}
          />
        </div>
        <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {getBpmLabel(track.bpm)}
        </span>
        <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {getDurationLabel(track.duration)}
        </span>
      </div>
      <div className="flex flex-1 flex-col pl-20">
        <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
          <div
            className="relative flex cursor-text flex-col gap-1"
            style={{ width: `${zoom * 100}%` }}
            onClick={seek}
          >
            <TrackLanes
              track={track}
              range={range}
              player={player}
              selection={selection}
              {...props}
            />
            {isCurrent && <Playhead player={player} duration={track.duration} />}
          </div>
        </div>
        <div className="mt-1 h-2.5">
          {zoom > 1 && <TrackScrollbar scrollRef={scrollRef} thumbRef={thumbRef} />}
        </div>
      </div>
    </div>
  );
}

function useViewport(scrollRef: RefObject<HTMLElement | null>) {
  const [viewport, setViewport] = useState({ top: 0, height: 0 });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return undefined;
    }
    const update = () => setViewport({ top: element.scrollTop, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [scrollRef]);

  return viewport;
}

function VirtualTrackList({
  scrollRef,
  tracks,
  mapping,
  cache,
  source,
  player,
  editor,
  live,
  views,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  tracks: readonly Track[];
  mapping: MappingFile | undefined;
  cache: TrackDataCache;
  source: AnimationSource;
  player: Player;
  editor: LaneEditor;
  live: LiveTrack | undefined;
  views: TrackViews;
}) {
  const { top, height } = useViewport(scrollRef);
  const start = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(tracks.length, Math.ceil((top + height) / ROW_HEIGHT) + OVERSCAN);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="relative w-full" style={{ height: tracks.length * ROW_HEIGHT }}>
        {tracks.slice(start, end).map((track, offset) => {
          const isLive = track.location === live?.location;
          return (
            <div
              key={track.id}
              className="absolute inset-x-0 top-0"
              style={{
                height: ROW_HEIGHT,
                transform: `translateY(${(start + offset) * ROW_HEIGHT}px)`,
              }}
            >
              <TrackRow
                track={track}
                cache={cache}
                cues={mapping?.tracks[track.location]}
                source={source}
                player={player}
                editor={editor}
                isLive={isLive}
                views={views}
                liveCue={isLive ? live?.cue : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShortcutsHint() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Keyboard shortcuts" />}
      >
        <KeyboardIcon />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-none">
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
          {SHORTCUTS.map(([keys, action]) => (
            <Fragment key={keys}>
              <dt className="font-mono">{keys}</dt>
              <dd>{action}</dd>
            </Fragment>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

export function TrackList({
  title,
  tracks,
  mapping,
  mappingError,
  cache,
  source,
  player,
  editor,
  live,
  isLiveView,
  onLiveViewChange,
  searchRef,
}: {
  title: string;
  tracks: LoadState<Track[]>;
  mapping: MappingFile | undefined;
  mappingError: string | undefined;
  cache: TrackDataCache;
  source: AnimationSource;
  player: Player;
  editor: LaneEditor;
  live: LiveTrack | undefined;
  isLiveView: boolean;
  onLiveViewChange: (isLiveView: boolean) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [views] = useState(createTrackViews);
  const [search, setSearch] = useState("");
  const [isMappedOnly, setIsMappedOnly] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const allTracks = tracks.status === "loaded" ? tracks.value : undefined;
  const filteredTracks = useMemo(
    () =>
      allTracks
        ? getFilteredTracks(allTracks, { search: deferredSearch, isMappedOnly }, mapping)
        : [],
    [allTracks, deferredSearch, isMappedOnly, mapping],
  );
  const liveIndex = live
    ? filteredTracks.findIndex(({ location }) => location === live.location)
    : -1;

  function scrollToLive() {
    const element = scrollRef.current;
    if (element && liveIndex !== -1) {
      element.scrollTo({
        top: liveIndex * ROW_HEIGHT - (element.clientHeight - ROW_HEIGHT) / 2,
        behavior: "smooth",
      });
    }
  }

  function getContent() {
    if (tracks.status === "error") {
      return (
        <ListEmpty>
          <span className="text-destructive">{tracks.error}</span>
          <br />
          Check the Mixxx database path in Settings.
        </ListEmpty>
      );
    }
    if (tracks.status === "loading") {
      return <ListEmpty>Loading tracks…</ListEmpty>;
    }
    if (filteredTracks.length === 0) {
      return <ListEmpty>No tracks</ListEmpty>;
    }
    return (
      <VirtualTrackList
        key={title}
        scrollRef={scrollRef}
        live={live}
        tracks={filteredTracks}
        mapping={mapping}
        cache={cache}
        source={source}
        player={player}
        editor={editor}
        views={views}
      />
    );
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-col gap-2 border-b p-3">
        <div className="flex items-center gap-4">
          <h2 className="min-w-0 flex-1 truncate font-medium">{title}</h2>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {allTracks ? `${filteredTracks.length} / ${allTracks.length}` : ""}
          </span>
          <div className="relative w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              aria-label="Search tracks"
              placeholder="Search title or artist"
              className="pl-8"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id={`${id}-mapped`} checked={isMappedOnly} onCheckedChange={setIsMappedOnly} />
            <Label htmlFor={`${id}-mapped`}>Mapped only</Label>
          </div>
          <Button
            variant={isLiveView ? "default" : "outline"}
            size="sm"
            aria-pressed={isLiveView}
            disabled={!live && !isLiveView}
            title={live ? live.location : "No live track"}
            onClick={() => {
              if (!isLiveView) {
                scrollToLive();
              }
              onLiveViewChange(!isLiveView);
            }}
          >
            <RadioIcon />
            Live
          </Button>
          <ShortcutsHint />
        </div>
        {mappingError && (
          <p className="text-xs whitespace-pre-line text-destructive">{mappingError}</p>
        )}
      </header>
      {getContent()}
    </section>
  );
}

import { Input } from "@led-matrix/ui/components/input";
import { Label } from "@led-matrix/ui/components/label";
import { ListEmpty } from "@led-matrix/ui/components/list-row";
import { Switch } from "@led-matrix/ui/components/switch";
import { TruncatedText } from "@led-matrix/ui/components/truncated-text";
import { SearchIcon } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MixxxCue, Track } from "../../shared/library.ts";
import type { Cue, MappingFile } from "../../shared/mapping.ts";
import {
  getBpmLabel,
  getColorLabel,
  getDurationLabel,
  getFilteredTracks,
  getTrackNumberLabel,
} from "../../shared/track-list.ts";
import { type AnimationSource, AnimationLane } from "./AnimationLane.tsx";
import { type LoadState, type TrackDataCache, useTrackData } from "./useLibrary.ts";
import { WaveformLane } from "./WaveformLane.tsx";

const ROW_HEIGHT = 112;
const OVERSCAN = 4;
const NO_CUES: readonly MixxxCue[] = [];

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
};

function TrackLanes({ track, cache, cues, source }: LaneProps & { track: Track }) {
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
  return (
    <>
      {isLoaded ? (
        <WaveformLane
          duration={track.duration}
          waveform={waveform}
          beats={details?.beats}
          cues={details?.cues ?? NO_CUES}
        />
      ) : (
        <Lane className="h-10" />
      )}
      {isLoaded ? (
        <AnimationLane
          duration={track.duration}
          beats={details?.beats}
          cues={cues}
          source={source}
        />
      ) : (
        <Lane className="h-8" />
      )}
    </>
  );
}

function TrackRow({ track, ...props }: LaneProps & { track: Track }) {
  return (
    <div className="flex h-full flex-col gap-1.5 border-b px-3 py-2">
      <div className="flex h-5 items-center gap-3 text-sm">
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
        <TruncatedText className="max-w-[25%] text-muted-foreground">{track.artist}</TruncatedText>
        <TruncatedText className="flex-1 text-muted-foreground">{track.album}</TruncatedText>
        <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {getBpmLabel(track.bpm)}
        </span>
        <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {getDurationLabel(track.duration)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 pl-11">
        <TrackLanes track={track} {...props} />
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
  tracks,
  mapping,
  cache,
  source,
}: {
  tracks: readonly Track[];
  mapping: MappingFile | undefined;
  cache: TrackDataCache;
  source: AnimationSource;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { top, height } = useViewport(scrollRef);
  const start = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(tracks.length, Math.ceil((top + height) / ROW_HEIGHT) + OVERSCAN);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div className="relative w-full" style={{ height: tracks.length * ROW_HEIGHT }}>
        {tracks.slice(start, end).map((track, offset) => (
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
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrackList({
  title,
  tracks,
  mapping,
  mappingError,
  cache,
  source,
}: {
  title: string;
  tracks: LoadState<Track[]>;
  mapping: MappingFile | undefined;
  mappingError: string | undefined;
  cache: TrackDataCache;
  source: AnimationSource;
}) {
  const id = useId();
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
        tracks={filteredTracks}
        mapping={mapping}
        cache={cache}
        source={source}
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
        </div>
        {mappingError && (
          <p className="text-xs whitespace-pre-line text-destructive">{mappingError}</p>
        )}
      </header>
      {getContent()}
    </section>
  );
}

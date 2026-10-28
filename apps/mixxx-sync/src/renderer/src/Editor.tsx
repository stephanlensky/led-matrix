import { type StoredAnimation, createRenderer } from "@led-matrix/core";
import { createApiClient } from "@led-matrix/ui/lib/api";
import { browserCanvas } from "@led-matrix/ui/lib/browser-canvas";
import { ClipsContext, createBrowserClips } from "@led-matrix/ui/lib/clips";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DaemonStatus, Settings } from "../../shared/api.ts";
import type { AnimationSource, CueSelection, LaneEditor } from "./AnimationLane.tsx";
import { AnimationPanel, type CueParams, useAnimations } from "./AnimationPanel.tsx";
import { LibraryNav } from "./LibraryNav.tsx";
import { type AnimationPreview, PlaybackSimulator } from "./Playback.tsx";
import { ResizeHandle, useStoredSize } from "./ResizeHandle.tsx";
import { getNudgedBeat } from "../../shared/lane-edit.ts";
import { type MappingFile, getExplicitCues } from "../../shared/mapping.ts";
import { moveCue, removeCue, setCueParam } from "../../shared/mapping-edits.ts";
import { BEATS_PER_BAR } from "../../shared/track-scale.ts";
import { type Player, createPlayer } from "./player.ts";
import { type LiveTrack, TrackList } from "./TrackList.tsx";
import { useDaemonStatus } from "./useDaemon.ts";
import { useEditorOutput } from "./useEditorOutput.ts";
import {
  type LibrarySelection,
  createTrackDataCache,
  usePlaylists,
  useTracks,
} from "./useLibrary.ts";
import { type MappingEditor, useMapping } from "./useMapping.ts";
import { useSettings } from "./useSettings.ts";
import { useStoredState } from "./useStoredState.ts";

const FPS = 30;
const ALL_TRACKS: LibrarySelection = { type: "all" };
const TEXT_ENTRY_SELECTOR = "input, textarea, [contenteditable='true']";
const INTERACTIVE_SELECTOR = `${TEXT_ENTRY_SELECTOR}, select, button, [role='button'], [role='switch']`;

function usePlayer(): Player {
  const [player] = useState(createPlayer);
  useEffect(() => () => player.close(), [player]);
  return player;
}

function useEditorKeys(
  rootRef: RefObject<HTMLElement | null>,
  onKeyDown: (event: KeyboardEvent) => boolean,
) {
  const handlerRef = useRef(onKeyDown);
  useEffect(() => {
    handlerRef.current = onKeyDown;
  });

  useEffect(() => {
    const isIgnored = (event: KeyboardEvent, selector: string) => {
      const target = event.target instanceof Element ? event.target : undefined;
      return Boolean(target?.closest(selector)) || !rootRef.current?.checkVisibility();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isIgnored(event, INTERACTIVE_SELECTOR) && handlerRef.current(event)) {
        event.preventDefault();
      }
    };
    const handleSpace = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isIgnored(event, TEXT_ENTRY_SELECTOR)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "keydown") {
        handlerRef.current(event);
      }
    };
    window.addEventListener("keydown", handleSpace, { capture: true });
    window.addEventListener("keyup", handleSpace, { capture: true });
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleSpace, { capture: true });
      window.removeEventListener("keyup", handleSpace, { capture: true });
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [rootRef]);
}

type EditorActions = {
  remove: () => void;
  setParam: (name: string, option: string) => void;
  nudge: (delta: number) => void;
  undo: () => boolean;
  redo: () => boolean;
};

function useLaneEditor(mapping: MappingEditor): LaneEditor & EditorActions {
  const [selection, setSelection] = useState<CueSelection>();
  const { mapping: file, update, undo, redo } = mapping;
  return useMemo(
    () => ({
      update,
      selection,
      onSelect: setSelection,
      remove() {
        if (selection) {
          update((current) => removeCue(current, selection.location, selection.index));
          setSelection(undefined);
        }
      },
      setParam(name, option) {
        if (selection) {
          update((current) =>
            setCueParam(current, selection.location, selection.index, name, option),
          );
        }
      },
      nudge(delta) {
        const cues = selection && file?.tracks[selection.location];
        const beat = cues && getNudgedBeat(cues, selection.index, delta, selection.trackRange);
        if (selection && beat !== undefined && beat !== cues?.[selection.index]?.beat) {
          update((current) => moveCue(current, selection.location, selection.index, beat));
        }
      },
      undo() {
        setSelection(undefined);
        return undo();
      },
      redo() {
        setSelection(undefined);
        return redo();
      },
    }),
    [file, update, undo, redo, selection],
  );
}

function getCueParams(
  editor: LaneEditor & EditorActions,
  file: MappingFile | undefined,
  animationsById: ReadonlyMap<string, StoredAnimation> | undefined,
): CueParams | undefined {
  const { selection, setParam } = editor;
  const cues = selection && file?.tracks[selection.location];
  const cue = cues && getExplicitCues(cues)[selection.index];
  const animation = cue && animationsById?.get(cue.animation);
  if (!cue || !animation?.parameters?.some(({ options }) => options.length > 1)) {
    return undefined;
  }
  return { animation, params: cue.params, onChange: setParam };
}

function useLiveTrack(): LiveTrack | undefined {
  const status = useDaemonStatus();
  const location = status?.isRunning ? status.trackLocation : undefined;
  const cue = status?.cue;
  const isPlaying = status?.isPlaying ?? false;
  return useMemo(
    () => (location === undefined ? undefined : { location, cue, isPlaying }),
    [location, cue, isPlaying],
  );
}

function useLivePlaybackStart(onStart: () => void) {
  useEffect(() => {
    let isPlaying = false;
    const update = (status: DaemonStatus) => {
      if (status.isPlaying && !isPlaying) {
        onStart();
      }
      isPlaying = status.isPlaying;
    };
    const unsubscribe = window.api.onStatus(update);
    void window.api.getStatus().then(update);
    return unsubscribe;
  }, [onStart]);
}

function getStreamUrl({ serverUrl, output }: Settings): string {
  const url = new URL(`/api/stream/${output}`, serverUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

function getLibrarySelection(value: unknown): LibrarySelection | undefined {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return undefined;
  }
  if (value.type === "all") {
    return ALL_TRACKS;
  }
  return value.type === "playlist" && "playlistId" in value && typeof value.playlistId === "number"
    ? { type: "playlist", playlistId: value.playlistId }
    : undefined;
}

function useLibrarySelection(
  playlists: ReturnType<typeof usePlaylists>,
): [LibrarySelection, (selection: LibrarySelection) => void] {
  const [selection, setSelection] = useStoredState(
    "editor.librarySelection",
    ALL_TRACKS,
    getLibrarySelection,
  );
  const isMissing =
    selection.type === "playlist" &&
    playlists.status === "loaded" &&
    !playlists.value.some(({ id }) => id === selection.playlistId);
  return [isMissing ? ALL_TRACKS : selection, setSelection];
}

function getSelectionTitle(
  selection: LibrarySelection,
  playlists: ReturnType<typeof usePlaylists>,
): string {
  if (selection.type === "all") {
    return "Tracks";
  }
  const playlist =
    playlists.status === "loaded"
      ? playlists.value.find(({ id }) => id === selection.playlistId)
      : undefined;
  return playlist?.name ?? "Playlist";
}

function EditorContent({ settings }: { settings: Settings }) {
  const playlists = usePlaylists();
  const [selection, setSelection] = useLibrarySelection(playlists);
  const tracks = useTracks(selection);
  const api = useMemo(
    () => createApiClient(settings.serverUrl.replace(/\/+$/, "")),
    [settings.serverUrl],
  );
  const clips = useMemo(() => createBrowserClips(api), [api]);
  const renderer = useMemo(
    () => createRenderer({ fps: FPS, canvas: browserCanvas, clips: clips.clips }),
    [clips],
  );
  const animations = useAnimations(api);
  const animationList = animations.status === "loaded" ? animations.value : undefined;
  const source = useMemo<AnimationSource>(
    () => ({
      animationsById:
        animationList && new Map(animationList.map((animation) => [animation.id, animation])),
      renderer,
      fps: FPS,
    }),
    [animationList, renderer],
  );
  const mapping = useMapping();
  const [cache] = useState(createTrackDataCache);
  const player = usePlayer();
  const editor = useLaneEditor(mapping);
  const [preview, setPreview] = useState<AnimationPreview>();
  const [isLiveView, setIsLiveView] = useState(false);
  const endLiveView = useCallback(() => setIsLiveView(false), []);
  const setLiveView = useCallback(
    (isEnabled: boolean) => {
      if (isEnabled) {
        setPreview(undefined);
        if (player.getState().isPlaying) {
          player.toggle();
        }
      }
      setIsLiveView(isEnabled);
    },
    [player],
  );
  const cueParams = getCueParams(editor, mapping.mapping, source.animationsById);
  const live = useLiveTrack();
  const [isDeviceOutput, setIsDeviceOutput] = useState(false);
  const setDeviceOutput = useCallback((isEnabled: boolean) => {
    setIsDeviceOutput(isEnabled);
    if (!isEnabled) {
      window.api.stopEditorOutput();
    }
  }, []);
  useEditorOutput(isDeviceOutput, {
    player,
    mapping: mapping.mapping,
    cache,
    animationsById: source.animationsById,
    preview,
    isLive: isLiveView || (live?.isPlaying ?? false),
  });
  useLivePlaybackStart(useCallback(() => setLiveView(true), [setLiveView]));
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const navWidth = useStoredSize("editor.navWidth", 224, 160, 480);
  useEditorKeys(rootRef, (event) => {
    const isModified = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (isModified && key === "f") {
      searchRef.current?.focus();
      searchRef.current?.select();
      return true;
    }
    if (isModified && key === "z") {
      return event.shiftKey ? editor.redo() : editor.undo();
    }
    if (isModified && key === "y") {
      return editor.redo();
    }
    if (isModified || event.altKey) {
      return false;
    }
    if (event.code === "Space") {
      if (!event.repeat) {
        player.toggle();
      }
      return true;
    }
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && editor.selection) {
      const step = event.shiftKey ? BEATS_PER_BAR : 1;
      editor.nudge(event.key === "ArrowLeft" ? -step : step);
      return true;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && editor.selection) {
      if (!event.repeat) {
        editor.remove();
      }
      return true;
    }
    if (event.key === "Escape" && editor.selection) {
      editor.onSelect(undefined);
      return true;
    }
    if (event.key === "Escape") {
      return player.clearLoop();
    }
    return false;
  });

  return (
    <ClipsContext value={clips}>
      <div ref={rootRef} className="flex h-full">
        <div className="relative flex shrink-0" style={{ width: navWidth.value }}>
          <LibraryNav playlists={playlists} selection={selection} onSelect={setSelection} />
          <ResizeHandle
            axis="x"
            direction={1}
            size={navWidth}
            className="right-0 translate-x-1/2"
          />
        </div>
        <TrackList
          title={getSelectionTitle(selection, playlists)}
          tracks={tracks}
          mapping={mapping.mapping}
          mappingError={mapping.error}
          cache={cache}
          source={source}
          player={player}
          editor={editor}
          live={live}
          isLiveView={isLiveView}
          onLiveViewChange={setLiveView}
          isDeviceOutput={isDeviceOutput}
          onDeviceOutputChange={setDeviceOutput}
          searchRef={searchRef}
        />
        <AnimationPanel
          animations={animations}
          preview={preview}
          cueParams={cueParams}
          onPreviewChange={(next) => {
            setPreview(next);
            if (next) {
              endLiveView();
            }
          }}
          simulator={
            <PlaybackSimulator
              player={player}
              mapping={mapping.mapping}
              cache={cache}
              source={source}
              preview={preview}
              liveStreamUrl={isLiveView ? getStreamUrl(settings) : undefined}
              onPreviewChange={setPreview}
              onLiveViewEnd={endLiveView}
            />
          }
        />
      </div>
    </ClipsContext>
  );
}

export function Editor() {
  const settings = useSettings();
  return settings ? <EditorContent key={settings.mixxxDatabasePath} settings={settings} /> : null;
}

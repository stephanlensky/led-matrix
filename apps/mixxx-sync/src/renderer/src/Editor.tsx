import { createRenderer } from "@led-matrix/core";
import { createApiClient } from "@led-matrix/ui/lib/api";
import { browserCanvas } from "@led-matrix/ui/lib/browser-canvas";
import { ClipsContext, createBrowserClips } from "@led-matrix/ui/lib/clips";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { Settings } from "../../shared/api.ts";
import type { AnimationSource, CueSelection, LaneEditor } from "./AnimationLane.tsx";
import { AnimationPanel, useAnimations } from "./AnimationPanel.tsx";
import { LibraryNav } from "./LibraryNav.tsx";
import { PlaybackSimulator } from "./Playback.tsx";
import { removeCue } from "../../shared/mapping-edits.ts";
import { type Player, createPlayer } from "./player.ts";
import { TrackList } from "./TrackList.tsx";
import {
  type LibrarySelection,
  createTrackDataCache,
  usePlaylists,
  useTracks,
} from "./useLibrary.ts";
import { type MappingEditor, useMapping } from "./useMapping.ts";
import { useSettings } from "./useSettings.ts";

const FPS = 30;
const INTERACTIVE_SELECTOR =
  "input, textarea, select, button, [contenteditable='true'], [role='button'], [role='switch']";

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
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (
        event.repeat ||
        target?.closest(INTERACTIVE_SELECTOR) ||
        !rootRef.current?.checkVisibility()
      ) {
        return;
      }
      if (handlerRef.current(event)) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rootRef]);
}

function useLaneEditor(mapping: MappingEditor): LaneEditor & { remove: () => void } {
  const [selection, setSelection] = useState<CueSelection>();
  const { update } = mapping;
  return useMemo(
    () => ({
      update,
      selection,
      onSelect: setSelection,
      remove() {
        if (selection) {
          update((file) => removeCue(file, selection.location, selection.index));
          setSelection(undefined);
        }
      },
    }),
    [update, selection],
  );
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
  const [selection, setSelection] = useState<LibrarySelection>({ type: "all" });
  const playlists = usePlaylists();
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
  const rootRef = useRef<HTMLDivElement>(null);
  useEditorKeys(rootRef, (event) => {
    if (event.code === "Space") {
      player.toggle();
      return true;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && editor.selection) {
      editor.remove();
      return true;
    }
    if (event.key === "Escape" && editor.selection) {
      editor.onSelect(undefined);
      return true;
    }
    return false;
  });

  return (
    <ClipsContext value={clips}>
      <div ref={rootRef} className="flex h-full">
        <LibraryNav playlists={playlists} selection={selection} onSelect={setSelection} />
        <TrackList
          title={getSelectionTitle(selection, playlists)}
          tracks={tracks}
          mapping={mapping.mapping}
          mappingError={mapping.error}
          cache={cache}
          source={source}
          player={player}
          editor={editor}
        />
        <AnimationPanel
          animations={animations}
          simulator={
            <PlaybackSimulator
              player={player}
              mapping={mapping.mapping}
              cache={cache}
              source={source}
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

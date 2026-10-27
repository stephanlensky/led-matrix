import { createRenderer } from "@led-matrix/core";
import { createApiClient } from "@led-matrix/ui/lib/api";
import { browserCanvas } from "@led-matrix/ui/lib/browser-canvas";
import { ClipsContext, createBrowserClips } from "@led-matrix/ui/lib/clips";
import { useMemo, useState } from "react";
import type { Settings } from "../../shared/api.ts";
import type { AnimationSource } from "./AnimationLane.tsx";
import { AnimationPanel, useAnimations } from "./AnimationPanel.tsx";
import { LibraryNav } from "./LibraryNav.tsx";
import { TrackList } from "./TrackList.tsx";
import {
  type LibrarySelection,
  createTrackDataCache,
  usePlaylists,
  useTracks,
} from "./useLibrary.ts";
import { useMapping } from "./useMapping.ts";
import { useSettings } from "./useSettings.ts";

const FPS = 30;

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

  return (
    <ClipsContext value={clips}>
      <div className="flex h-full">
        <LibraryNav playlists={playlists} selection={selection} onSelect={setSelection} />
        <TrackList
          title={getSelectionTitle(selection, playlists)}
          tracks={tracks}
          mapping={mapping.mapping}
          mappingError={mapping.error}
          cache={cache}
          source={source}
        />
        <AnimationPanel animations={animations} />
      </div>
    </ClipsContext>
  );
}

export function Editor() {
  const settings = useSettings();
  return settings ? <EditorContent key={settings.mixxxDatabasePath} settings={settings} /> : null;
}

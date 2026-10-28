import type { StoredAnimation } from "@led-matrix/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorOutput } from "../../shared/api.ts";
import { type Beats, getBeat, getBpm } from "../../shared/beats.ts";
import { type MappingFile, type ResolvedCue, getResolvedCues } from "../../shared/mapping.ts";
import { type AnimationPreview, DEFAULT_BPM, getTrackCues, isTrackActive } from "./Playback.tsx";
import { type Player, usePlayerState } from "./player.ts";
import type { TrackDataCache } from "./useLibrary.ts";

const UPDATE_INTERVAL = 50;

type TrackBeats = { trackId: number; beats: Beats | undefined };

type EditorOutputOptions = {
  player: Player;
  mapping: MappingFile | undefined;
  cache: TrackDataCache;
  animationsById: ReadonlyMap<string, StoredAnimation> | undefined;
  preview: AnimationPreview | undefined;
  isLive: boolean;
};

type EditorOutputState = EditorOutputOptions & {
  trackBeats: TrackBeats | undefined;
  cues: ResolvedCue[];
};

function getEditorOutput({
  player,
  mapping,
  animationsById,
  preview,
  isLive,
  trackBeats,
  cues,
}: EditorOutputState): EditorOutput | undefined {
  if (isLive) {
    return undefined;
  }
  const state = player.getState();
  const { track, isPlaying } = state;
  if (preview && animationsById?.has(preview.animationId) && !isTrackActive(state, mapping)) {
    return {
      type: "preview",
      animationId: preview.animationId,
      section: preview.section ?? 0,
      params: preview.params,
      bpm: track?.bpm || DEFAULT_BPM,
    };
  }
  const beats = trackBeats?.trackId === track?.id ? trackBeats?.beats : undefined;
  if (!track || !beats) {
    return undefined;
  }
  const beat = getBeat(beats, player.getTime());
  return {
    type: "track",
    position: {
      location: track.location,
      beat,
      bpm: getBpm(beats, beat),
      isPlaying,
      time: Date.now(),
    },
    cues,
  };
}

export function useEditorOutput(isEnabled: boolean, options: EditorOutputOptions) {
  const { player, mapping, cache, animationsById } = options;
  const playerState = usePlayerState(player);
  const { track } = playerState;
  const [trackBeats, setTrackBeats] = useState<TrackBeats>();
  const trackCues = getTrackCues(playerState, mapping);
  const cues = useMemo(
    () => (trackCues && animationsById ? getResolvedCues(trackCues, animationsById).cues : []),
    [trackCues, animationsById],
  );
  const stateRef = useRef<EditorOutputState>({ ...options, trackBeats, cues });
  useEffect(() => {
    stateRef.current = { ...options, trackBeats, cues };
  });

  useEffect(() => {
    if (!isEnabled || !track) {
      return undefined;
    }
    let isCurrent = true;
    void cache.get(track.id).then(
      (data) => isCurrent && setTrackBeats({ trackId: track.id, beats: data.details?.beats }),
      () => undefined,
    );
    return () => {
      isCurrent = false;
    };
  }, [isEnabled, cache, track]);

  useEffect(() => {
    if (!isEnabled) {
      return undefined;
    }
    const update = () => {
      const output = getEditorOutput(stateRef.current);
      if (output) {
        window.api.setEditorOutput(output);
      }
    };
    update();
    const interval = setInterval(update, UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, [isEnabled]);
}

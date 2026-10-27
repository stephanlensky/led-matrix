import { describe, expect, it } from "vitest";
import type { Track } from "./library.ts";
import {
  getBpmLabel,
  getColorLabel,
  getDurationLabel,
  getFilteredTracks,
  getTrackNumberLabel,
} from "./track-list.ts";

function createTrack(changes: Partial<Track>): Track {
  return {
    id: 1,
    location: "/music/track.flac",
    artist: "",
    title: "",
    album: "",
    trackNumber: "",
    duration: 0,
    bpm: 0,
    sampleRate: 44100,
    color: undefined,
    playlistPosition: undefined,
    ...changes,
  };
}

const badApple = createTrack({
  id: 1,
  location: "/music/bad-apple.flac",
  artist: "RichaadEB",
  title: "Bad Apple!!",
});
const otherTrack = createTrack({
  id: 2,
  location: "/music/other.ogg",
  artist: "Someone",
  title: "Another Song",
});
const tracks = [badApple, otherTrack];

describe("getFilteredTracks", () => {
  it("returns the same array without a filter", () => {
    expect(getFilteredTracks(tracks, { search: " ", isMappedOnly: false }, undefined)).toBe(tracks);
  });

  it("matches every search term against title and artist", () => {
    expect(
      getFilteredTracks(tracks, { search: "apple richaad", isMappedOnly: false }, undefined),
    ).toEqual([badApple]);
    expect(
      getFilteredTracks(tracks, { search: "apple someone", isMappedOnly: false }, undefined),
    ).toEqual([]);
  });

  it("keeps only mapped tracks", () => {
    const mapping = { tracks: { "/music/other.ogg": [{ beat: 0, animation: "cat" }] } };
    expect(getFilteredTracks(tracks, { search: "", isMappedOnly: true }, mapping)).toEqual([
      otherTrack,
    ]);
    expect(getFilteredTracks(tracks, { search: "", isMappedOnly: true }, undefined)).toEqual([]);
  });
});

describe("labels", () => {
  it("prefers the playlist position over the track number", () => {
    expect(getTrackNumberLabel(createTrack({ trackNumber: "7" }))).toBe("7");
    expect(getTrackNumberLabel(createTrack({ trackNumber: "7", playlistPosition: 3 }))).toBe("3");
  });

  it("formats durations, bpm and colors", () => {
    expect(getDurationLabel(299.4)).toBe("4:59");
    expect(getDurationLabel(59.6)).toBe("1:00");
    expect(getBpmLabel(138)).toBe("138.0");
    expect(getBpmLabel(0)).toBe("");
    expect(getColorLabel(0xff00)).toBe("#00ff00");
  });
});

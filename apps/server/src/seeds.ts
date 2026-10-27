import type { AnimationInput } from "@led-matrix/core";

export const seedAnimations: Readonly<Record<string, AnimationInput>> = {
  plasma: {
    name: "Plasma",
    mode: { type: "loop", beats: 16 },
    layers: [{ effect: "plasma", params: { cycles: 1, scale: 1.2 } }],
  },
  "white-strobe": {
    name: "White strobe",
    mode: { type: "loop", beats: 1 },
    layers: [{ effect: "strobe", params: { flashesPerBeat: 2, duty: 0.2 } }],
  },
  "spinning-squares": {
    name: "Spinning squares",
    mode: { type: "loop", beats: 8 },
    layers: [{ effect: "squares", params: { count: 4, rotations: 1 } }],
  },
  "text-over-plasma": {
    name: "Text over plasma",
    mode: { type: "loop", beats: 16 },
    layers: [
      { effect: "plasma", params: { cycles: 2, brightness: 0.35 } },
      {
        effect: "scrolling-text",
        params: { text: "TURN IT UP", font: "spleen-8x16", color: "#ffffff", cycles: 2 },
      },
    ],
  },
  "sunrise-fade": {
    name: "Sunrise fade",
    mode: { type: "duration", ms: 20_000 },
    layers: [
      {
        effect: "solid",
        params: {
          color: {
            keyframes: [
              { at: 0, value: "#000000", easing: "easeInQuad" },
              { at: 0.6, value: "#ff4000", easing: "easeInOutSine" },
              { at: 1, value: "#ffd080" },
            ],
          },
        },
      },
    ],
  },
  "vampire-lips": {
    name: "Vampire lips",
    mode: { type: "loop", beats: 16 },
    layers: [
      {
        effect: "vampire-mouth",
        params: {
          pose: {
            keyframes: [
              { at: 0, value: 0, easing: "easeInOutSine" },
              { at: 0.25, value: 1, easing: "easeInOutSine" },
              { at: 0.5, value: 2, easing: "easeInOutSine" },
              { at: 0.75, value: 1, easing: "easeInOutSine" },
              { at: 1, value: 0 },
            ],
          },
          chatter: 0.3,
          snap: false,
          bloodColor: "#800010",
          dripFrom: "fangs",
          drips: 2,
        },
        antialias: true,
      },
      { effect: "tilt", params: { spinEvery: 8 } },
    ],
  },
  "jack-o-lantern": {
    name: "Jack-o'-lantern",
    mode: { type: "loop", beats: 32 },
    layers: [{ effect: "pumpkin", params: { cyclesX: 3, cyclesY: 4 } }],
  },
  "demon-hunters": {
    name: "Demon hunters",
    mode: { type: "loop", beats: 32 },
    layers: [{ effect: "demon-hunters" }],
  },
  "staring-cat": {
    name: "Staring cat",
    mode: { type: "loop", beats: 32 },
    layers: [{ effect: "cat", params: {} }],
  },
  "cat-spawn": {
    name: "Cat spawn",
    mode: { type: "loop", beats: 16 },
    layers: [{ effect: "cat-spawn", params: {} }],
  },
  "cat-bounce": {
    name: "Cat bounce",
    mode: { type: "loop", beats: 16 },
    layers: [{ effect: "cat-bounce", params: {} }],
  },
  "scare-meter-16": {
    name: "Scare meter (16 bars)",
    mode: { type: "loop", beats: 64 },
    layers: [
      {
        effect: "scare-meter",
        params: {
          level: {
            keyframes: [
              { at: 0, value: 0 },
              { at: 1, value: 1 },
            ],
          },
        },
      },
    ],
  },
  "scare-meter-32": {
    name: "Scare meter (32 bars)",
    mode: { type: "loop", beats: 128 },
    layers: [
      {
        effect: "scare-meter",
        params: {
          level: {
            keyframes: [
              { at: 0, value: 0 },
              { at: 1, value: 1 },
            ],
          },
        },
      },
    ],
  },
  "scare-meter-max": {
    name: "Scare meter (maxed)",
    mode: { type: "loop", beats: 16 },
    layers: [
      {
        effect: "scare-meter",
        params: {
          level: 1,
          shake: 2,
          textShake: 3,
          pulse: 4,
          rain: 44,
          rainSpeed: 2,
          explosion: 32,
          explosionPeriod: 16,
        },
      },
    ],
  },
  "plasma-kaleidoscope": {
    name: "Plasma kaleidoscope",
    mode: { type: "loop", beats: 16 },
    layers: [
      { effect: "plasma", params: { cycles: 2, scale: 1.5 } },
      { effect: "kaleidoscope", params: { segments: 8, rotations: 1 } },
      { effect: "chromatic", params: { offset: 1, pulse: 2 } },
    ],
  },
};

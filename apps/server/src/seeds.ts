import type { AnimationInput } from "@led-matrix/core";

type SectionInput = AnimationInput["sections"][number];

const maxedScareMeter: SectionInput = {
  name: "Maxed",
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
};

export const seedAnimations: Readonly<Record<string, AnimationInput>> = {
  plasma: {
    name: "Plasma",
    sections: [
      {
        mode: { type: "loop", beats: 16 },
        layers: [{ effect: "plasma", params: { cycles: 1, scale: 1.2 } }],
      },
    ],
  },
  "white-strobe": {
    name: "White strobe",
    sections: [
      {
        mode: { type: "loop", beats: 1 },
        layers: [{ effect: "strobe", params: { flashesPerBeat: 2, duty: 0.2 } }],
      },
    ],
  },
  "spinning-squares": {
    name: "Spinning squares",
    sections: [
      {
        mode: { type: "loop", beats: 8 },
        layers: [{ effect: "squares", params: { count: 4, rotations: 1 } }],
      },
    ],
  },
  "text-over-plasma": {
    name: "Text over plasma",
    sections: [
      {
        mode: { type: "loop", beats: 16 },
        layers: [
          { effect: "plasma", params: { cycles: 2, brightness: 0.35 } },
          {
            effect: "scrolling-text",
            params: { text: "TURN IT UP", font: "spleen-8x16", color: "#ffffff", cycles: 2 },
          },
        ],
      },
    ],
  },
  "sunrise-fade": {
    name: "Sunrise fade",
    sections: [
      {
        mode: { type: "once", ms: 20_000 },
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
    ],
  },
  "vampire-lips": {
    name: "Vampire lips",
    sections: [
      {
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
    ],
  },
  "jack-o-lantern": {
    name: "Jack-o'-lantern",
    sections: [
      {
        mode: { type: "loop", beats: 32 },
        layers: [{ effect: "pumpkin", params: { cyclesX: 3, cyclesY: 4 } }],
      },
    ],
  },
  "demon-hunters": {
    name: "Demon hunters",
    sections: [
      {
        mode: { type: "loop", beats: 32 },
        layers: [{ effect: "demon-hunters" }],
      },
    ],
  },
  cat: {
    name: "Cat",
    sections: [
      { name: "Stare", mode: { type: "loop", beats: 32 }, layers: [{ effect: "cat" }] },
      { name: "Spawn", mode: { type: "once", beats: 16 }, layers: [{ effect: "cat-spawn" }] },
      { name: "Bounce", mode: { type: "loop", beats: 16 }, layers: [{ effect: "cat-bounce" }] },
    ],
  },
  "scare-meter-16": {
    name: "Scare meter (16 bars)",
    sections: [
      {
        name: "Rising",
        mode: { type: "once", beats: 64 },
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
      maxedScareMeter,
    ],
  },
  "scare-meter-32": {
    name: "Scare meter (32 bars)",
    sections: [
      {
        name: "Rising",
        mode: { type: "once", beats: 128 },
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
      maxedScareMeter,
    ],
  },
  loading: {
    name: "Loading",
    sections: [{ mode: { type: "loop", beats: 4 }, layers: [{ effect: "loading" }] }],
  },
  "plasma-kaleidoscope": {
    name: "Plasma kaleidoscope",
    sections: [
      {
        mode: { type: "loop", beats: 16 },
        layers: [
          { effect: "plasma", params: { cycles: 2, scale: 1.5 } },
          { effect: "kaleidoscope", params: { segments: 8, rotations: 1 } },
          { effect: "chromatic", params: { offset: 1, pulse: 2 } },
        ],
      },
    ],
  },
};

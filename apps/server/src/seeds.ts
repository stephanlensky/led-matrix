import type { AnimationInput } from "@led-matrix/core";

type SectionInput = AnimationInput["sections"][number];

const ORANGE = "#ff5a00";
const GREEN = "#3cff00";
const PURPLE = "#9000ff";
const BLACK = "#000000";
const WHITE = "#ffffff";

function getColors(color1: string, color2 = BLACK) {
  return { color1, color2, colorCount: 2 };
}

function getLoop(name: string, beats: number, layers: SectionInput["layers"]): AnimationInput {
  return { name, sections: [{ mode: { type: "loop", beats }, layers }] };
}

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
  "split-left-right": getLoop("Split left/right", 8, [
    { effect: "split", params: { ...getColors(ORANGE), shape: "left-right" } },
  ]),
  "split-up-down": getLoop("Split up/down", 8, [
    { effect: "split", params: { ...getColors(PURPLE), shape: "up-down" } },
  ]),
  "split-close-left-right": getLoop("Split close left/right", 8, [
    { effect: "split", params: { ...getColors(GREEN), shape: "left-right", origin: "edges" } },
  ]),
  "split-close-up-down": getLoop("Split close up/down", 8, [
    { effect: "split", params: { ...getColors(WHITE), shape: "up-down", origin: "edges" } },
  ]),
  "split-box": getLoop("Split box", 8, [
    { effect: "split", params: { ...getColors(ORANGE, PURPLE), shape: "box" } },
  ]),
  "split-diamond": getLoop("Split diamond", 8, [
    { effect: "split", params: { ...getColors(GREEN, PURPLE), shape: "diamond", origin: "edges" } },
  ]),
  "iris-open": getLoop("Iris open", 8, [
    { effect: "split", params: { ...getColors(ORANGE), shape: "circle" } },
  ]),
  "iris-close": getLoop("Iris close", 8, [
    { effect: "split", params: { ...getColors(PURPLE), shape: "circle", origin: "edges" } },
  ]),
  "split-half-time": getLoop("Split half time", 8, [
    {
      effect: "split",
      params: {
        ...getColors(WHITE),
        shape: "left-right",
        beatsPerColor: 2,
        duration: 0.25,
        easing: "easeOutCubic",
      },
    },
  ]),
  "split-strobe": getLoop("Split with strobe", 8, [
    { effect: "split", params: { ...getColors(PURPLE), shape: "left-right" } },
    { effect: "strobe", params: { flashesPerBeat: 4, duty: 0.15 }, blend: "add", opacity: 0.5 },
  ]),
  "wipe-right": getLoop("Wipe right", 8, [
    { effect: "wipe", params: { ...getColors(ORANGE, PURPLE), direction: "right" } },
  ]),
  "wipe-down": getLoop("Wipe down", 8, [
    { effect: "wipe", params: { ...getColors(GREEN), direction: "down" } },
  ]),
  "wipe-diagonal": getLoop("Wipe diagonal", 8, [
    { effect: "wipe", params: { ...getColors(PURPLE), direction: "down-right" } },
  ]),
  "wipe-clock": getLoop("Clock wipe", 8, [
    {
      effect: "wipe",
      params: { ...getColors(ORANGE), direction: "clockwise", duration: 0.75, easing: "linear" },
    },
  ]),
  "flash-orange": getLoop("Flash orange", 4, [
    { effect: "color-flash", params: { ...getColors(ORANGE), colorCount: 1, duty: 0.5 } },
  ]),
  "flash-strobe": getLoop("Flash purple strobe", 4, [
    {
      effect: "color-flash",
      params: { ...getColors(PURPLE), colorCount: 1, flashesPerBeat: 4, duty: 0.3 },
    },
  ]),
  "flash-pulse": getLoop("Flash green pulse", 4, [
    { effect: "color-flash", params: { ...getColors(GREEN), colorCount: 1, fade: 1 } },
  ]),
  "flash-white-pulse": getLoop("Flash white pulse", 4, [
    {
      effect: "color-flash",
      params: { ...getColors(WHITE), colorCount: 1, flashesPerBeat: 2, fade: 1 },
    },
  ]),
  "flash-orange-purple": getLoop("Flash orange/purple", 4, [
    {
      effect: "color-flash",
      params: { ...getColors(ORANGE, PURPLE), flashesPerBeat: 2, duty: 0.5 },
    },
  ]),
  "flash-green-purple": getLoop("Flash green/purple", 4, [
    {
      effect: "color-flash",
      params: { ...getColors(GREEN, PURPLE), flashesPerBeat: 2, fade: 0.8 },
    },
  ]),
  "flash-white-orange": getLoop("Flash white/orange", 4, [
    { effect: "color-flash", params: { ...getColors(WHITE, ORANGE), duty: 0.25 } },
  ]),
  "color-fade": getLoop("Color fade", 16, [
    { effect: "color-fade", params: { ...getColors(ORANGE, PURPLE), beatsPerColor: 8 } },
  ]),
  "checker-orange-purple": getLoop("Checker orange/purple", 4, [
    { effect: "checker", params: getColors(ORANGE, PURPLE) },
  ]),
  "checker-quadrants": getLoop("Checker quadrants", 4, [
    { effect: "checker", params: { ...getColors(PURPLE), size: 32 } },
  ]),
  "checker-small": getLoop("Checker small", 4, [
    { effect: "checker", params: { ...getColors(GREEN), size: 4, swapsPerBeat: 2 } },
  ]),
  "stripes-diagonal": getLoop("Stripes diagonal", 8, [
    { effect: "stripes", params: getColors(ORANGE, PURPLE) },
  ]),
  "stripes-hazard": getLoop("Stripes hazard", 4, [
    { effect: "stripes", params: { ...getColors(ORANGE), width: 5, angle: "anti-diagonal" } },
  ]),
  "stripes-vertical": getLoop("Stripes vertical", 8, [
    {
      effect: "stripes",
      params: { ...getColors(GREEN, PURPLE), width: 8, angle: "vertical", cycles: 2 },
    },
  ]),
  "stripes-white": getLoop("Stripes white", 8, [
    {
      effect: "stripes",
      params: { ...getColors(WHITE), width: 3, angle: "horizontal", cycles: 4 },
    },
  ]),
  "rings-tunnel": getLoop("Rings tunnel", 8, [
    { effect: "rings", params: { ...getColors(GREEN), cycles: -2 } },
  ]),
  "rings-squares": getLoop("Rings squares", 8, [
    { effect: "rings", params: { ...getColors(ORANGE), shape: "square", width: 4, cycles: 2 } },
  ]),
  "rings-diamond": getLoop("Rings diamond", 8, [
    { effect: "rings", params: { ...getColors(PURPLE), shape: "diamond", width: 6 } },
  ]),
  fireflies: getLoop("Fireflies", 8, [
    {
      effect: "twinkle",
      params: { ...getColors(GREEN), colorCount: 1, perBeat: 64, decay: 1.5, size: 2, period: 8 },
    },
  ]),
  "twinkle-white": getLoop("Twinkle white", 8, [
    {
      effect: "twinkle",
      params: { ...getColors(WHITE), colorCount: 1, perBeat: 96, decay: 0.5, period: 8 },
    },
  ]),
};

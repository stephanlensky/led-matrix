import type { AnimationInput, Preset } from "@led-matrix/core";

type SectionInput = AnimationInput["sections"][number];

type LayerInput = SectionInput["layers"][number];

const ORANGE = "#ff5a00";
const GREEN = "#3cff00";
const PURPLE = "#9000ff";
const BLACK = "#000000";
const WHITE = "#ffffff";
const ICE = "#80b0ff";
const RED = "#ff0000";
const PUMPKIN = "#ff6a00";
const PINK = "#ff0080";
const CYAN = "#00c8ff";

type Palette = readonly [string, ...string[]];

const SINGLE_PALETTES: Readonly<Record<string, Palette>> = {
  Orange: [ORANGE],
  Purple: [PURPLE],
  Green: [GREEN],
  White: [WHITE],
};

const MULTI_PALETTES: Readonly<Record<string, Palette>> = {
  "Orange/purple": [ORANGE, PURPLE],
  "Green/purple": [GREEN, PURPLE],
  "White/orange": [WHITE, ORANGE],
  Ice: [WHITE, ICE],
  Pastel: ["#ff9ec8", "#8fd8ff", "#c39bff", "#9cffb0"],
  Halloween: [ORANGE, PURPLE, GREEN],
};

const PALETTES = { ...SINGLE_PALETTES, ...MULTI_PALETTES };

const PALETTE_KEYS = ["color1", "color2", "color3", "color4", "colorCount"] as const;

const paletteParams = Object.fromEntries(PALETTE_KEYS.map((key) => [key, { preset: key }]));

function getPresetNames(palettes: Readonly<Record<string, Palette>>, first: string): string[] {
  const names = Object.keys(palettes);
  if (!names.includes(first)) {
    throw new Error(`Unknown palette "${first}"`);
  }
  return [first, ...names.filter((name) => name !== first)];
}

function getPaletteValues(colors: readonly string[]): Record<string, unknown> {
  return {
    color1: colors[0] ?? BLACK,
    color2: colors[1] ?? BLACK,
    color3: colors[2] ?? BLACK,
    color4: colors[3] ?? BLACK,
    colorCount: colors.length,
  };
}

function getBackgroundPalettePresets(first: string): Preset[] {
  return getPresetNames(PALETTES, first).map((name) => {
    const colors = PALETTES[name] ?? [];
    return { name, values: getPaletteValues(colors.length === 1 ? [...colors, BLACK] : colors) };
  });
}

function getLightPalettePresets(
  first: string,
  palettes: Readonly<Record<string, Palette>> = PALETTES,
): Preset[] {
  return getPresetNames(palettes, first).map((name) => ({
    name,
    values: getPaletteValues(palettes[name] ?? []),
  }));
}

function getColorPresets(
  first: string,
  colors: Readonly<Record<string, string>>,
  key = "color",
): Preset[] {
  return getPresetNames(
    Object.fromEntries(Object.entries(colors).map(([name, color]) => [name, [color]])),
    first,
  ).map((name) => ({ name, values: { [key]: colors[name] } }));
}

function getPairPresets(first: string, pairs: Readonly<Record<string, Palette>>): Preset[] {
  return getPresetNames(pairs, first).map((name) => {
    const [startColor, endColor = startColor] = pairs[name] ?? [BLACK];
    return { name, values: { startColor, endColor } };
  });
}

function getDimColor(color: string, amount: number): string {
  const channels = [1, 3, 5].map((offset) =>
    Math.round(Number.parseInt(color.slice(offset, offset + 2), 16) * amount),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

const SINGLE_COLORS = Object.fromEntries(
  Object.entries(SINGLE_PALETTES).map(([name, [color]]) => [name, color]),
);

function getFolder(
  folder: string,
  animations: Readonly<Record<string, AnimationInput>>,
): Record<string, AnimationInput> {
  return Object.fromEntries(
    Object.entries(animations).map(([id, animation]) => [id, { ...animation, folder }]),
  );
}

function getLoop(
  name: string,
  beats: number,
  layers: SectionInput["layers"],
  presets?: Preset[],
): AnimationInput {
  return { name, presets, sections: [{ mode: { type: "loop", beats }, layers }] };
}

function getBackgroundLoop(
  name: string,
  beats: number,
  palette: string,
  effect: string,
  params: Record<string, unknown>,
  extraLayers: readonly LayerInput[] = [],
): AnimationInput {
  return getLoop(
    name,
    beats,
    [{ effect, params: { ...paletteParams, ...params } }, ...extraLayers],
    getBackgroundPalettePresets(palette),
  );
}

function getLightLoop(
  name: string,
  beats: number,
  palette: string,
  effect: string,
  params: Record<string, unknown> = {},
): AnimationInput {
  return getLoop(
    name,
    beats,
    [{ effect, params: { ...paletteParams, ...params } }],
    getLightPalettePresets(palette),
  );
}

const maxedScareMeter: SectionInput = {
  name: "Maxed",
  mode: { type: "loop", beats: 16 },
  layers: [
    {
      effect: "scare-meter",
      params: {
        level: 1,
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

const RUMBLE_GREEN = "#00ff30";
const RUMBLE_WORDS = ["ARE", "YOU", "READY", "TO"];
const RUMBLE_TEXT = "RUUUUUUUUUUMMMMBLEEEEEEE???";

type RumbleStyle = { background: string; strobe: string; text: string };

function getRumbleSection(
  text: string,
  beats: number,
  key: string,
  textParams: Record<string, unknown> = {},
): SectionInput {
  return {
    name: text,
    mode: { type: "once", beats },
    layers: [
      { effect: "solid", params: { color: { preset: `${key}Background` } } },
      {
        effect: "strobe",
        params: { color: { preset: `${key}Strobe` }, flashesPerBeat: 2, duty: 0.5 },
        blend: "add",
      },
      {
        effect: "big-text",
        params: { text, font: "Anton", size: 40, color: { preset: `${key}Text` }, ...textParams },
      },
    ],
  };
}

function getRumbleValues(key: string, { background, strobe, text }: RumbleStyle) {
  return { [`${key}Background`]: background, [`${key}Strobe`]: strobe, [`${key}Text`]: text };
}

function getRumblePreset(
  name: string,
  wordStyles: readonly [RumbleStyle, ...RumbleStyle[]],
  rumbleStyle: RumbleStyle,
): Preset {
  return {
    name,
    values: Object.assign(
      getRumbleValues("rumble", rumbleStyle),
      ...RUMBLE_WORDS.map((_word, index) =>
        getRumbleValues(`word${index + 1}`, wordStyles[index % wordStyles.length] ?? wordStyles[0]),
      ),
    ),
  };
}

function getRumbleStrobePreset(name: string, background: string): Preset {
  const style = { background, strobe: WHITE, text: BLACK };
  return getRumblePreset(name, [style], style);
}

const rumble: AnimationInput = {
  name: "Ready to rumble",
  presets: [
    getRumblePreset(
      "Solid",
      [
        { background: BLACK, strobe: BLACK, text: WHITE },
        { background: RUMBLE_GREEN, strobe: BLACK, text: BLACK },
        { background: WHITE, strobe: BLACK, text: BLACK },
        { background: RUMBLE_GREEN, strobe: BLACK, text: BLACK },
      ],
      { background: BLACK, strobe: BLACK, text: WHITE },
    ),
    getRumbleStrobePreset("Green strobe", RUMBLE_GREEN),
    getRumbleStrobePreset("Orange strobe", ORANGE),
    getRumbleStrobePreset("Purple strobe", PURPLE),
  ],
  sections: [
    ...RUMBLE_WORDS.map((word, index) => getRumbleSection(word, 1, `word${index + 1}`)),
    getRumbleSection(RUMBLE_TEXT, 8, "rumble", {
      scroll: {
        keyframes: [
          { at: 0, value: 0 },
          { at: 1, value: 1 },
        ],
      },
    }),
  ],
};

const loadingPresets: Preset[] = Object.entries({ Red: RED, ...SINGLE_COLORS }).map(
  ([name, color]) => ({ name, values: { color, textColor: getDimColor(color, 0.48) } }),
);

const textColors = { White: WHITE, Orange: ORANGE, Purple: PURPLE, Green: GREEN };

const squarePairs: Readonly<Record<string, Palette>> = {
  "Pink/cyan": [PINK, CYAN],
  "Orange/purple": [ORANGE, PURPLE],
  "Green/purple": [GREEN, PURPLE],
  "White/orange": [WHITE, ORANGE],
  Ice: [WHITE, ICE],
};

export const replacedSeedIds = [
  "white-strobe",
  "flash-orange",
  "flash-white-pulse",
  "flash-orange-purple",
  "flash-green-purple",
  "flash-white-orange",
  "checker-orange-purple",
  "stripes-white",
  "twinkle-white",
  "hyperspace-white",
  "hyperspace-ice",
  "hyperspace-pastel",
  "hyperspace-orange",
  "hyperspace-purple",
  "hyperspace-green",
  "hyperspace-orange-purple",
  "hyperspace-green-purple",
  "hyperspace-halloween",
  "rumble-solid",
  "rumble-green-strobe",
];

export const seedAnimations: Readonly<Record<string, AnimationInput>> = {
  ...getFolder("Basics", {
    plasma: getLoop("Plasma", 16, [{ effect: "plasma", params: { cycles: 1, scale: 1.2 } }]),
    strobe: getLoop(
      "Strobe",
      1,
      [{ effect: "strobe", params: { color: { preset: "color" }, flashesPerBeat: 2, duty: 0.2 } }],
      getColorPresets("White", SINGLE_COLORS),
    ),
    "spinning-squares": getLoop(
      "Spinning squares",
      8,
      [
        {
          effect: "squares",
          params: {
            count: 4,
            rotations: 1,
            startColor: { preset: "startColor" },
            endColor: { preset: "endColor" },
          },
        },
      ],
      getPairPresets("Pink/cyan", squarePairs),
    ),
    "text-over-plasma": getLoop(
      "Text over plasma",
      16,
      [
        { effect: "plasma", params: { cycles: 2, brightness: 0.35 } },
        {
          effect: "scrolling-text",
          params: {
            text: "TURN IT UP",
            font: "spleen-8x16",
            color: { preset: "color" },
            cycles: 2,
          },
        },
      ],
      getColorPresets("White", textColors),
    ),
    "plasma-kaleidoscope": getLoop("Plasma kaleidoscope", 16, [
      { effect: "plasma", params: { cycles: 2, scale: 1.5 } },
      { effect: "kaleidoscope", params: { segments: 8, rotations: 1 } },
      { effect: "chromatic", params: { offset: 1, pulse: 2 } },
    ]),
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
    "color-fade": getLoop(
      "Color fade",
      16,
      [{ effect: "color-fade", params: { ...paletteParams, beatsPerColor: 8 } }],
      getLightPalettePresets("Orange/purple", MULTI_PALETTES),
    ),
    loading: getLoop(
      "Loading",
      4,
      [
        {
          effect: "loading",
          params: { color: { preset: "color" }, textColor: { preset: "textColor" } },
        },
      ],
      loadingPresets,
    ),
  }),
  ...getFolder("Basics/Splits", {
    "split-left-right": getBackgroundLoop("Split left/right", 8, "Orange", "split", {
      shape: "left-right",
    }),
    "split-up-down": getBackgroundLoop("Split up/down", 8, "Purple", "split", {
      shape: "up-down",
    }),
    "split-close-left-right": getBackgroundLoop("Split close left/right", 8, "Green", "split", {
      shape: "left-right",
      origin: "edges",
    }),
    "split-close-up-down": getBackgroundLoop("Split close up/down", 8, "White", "split", {
      shape: "up-down",
      origin: "edges",
    }),
    "split-box": getBackgroundLoop("Split box", 8, "Orange/purple", "split", { shape: "box" }),
    "split-diamond": getBackgroundLoop("Split diamond", 8, "Green/purple", "split", {
      shape: "diamond",
      origin: "edges",
    }),
    "iris-open": getBackgroundLoop("Iris open", 8, "Orange", "split", { shape: "circle" }),
    "iris-close": getBackgroundLoop("Iris close", 8, "Purple", "split", {
      shape: "circle",
      origin: "edges",
    }),
    "split-half-time": getBackgroundLoop("Split half time", 8, "White", "split", {
      shape: "left-right",
      beatsPerColor: 2,
      duration: 0.25,
      easing: "easeOutCubic",
    }),
    "split-strobe": getBackgroundLoop(
      "Split with strobe",
      8,
      "Purple",
      "split",
      { shape: "left-right" },
      [{ effect: "strobe", params: { flashesPerBeat: 4, duty: 0.15 }, blend: "add", opacity: 0.5 }],
    ),
  }),
  ...getFolder("Basics/Wipes", {
    "wipe-right": getBackgroundLoop("Wipe right", 8, "Orange/purple", "wipe", {
      direction: "right",
    }),
    "wipe-down": getBackgroundLoop("Wipe down", 8, "Green", "wipe", { direction: "down" }),
    "wipe-diagonal": getBackgroundLoop("Wipe diagonal", 8, "Purple", "wipe", {
      direction: "down-right",
    }),
    "wipe-clock": getBackgroundLoop("Clock wipe", 8, "Orange", "wipe", {
      direction: "clockwise",
      duration: 0.75,
      easing: "linear",
    }),
  }),
  ...getFolder("Basics/Flashes", {
    flash: getLightLoop("Flash", 4, "Orange", "color-flash", { duty: 0.5 }),
    "flash-strobe": getLightLoop("Flash strobe", 4, "Purple", "color-flash", {
      flashesPerBeat: 4,
      duty: 0.3,
    }),
    "flash-pulse": getLightLoop("Flash pulse", 4, "Green", "color-flash", { fade: 1 }),
    "flash-double-pulse": getLightLoop("Flash double pulse", 4, "White", "color-flash", {
      flashesPerBeat: 2,
      fade: 1,
    }),
    "flash-alternate": getLightLoop("Flash alternate", 4, "Orange/purple", "color-flash", {
      flashesPerBeat: 2,
      duty: 0.5,
    }),
    "flash-alternate-pulse": getLightLoop(
      "Flash alternate pulse",
      4,
      "Green/purple",
      "color-flash",
      { flashesPerBeat: 2, fade: 0.8 },
    ),
    "flash-short": getLightLoop("Flash short", 4, "White/orange", "color-flash", { duty: 0.25 }),
  }),
  ...getFolder("Basics/Patterns", {
    checker: getBackgroundLoop("Checker", 4, "Orange/purple", "checker", {}),
    "checker-quadrants": getBackgroundLoop("Checker quadrants", 4, "Purple", "checker", {
      size: 32,
    }),
    "checker-small": getBackgroundLoop("Checker small", 4, "Green", "checker", {
      size: 4,
      swapsPerBeat: 2,
    }),
    "stripes-diagonal": getBackgroundLoop("Stripes diagonal", 8, "Orange/purple", "stripes", {}),
    "stripes-hazard": getBackgroundLoop("Stripes hazard", 4, "Orange", "stripes", {
      width: 5,
      angle: "anti-diagonal",
    }),
    "stripes-vertical": getBackgroundLoop("Stripes vertical", 8, "Green/purple", "stripes", {
      width: 8,
      angle: "vertical",
      cycles: 2,
    }),
    "stripes-horizontal": getBackgroundLoop("Stripes horizontal", 8, "White", "stripes", {
      width: 3,
      angle: "horizontal",
      cycles: 4,
    }),
    "rings-tunnel": getBackgroundLoop("Rings tunnel", 8, "Green", "rings", { cycles: -2 }),
    "rings-squares": getBackgroundLoop("Rings squares", 8, "Orange", "rings", {
      shape: "square",
      width: 4,
      cycles: 2,
    }),
    "rings-diamond": getBackgroundLoop("Rings diamond", 8, "Purple", "rings", {
      shape: "diamond",
      width: 6,
    }),
    fireflies: getLightLoop("Fireflies", 8, "Green", "twinkle", {
      perBeat: 64,
      decay: 1.5,
      size: 2,
      period: 8,
    }),
    twinkle: getLightLoop("Twinkle", 8, "White", "twinkle", {
      perBeat: 96,
      decay: 0.5,
      period: 8,
    }),
  }),
  ...getFolder("Basics/Hyperspace", {
    hyperspace: getLightLoop("Hyperspace", 8, "White", "hyperspace"),
    "hyperspace-warp": getLightLoop("Hyperspace warp", 4, "White", "hyperspace", {
      perBeat: 10,
      life: 1,
      trail: 0.5,
      period: 4,
    }),
    "hyperspace-drift": getLightLoop("Hyperspace drift", 16, "Pastel", "hyperspace", {
      perBeat: 3,
      life: 4,
      trail: 0.2,
      period: 16,
    }),
  }),
  ...getFolder("Cats", {
    cat: {
      name: "Cat",
      sections: [
        { name: "Stare", mode: { type: "loop", beats: 32 }, layers: [{ effect: "cat" }] },
        { name: "Spawn", mode: { type: "once", beats: 16 }, layers: [{ effect: "cat-spawn" }] },
        { name: "Bounce", mode: { type: "loop", beats: 16 }, layers: [{ effect: "cat-bounce" }] },
      ],
    },
  }),
  ...getFolder("KPop Demon Hunters", {
    "demon-hunters": {
      name: "Demon hunters",
      sections: [
        {
          mode: { type: "loop", beats: 32 },
          layers: [{ effect: "demon-hunters" }],
        },
      ],
    },
  }),
  ...getFolder("Halloween", {
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
    "jack-o-lantern": getLoop(
      "Jack-o'-lantern",
      32,
      [{ effect: "pumpkin", params: { cyclesX: 3, cyclesY: 4, color: { preset: "color" } } }],
      getColorPresets("Pumpkin", { Pumpkin: PUMPKIN, Purple: PURPLE, Green: GREEN, White: WHITE }),
    ),
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
  }),
  ...getFolder("One-offs", { rumble }),
};

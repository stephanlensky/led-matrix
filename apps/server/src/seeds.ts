import {
  BLOOD_COLOR,
  BLOOD_PALETTE,
  DRIED_BLOOD_COLOR,
  FRESH_BLOOD_COLOR,
  HEIGHT,
  WIDTH,
  type AnimationInput,
  type Parameter,
  getBigTextExitScroll,
} from "@led-matrix/core";
import { nodeCanvas } from "@led-matrix/core/node-canvas";

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
const HEART_PINK = "#ff2a6d";
const LIGHT_PINK = "#ffb6d5";
const PASTEL_PINK = "#ff9ec8";

type Palette = readonly [string, ...string[]];

type Options = Readonly<Record<string, Record<string, unknown>>>;

const SINGLE_PALETTES: Readonly<Record<string, Palette>> = {
  Orange: [ORANGE],
  Purple: [PURPLE],
  Green: [GREEN],
  White: [WHITE],
  "Hot pink": [PINK],
  Pink: [HEART_PINK],
  "Light pink": [LIGHT_PINK],
  "Pastel pink": [PASTEL_PINK],
  Blood: [BLOOD_COLOR],
  "Dried blood": [DRIED_BLOOD_COLOR],
  "Fresh blood": [FRESH_BLOOD_COLOR],
};

const MULTI_PALETTES: Readonly<Record<string, Palette>> = {
  "Orange/purple": [ORANGE, PURPLE],
  "Green/purple": [GREEN, PURPLE],
  "White/orange": [WHITE, ORANGE],
  "Pink/purple": [PINK, PURPLE],
  "Pink/cyan": [PINK, CYAN],
  Ice: [WHITE, ICE],
  Pastel: [PASTEL_PINK, "#8fd8ff", "#c39bff", "#9cffb0"],
  Pinks: [PINK, HEART_PINK, LIGHT_PINK],
  Halloween: [ORANGE, PURPLE, GREEN],
  Bloodbath: BLOOD_PALETTE,
};

const PALETTES = { ...SINGLE_PALETTES, ...MULTI_PALETTES };

const PALETTE_KEYS = ["color1", "color2", "color3", "color4", "colorCount"] as const;

function getReferences(keys: readonly string[]): Record<string, { param: string }> {
  return Object.fromEntries(keys.map((key) => [key, { param: key }]));
}

const paletteParams = getReferences(PALETTE_KEYS);

function getParameter(name: string, options: Options, defaultOption: string): Parameter {
  if (!(defaultOption in options)) {
    throw new Error(`Unknown option "${defaultOption}" for parameter "${name}"`);
  }
  return {
    name,
    default: defaultOption,
    options: Object.entries(options).map(([option, values]) => ({ name: option, values })),
  };
}

function getValueParameter(
  name: string,
  key: string,
  values: Readonly<Record<string, unknown>>,
  defaultOption: string,
): Parameter {
  return getParameter(
    name,
    Object.fromEntries(Object.entries(values).map(([option, value]) => [option, { [key]: value }])),
    defaultOption,
  );
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

function getPaletteParameter(
  palettes: Readonly<Record<string, Palette>>,
  defaultOption: string,
  getColors: (palette: Palette) => readonly string[] = (palette) => palette,
): Parameter {
  return getParameter(
    "Color",
    Object.fromEntries(
      Object.entries(palettes).map(([name, palette]) => [
        name,
        getPaletteValues(getColors(palette)),
      ]),
    ),
    defaultOption,
  );
}

function getBackgroundColorParameter(defaultOption: string): Parameter {
  return getPaletteParameter(PALETTES, defaultOption, (palette) =>
    palette.length === 1 ? [...palette, BLACK] : palette,
  );
}

function getLightColorParameter(
  defaultOption: string,
  palettes: Readonly<Record<string, Palette>> = PALETTES,
): Parameter {
  return getPaletteParameter(palettes, defaultOption);
}

function getColorParameter(
  defaultOption: string,
  colors: Readonly<Record<string, string>>,
): Parameter {
  return getValueParameter("Color", "color", colors, defaultOption);
}

function getPairParameter(
  defaultOption: string,
  pairs: Readonly<Record<string, Palette>>,
): Parameter {
  return getParameter(
    "Color",
    Object.fromEntries(
      Object.entries(pairs).map(([name, [startColor, endColor = startColor]]) => [
        name,
        { startColor, endColor },
      ]),
    ),
    defaultOption,
  );
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
  parameters?: Parameter[],
): AnimationInput {
  return { name, parameters, sections: [{ mode: { type: "loop", beats }, layers }] };
}

function getBackgroundLoop(
  name: string,
  beats: number,
  effect: string,
  params: Record<string, unknown>,
  parameters: readonly Parameter[],
  extraLayers: readonly LayerInput[] = [],
): AnimationInput {
  return getLoop(
    name,
    beats,
    [{ effect, params: { ...paletteParams, ...params } }, ...extraLayers],
    [...parameters],
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
    [getLightColorParameter(palette)],
  );
}

const equalizerStyleParameter = getValueParameter(
  "Style",
  "style",
  { Bottom: "bottom", Center: "center" },
  "Bottom",
);

const transitionSpeedParameter = getValueParameter(
  "Speed",
  "beatsPerColor",
  { Double: 0.5, Beat: 1, "Half time": 2, "Quarter time": 4, "Eighth time": 8 },
  "Beat",
);

const transitionMotionParameter = getParameter(
  "Motion",
  {
    Smooth: { duration: 0.5, easing: "easeInOutCubic" },
    Snap: { duration: 0.25, easing: "easeOutCubic" },
    Sweep: { duration: 0.75, easing: "linear" },
  },
  "Smooth",
);

const transitionReferences = getReferences(["beatsPerColor", "duration", "easing"]);

const splitParameters = [
  getParameter(
    "Shape",
    {
      "Left/right": { shape: "left-right" },
      "Up/down": { shape: "up-down" },
      Box: { shape: "box" },
      Diamond: { shape: "diamond" },
      Circle: { shape: "circle" },
    },
    "Left/right",
  ),
  getValueParameter("Origin", "origin", { Center: "center", Edges: "edges" }, "Center"),
  transitionSpeedParameter,
  transitionMotionParameter,
];

const splitReferences = { ...transitionReferences, ...getReferences(["shape", "origin"]) };

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
const RUMBLE_FONT = { font: "Anton", size: 40 } as const;
const RUMBLE_SCROLL_BEATS = 6;
const RUMBLE_BEATS = Math.ceil(
  RUMBLE_SCROLL_BEATS *
    getBigTextExitScroll(nodeCanvas.createContext(WIDTH, HEIGHT), {
      text: RUMBLE_TEXT,
      ...RUMBLE_FONT,
      outlineWidth: 0,
    }),
);

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
      { effect: "solid", params: { color: { param: `${key}Background` } } },
      {
        effect: "strobe",
        params: { color: { param: `${key}Strobe` }, flashesPerBeat: 2, duty: 0.5 },
        blend: "add",
      },
      {
        effect: "big-text",
        params: { text, ...RUMBLE_FONT, color: { param: `${key}Text` }, ...textParams },
      },
    ],
  };
}

function getRumbleValues(key: string, { background, strobe, text }: RumbleStyle) {
  return { [`${key}Background`]: background, [`${key}Strobe`]: strobe, [`${key}Text`]: text };
}

function getRumbleStyleValues(
  wordStyles: readonly [RumbleStyle, ...RumbleStyle[]],
  rumbleStyle: RumbleStyle,
): Record<string, unknown> {
  return Object.assign(
    getRumbleValues("rumble", rumbleStyle),
    ...RUMBLE_WORDS.map((_word, index) =>
      getRumbleValues(`word${index + 1}`, wordStyles[index % wordStyles.length] ?? wordStyles[0]),
    ),
  );
}

function getRumbleStrobeValues(background: string): Record<string, unknown> {
  const style = { background, strobe: WHITE, text: BLACK };
  return getRumbleStyleValues([style], style);
}

const rumble: AnimationInput = {
  name: "Ready to rumble",
  parameters: [
    getParameter(
      "Style",
      {
        Solid: getRumbleStyleValues(
          [
            { background: BLACK, strobe: BLACK, text: WHITE },
            { background: RUMBLE_GREEN, strobe: BLACK, text: BLACK },
            { background: WHITE, strobe: BLACK, text: BLACK },
            { background: RUMBLE_GREEN, strobe: BLACK, text: BLACK },
          ],
          { background: BLACK, strobe: BLACK, text: WHITE },
        ),
        "Green strobe": getRumbleStrobeValues(RUMBLE_GREEN),
        "Orange strobe": getRumbleStrobeValues(ORANGE),
        "Purple strobe": getRumbleStrobeValues(PURPLE),
        "Pink strobe": getRumbleStrobeValues(PINK),
        "Blood strobe": getRumbleStrobeValues(BLOOD_COLOR),
      },
      "Solid",
    ),
  ],
  sections: [
    ...RUMBLE_WORDS.map((word, index) => getRumbleSection(word, 1, `word${index + 1}`)),
    getRumbleSection(RUMBLE_TEXT, RUMBLE_BEATS, "rumble", {
      scroll: {
        keyframes: [
          { at: 0, value: 0 },
          { at: 1, value: RUMBLE_BEATS / RUMBLE_SCROLL_BEATS },
        ],
      },
    }),
  ],
};

const loadingParameter = getParameter(
  "Color",
  Object.fromEntries(
    Object.entries({ Red: RED, ...SINGLE_COLORS }).map(([name, color]) => [
      name,
      { color, textColor: getDimColor(color, 0.48) },
    ]),
  ),
  "Red",
);

const squarePairs: Readonly<Record<string, Palette>> = {
  "Pink/cyan": [PINK, CYAN],
  "Pink/purple": [PINK, PURPLE],
  Pinks: [PINK, LIGHT_PINK],
  "Orange/purple": [ORANGE, PURPLE],
  "Green/purple": [GREEN, PURPLE],
  "White/orange": [WHITE, ORANGE],
  Ice: [WHITE, ICE],
  Blood: [FRESH_BLOOD_COLOR, DRIED_BLOOD_COLOR],
};

const flashSpeeds = {
  "Eighth time": 0.125,
  "Quarter time": 0.25,
  "Half time": 0.5,
  Beat: 1,
  Double: 2,
  Quad: 4,
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
  "flash-strobe",
  "flash-pulse",
  "flash-double-pulse",
  "flash-alternate",
  "flash-alternate-pulse",
  "flash-short",
  "split-left-right",
  "split-up-down",
  "split-close-left-right",
  "split-close-up-down",
  "split-box",
  "split-diamond",
  "iris-open",
  "iris-close",
  "split-half-time",
  "wipe-right",
  "wipe-down",
  "wipe-diagonal",
  "wipe-clock",
  "checker-quadrants",
  "checker-small",
  "stripes-diagonal",
  "stripes-hazard",
  "stripes-vertical",
  "stripes-horizontal",
  "rings-tunnel",
  "rings-squares",
  "rings-diamond",
  "text-over-plasma",
  "plasma-kaleidoscope",
  "sunrise-fade",
];

function getRamp(from: number, to: number, easing?: string): { keyframes: unknown[] } {
  return {
    keyframes: [
      { at: 0, value: from, ...(easing ? { easing } : {}) },
      { at: 1, value: to },
    ],
  };
}

const catChoiceParameter = getValueParameter(
  "Cat",
  "cat",
  { Black: "black", Tabby: "tabby" },
  "Black",
);

function getCatPhoneSection(name: string, mode: SectionInput["mode"], scene: string): SectionInput {
  return {
    name,
    mode,
    layers: [
      {
        effect: "cat-phone",
        params: { ...getReferences(["every", "message", "sender"]), scene },
      },
    ],
  };
}

const hyperspaceLayer: LayerInput = {
  effect: "hyperspace",
  params: { ...paletteParams, period: 8, ...getReferences(["perBeat", "life", "trail"]) },
};

const hyperspaceSpeedParameter = getParameter(
  "Speed",
  {
    Cruise: { perBeat: 6, life: 2, trail: 0.3 },
    Warp: { perBeat: 10, life: 1, trail: 0.5 },
    Drift: { perBeat: 3, life: 4, trail: 0.2 },
  },
  "Cruise",
);

const hyperspaceOrbitParameter = getParameter(
  "Orbit",
  {
    Slow: { orbits: 1, turns: 2 },
    Medium: { orbits: 2, turns: 4 },
    Fast: { orbits: 4, turns: 8 },
  },
  "Medium",
);

const hunterSyncParameter = getValueParameter(
  "Sync",
  "sync",
  { Together: "together", Alternating: "alternate", Wave: "wave" },
  "Together",
);

const heroSyncParameter = getValueParameter(
  "Sync",
  "sync",
  { Together: "together", Alternating: "alternate", Offbeat: "offbeat" },
  "Together",
);

const liftTempoParameter = getValueParameter(
  "Tempo",
  "every",
  { Beat: 1, "2 beats": 2, Bar: 4 },
  "2 beats",
);

const loveFloatLayer: LayerInput = {
  effect: "heart-float",
  params: { ...getReferences(["every"]), color: { param: "heartColor" }, y: 48, rise: 46 },
};

const lovePulseParameter = getValueParameter(
  "Pulse",
  "every",
  { "Half beat": 0.5, Beat: 1, "2 beats": 2 },
  "Beat",
);

const loveColorParameter = getParameter(
  "Hearts",
  {
    Pink: { heartColor: HEART_PINK, backgroundColor: "#2a0418" },
    "Hot pink": { heartColor: PINK, backgroundColor: "#2a0014" },
    "Light pink": { heartColor: LIGHT_PINK, backgroundColor: "#2a0a18" },
    Red: { heartColor: "#ff1030", backgroundColor: "#240006" },
    Purple: { heartColor: "#d040ff", backgroundColor: "#16052a" },
  },
  "Pink",
);

const heartZoomSpeedParameter = getValueParameter(
  "Speed",
  "speed",
  { Slow: 0.25, Medium: 0.5, Fast: 1 },
  "Medium",
);

const vocalLayers = { heartColor: HEART_PINK };

function getVocalSection(
  name: string,
  beats: number,
  scene: string,
  params: Record<string, unknown> = {},
): SectionInput {
  return {
    name,
    mode: { type: "once", beats },
    layers: [{ effect: "vocal-scene", params: { ...vocalLayers, scene, ...params } }],
  };
}

const vocalPlanetDying: AnimationInput = {
  name: "The planet is dying",
  sections: [
    {
      name: "It's gonna take effort",
      mode: { type: "once", beats: 3 },
      layers: [
        {
          effect: "cat-bench",
          params: { cat: "black", every: 1.5, punch: 0.12 },
        },
      ],
    },
    getVocalSection("It's gonna take patience", 3, "patience"),
    getVocalSection("A lot a lot a lot a lot of work", 8, "stack"),
    getVocalSection("But if we don't try", 3, "shrug"),
    {
      name: "What the fuck is stopping us",
      mode: { type: "once", beats: 3 },
      layers: [
        {
          effect: "big-text",
          params: {
            text: "WTF",
            color: WHITE,
            outlineColor: "#d00018",
            outlineWidth: 2,
            pulse: 0.4,
            size: 34,
          },
        },
      ],
    },
    getVocalSection("Throwing ourselves off a bridge", 4, "bridge"),
    getVocalSection("And giving up, and saying yeah", 4, "flag"),
    getVocalSection("The planet is dying", 4, "planet", { cancelAt: 2 }),
    getVocalSection("The government hates us", 4, "house", { cancelAt: 2 }),
    getVocalSection("The animals are leaving", 4, "animals", { cancelAt: 2 }),
    getVocalSection("The aliens aren't contacting us", 4, "aliens", { cancelAt: 2.5 }),
    getVocalSection("We might be alone", 4, "alone"),
    getVocalSection("It just might be you and me", 4, "together"),
    {
      name: "But it's okay",
      mode: { type: "once", beats: 10 },
      layers: [
        {
          effect: "cat-heart-hands",
          params: { every: 1, heartColor: HEART_PINK, beatOffset: -10 },
        },
        { effect: "vocal-scene", params: { ...vocalLayers, scene: "okay", hideAt: 9 } },
        {
          effect: "heart-wipe",
          params: { color: HEART_PINK, coverAt: 7.2, revealAt: 9, endAt: 10 },
        },
      ],
    },
  ],
};

const sprayReferences = { period: 8, ...getReferences(["perStep", "beatBurst", "power"]) };

const heartbeatTempos = [
  ["Bar", 4],
  ["Half bar", 2],
  ["Beat", 1],
  ["Eighth", 0.5],
] as const;

function getHeartbeatSections(extraLayers: (pulse: number) => LayerInput[]): SectionInput[] {
  return [
    ...heartbeatTempos.map(([name, interval], index) => ({
      name,
      mode: { type: "loop" as const, beats: 4 },
      layers: [
        {
          effect: "blood-heartbeat",
          params: {
            interval,
            previousInterval: heartbeatTempos[Math.max(0, index - 1)]?.[1] ?? interval,
            color: { param: "color" },
          },
        },
        ...extraLayers(4 / interval / 4),
      ],
    })),
    {
      name: "Flatline",
      mode: { type: "once", beats: 16 },
      layers: [
        {
          effect: "blood-heartbeat",
          params: { interval: 0.5, flatline: true, color: { param: "color" } },
        },
        ...extraLayers(0),
      ],
    },
  ];
}

const heartbeatColorParameter = getColorParameter("Fresh blood", {
  "Fresh blood": FRESH_BLOOD_COLOR,
  Green: GREEN,
});

const screamParameter = getValueParameter(
  "Scream",
  "screamEvery",
  { Beat: 1, "2 beats": 2, Bar: 4 },
  "Beat",
);

const bloodAnimations: Record<string, AnimationInput> = {
  "blood-drip": getLoop(
    "Blood drip",
    16,
    [{ effect: "blood-drip", params: getReferences(["count", "length", "band", "pool"]) }],
    [
      getParameter(
        "Intensity",
        {
          Light: { count: 8, length: 8, band: 2, pool: 1 },
          Medium: { count: 14, length: 10, band: 3, pool: 2 },
          Heavy: { count: 28, length: 16, band: 6, pool: 4 },
        },
        "Medium",
      ),
    ],
  ),
  "blood-splatter": getLoop(
    "Blood splatter",
    8,
    [
      {
        effect: "blood-splatter",
        params: { period: 8, ...getReferences(["every", "fade", "origin"]) },
      },
    ],
    [
      getParameter(
        "Rate",
        {
          "Every beat": { every: 1, fade: 4 },
          "Every 2 beats": { every: 2, fade: 6 },
          "Every bar": { every: 4, fade: 8 },
        },
        "Every beat",
      ),
      getValueParameter("Origin", "origin", { Random: "random", Center: "center" }, "Random"),
    ],
  ),
  "blood-explosion": getLoop(
    "Blood explosion",
    16,
    [{ effect: "blood-explosion", params: { period: 16, ...getReferences(["every"]) } }],
    [
      getValueParameter(
        "Rate",
        "every",
        { "Every bar": 4, "Every 2 bars": 8, "Every 4 bars": 16 },
        "Every bar",
      ),
    ],
  ),
  "blood-pool": {
    name: "Blood pool",
    sections: [
      {
        name: "Spread",
        mode: { type: "once", beats: 32 },
        layers: [{ effect: "blood-pool", params: { level: getRamp(0.05, 1, "easeOutCubic") } }],
      },
      {
        name: "Full",
        mode: { type: "loop", beats: 16 },
        layers: [{ effect: "blood-pool", params: { level: 1 } }],
      },
    ],
  },
  "bleeding-text": getLoop(
    "Bleeding text",
    16,
    [{ effect: "blood-text", params: getReferences(["text", "font", "offsetY", "shake"]) }],
    [
      getParameter(
        "Text",
        {
          RUN: { text: "RUN", font: "spleen-16x32", offsetY: -8 },
          DIE: { text: "DIE", font: "spleen-16x32", offsetY: -8 },
          "HELP ME": { text: "HELP\nME", font: "spleen-12x24", offsetY: -6 },
          "GET OUT": { text: "GET\nOUT", font: "spleen-12x24", offsetY: -6 },
        },
        "RUN",
      ),
      getValueParameter("Shake", "shake", { Off: 0, On: 1, Violent: 3 }, "Off"),
    ],
  ),
  veins: {
    name: "Veins",
    sections: [
      {
        name: "Creep",
        mode: { type: "once", beats: 16 },
        layers: [{ effect: "blood-veins", params: { growth: getRamp(0, 1) } }],
      },
      {
        name: "Pulse",
        mode: { type: "loop", beats: 8 },
        layers: [{ effect: "blood-veins" }],
      },
    ],
  },
  "blood-curtain": {
    name: "Blood curtain",
    sections: [
      {
        name: "Pour",
        mode: { type: "once", beats: 8 },
        layers: [{ effect: "blood-curtain", params: { level: getRamp(0, 1, "easeInQuad") } }],
      },
      {
        name: "Drain",
        mode: { type: "once", beats: 8 },
        layers: [{ effect: "blood-curtain", params: { level: getRamp(1, 2, "easeInQuad") } }],
      },
    ],
  },
  "blood-moon": {
    name: "Blood moon rising",
    sections: [
      {
        name: "Rise",
        mode: { type: "once", beats: 32 },
        layers: [{ effect: "blood-moon", params: { level: getRamp(0, 1) } }],
      },
      {
        name: "Full",
        mode: { type: "loop", beats: 16 },
        layers: [{ effect: "blood-moon" }],
      },
    ],
  },
  "heartbeat-monitor": {
    name: "Heartbeat monitor",
    parameters: [heartbeatColorParameter],
    sections: getHeartbeatSections(() => []),
  },
  "heartbeat-crt": {
    name: "Heartbeat monitor (CRT)",
    parameters: [heartbeatColorParameter],
    sections: getHeartbeatSections((pulse) => [
      { effect: "chromatic", params: { offset: 1, pulse } },
      { effect: "trails", params: { decay: 0.8 } },
    ]),
  },
  "seeping-ceiling": {
    name: "Seeping ceiling",
    sections: [
      {
        name: "Seep",
        mode: { type: "once", beats: 16 },
        layers: [
          { effect: "blood-seep", params: { level: getRamp(0, 1, "easeOutQuad"), drip: 0 } },
        ],
      },
      {
        name: "Swell",
        mode: { type: "once", beats: 16 },
        layers: [{ effect: "blood-seep", params: { drip: getRamp(0, 1) } }],
      },
      {
        name: "Hang",
        mode: { type: "loop", beats: 8 },
        layers: [{ effect: "blood-seep", params: { period: 8 } }],
      },
    ],
  },
  "bloody-handprints": {
    name: "Bloody handprints",
    sections: [
      {
        name: "Build",
        mode: { type: "once", beats: 32 },
        layers: [{ effect: "blood-handprints", params: { buildBeats: 32 } }],
      },
      {
        name: "Covered",
        mode: { type: "loop", beats: 8 },
        layers: [{ effect: "blood-handprints", params: { buildBeats: 32, hold: true } }],
      },
    ],
  },
  "rising-tide": {
    name: "Rising tide",
    sections: [
      {
        name: "Rise",
        mode: { type: "once", beats: 32 },
        layers: [{ effect: "blood-tide", params: { buildBeats: 32 } }],
      },
      {
        name: "Full",
        mode: { type: "loop", beats: 8 },
        layers: [{ effect: "blood-tide", params: { period: 8 } }],
      },
    ],
  },
  "tide-to-fountain": {
    name: "Rising tide into fountain",
    sections: [
      {
        name: "Rise",
        mode: { type: "once", beats: 32 },
        layers: [{ effect: "blood-tide", params: { buildBeats: 32, to: 0.95 } }],
      },
      {
        name: "Drop",
        mode: { type: "loop", beats: 8 },
        layers: [
          {
            effect: "blood-tide",
            params: { from: 0.95, to: 0.2, buildBeats: 1, stepBeats: 1, period: 8 },
          },
          {
            effect: "blood-fountain",
            params: { period: 8, perStep: 24, beatBurst: 40, intro: true },
          },
        ],
      },
    ],
  },
  "knife-slashes": {
    name: "Knife slashes",
    parameters: [
      getValueParameter(
        "Direction",
        "direction",
        { Diagonal: "diagonal", Down: "down", Horizontal: "horizontal", Cross: "cross" },
        "Diagonal",
      ),
      getValueParameter("Frenzy rate", "every", { Beat: 1, "1/8": 0.5, "2 beats": 2 }, "1/8"),
    ],
    sections: [
      {
        name: "Build",
        mode: { type: "once", beats: 32 },
        layers: [
          { effect: "blood-slash", params: { buildBeats: 32, ...getReferences(["direction"]) } },
        ],
      },
      {
        name: "Frenzy",
        mode: { type: "loop", beats: 8 },
        layers: [
          {
            effect: "blood-slash",
            params: { period: 8, ...getReferences(["direction", "every"]) },
          },
        ],
      },
    ],
  },
  "blood-countdown": {
    name: "Blood countdown",
    parameters: [
      getParameter(
        "Count",
        {
          "8 bars": { from: 8, beatsPerNumber: 4 },
          "4 x 2 bars": { from: 4, beatsPerNumber: 8 },
          "16 half bars": { from: 16, beatsPerNumber: 2 },
        },
        "8 bars",
      ),
    ],
    sections: [
      {
        name: "Count",
        mode: { type: "once", beats: 32 },
        layers: [{ effect: "blood-countdown", params: getReferences(["from", "beatsPerNumber"]) }],
      },
    ],
  },
  "vampire-bite": {
    name: "Vampire bite",
    sections: [
      {
        name: "Bite",
        mode: { type: "once", beats: 16 },
        layers: [{ effect: "blood-bite", params: { level: getRamp(0, 1) } }],
      },
      {
        name: "Pulse",
        mode: { type: "loop", beats: 4 },
        layers: [{ effect: "blood-bite" }],
      },
    ],
  },
  "screaming-face": getLoop(
    "Screaming face",
    8,
    [{ effect: "blood-scream", params: { period: 8, ...getReferences(["screamEvery"]) } }],
    [screamParameter],
  ),
  "screaming-face-strobe": getLoop(
    "Screaming face (strobe)",
    8,
    [
      {
        effect: "blood-scream",
        params: { period: 8, ...getReferences(["screamEvery", "strobeEvery"]) },
      },
    ],
    [
      screamParameter,
      getValueParameter("Strobe", "strobeEvery", { Beat: 1, "1/8": 0.5, "1/16": 0.25 }, "1/8"),
    ],
  ),
};

const bassBloodAnimations: Record<string, AnimationInput> = {
  "blood-fountain": getLoop(
    "Blood fountain",
    8,
    [
      {
        effect: "blood-fountain",
        params: { period: 8, ...getReferences(["emitters", "perStep", "power", "beatBurst"]) },
      },
    ],
    [
      getParameter(
        "Style",
        {
          Gush: { emitters: 1, perStep: 24, power: 1 },
          Twin: { emitters: 2, perStep: 16, power: 0.95 },
          Triple: { emitters: 3, perStep: 12, power: 0.9 },
          Torrent: { emitters: 1, perStep: 48, power: 1.1 },
        },
        "Gush",
      ),
      getValueParameter("Bursts", "beatBurst", { Off: 0, "On beat": 40 }, "Off"),
    ],
  ),
  "blood-wells": getLoop(
    "Blood gravity wells",
    16,
    [{ effect: "blood-wells", params: { period: 16, ...getReferences(["every", "wells"]) } }],
    [
      getValueParameter("Move every", "every", { Beat: 1, "2 beats": 2, Bar: 4 }, "2 beats"),
      getValueParameter("Wells", "wells", { One: 1, Two: 2, Three: 3, Four: 4 }, "Three"),
    ],
  ),
  "blood-vortex": getLoop(
    "Blood vortex",
    16,
    [{ effect: "blood-vortex", params: getReferences(["every"]) }],
    [getValueParameter("Drop every", "every", { Bar: 4, "2 bars": 8, "4 bars": 16 }, "Bar")],
  ),
  "blood-equalizer": getLoop(
    "Blood equalizer",
    16,
    [{ effect: "blood-equalizer", params: getReferences(["style"]) }],
    [equalizerStyleParameter],
  ),
  "blood-storm": getLoop(
    "Blood storm",
    8,
    [{ effect: "blood-storm", params: getReferences(["fallBeats", "drops"]) }],
    [
      getParameter(
        "Speed",
        {
          Slow: { fallBeats: 1, drops: 50 },
          Fast: { fallBeats: 0.5, drops: 70 },
          Faster: { fallBeats: 0.25, drops: 90 },
        },
        "Fast",
      ),
    ],
  ),
  "blood-shockwave": getLoop(
    "Blood shockwave",
    8,
    [{ effect: "blood-shockwave", params: { period: 8, ...getReferences(["perBeat"]) } }],
    [getValueParameter("Wobble", "perBeat", { Beat: 1, "1/8": 2, Triplet: 3, "1/16": 4 }, "Beat")],
  ),
  "blood-strobe": getLoop(
    "Blood strobe",
    8,
    [{ effect: "blood-strobe", params: { period: 8, ...getReferences(["every", "decay"]) } }],
    [
      getParameter(
        "Rate",
        {
          Beat: { every: 1, decay: 5 },
          "1/8": { every: 0.5, decay: 7 },
          "1/16": { every: 0.25, decay: 12 },
        },
        "1/8",
      ),
    ],
  ),
  "blood-splash": getLoop(
    "Blood rain splash",
    8,
    [{ effect: "blood-splash", params: { period: 8, ...getReferences(["every", "offbeats"]) } }],
    [
      getParameter(
        "Rate",
        {
          Beat: { every: 1, offbeats: true },
          "Beat (no offbeats)": { every: 1, offbeats: false },
          "Half time": { every: 2, offbeats: true },
        },
        "Beat",
      ),
    ],
  ),
  "pumping-heart": getLoop(
    "Pumping heart",
    8,
    [{ effect: "blood-heart", params: { period: 8, ...getReferences(["sprayEvery"]) } }],
    [getValueParameter("Spray", "sprayEvery", { "2 beats": 2, Beat: 1, Bar: 4 }, "2 beats")],
  ),
  "arterial-spray": getLoop(
    "Arterial spray",
    8,
    [
      {
        effect: "blood-arterial",
        params: { period: 8, ...getReferences(["sweepBeats", "pulseEvery"]) },
      },
    ],
    [
      getValueParameter("Sweep", "sweepBeats", { Bar: 4, "2 bars": 8 }, "Bar"),
      getValueParameter("Pulse", "pulseEvery", { Beat: 1, "1/8": 0.5 }, "Beat"),
    ],
  ),
  "blood-bubbles": getLoop(
    "Blood bubbles",
    8,
    [{ effect: "blood-bubbles", params: { period: 8, ...getReferences(["every"]) } }],
    [getValueParameter("Pop every", "every", { Beat: 1, "1/8": 0.5, "2 beats": 2 }, "Beat")],
  ),
  "splatter-tunnel": getLoop(
    "Splatter tunnel",
    8,
    [{ effect: "blood-tunnel", params: { period: 8, ...getReferences(["wallEvery"]) } }],
    [getValueParameter("Walls", "wallEvery", { Bar: 4, "2 bars": 8, Off: 0 }, "Bar")],
  ),
  "splatter-tunnel-kaleidoscope": getLoop(
    "Splatter tunnel (kaleidoscope)",
    8,
    [
      { effect: "blood-tunnel", params: { period: 8, ...getReferences(["wallEvery"]) } },
      { effect: "kaleidoscope", params: { segments: 6, rotations: 1 } },
    ],
    [getValueParameter("Walls", "wallEvery", { Bar: 4, "2 bars": 8, Off: 0 }, "Bar")],
  ),
  "blood-lava": getLoop(
    "Blood lava lamp",
    16,
    [{ effect: "blood-lava", params: { period: 16, ...getReferences(["kickEvery"]) } }],
    [getValueParameter("Kick", "kickEvery", { Beat: 1, "Half time": 2 }, "Half time")],
  ),
  "wall-slam": getLoop(
    "Wall slam",
    8,
    [{ effect: "blood-slam", params: { period: 8, ...getReferences(["every", "doubleHit"]) } }],
    [
      getValueParameter("Rate", "every", { Beat: 1, "Half time": 2 }, "Beat"),
      getValueParameter("Double hit", "doubleHit", { On: true, Off: false }, "On"),
    ],
  ),
  "blood-cymatics": getLoop(
    "Blood cymatics",
    32,
    [{ effect: "blood-cymatics", params: { period: 32, ...getReferences(["barBeats"]) } }],
    [getValueParameter("Change every", "barBeats", { Bar: 4, "2 bars": 8 }, "Bar")],
  ),
  chainsaw: getLoop(
    "Chainsaw",
    8,
    [{ effect: "blood-chainsaw", params: { period: 8, ...getReferences(["rate"]) } }],
    [getValueParameter("Rate", "rate", { "1/8": 2, "1/16": 4 }, "1/8")],
  ),
};

export const seedAnimations: Readonly<Record<string, AnimationInput>> = {
  ...getFolder("Basics", {
    plasma: getLoop(
      "Plasma",
      16,
      [
        { effect: "plasma", params: getReferences(["cycles", "scale"]) },
        {
          effect: "kaleidoscope",
          params: { segments: 8, rotations: 1, mix: { param: "kaleidoscopeMix" } },
        },
        { effect: "chromatic", params: { offset: { param: "chromaticOffset" }, pulse: 2 } },
      ],
      [
        getParameter(
          "Style",
          {
            Plain: { cycles: 1, scale: 1.2, kaleidoscopeMix: 0, chromaticOffset: 0 },
            Kaleidoscope: { cycles: 2, scale: 1.5, kaleidoscopeMix: 1, chromaticOffset: 1 },
          },
          "Plain",
        ),
      ],
    ),
    solid: getLoop(
      "Solid",
      1,
      [{ effect: "solid", params: { color: { param: "color" } } }],
      [getColorParameter("White", { Red: RED, ...SINGLE_COLORS })],
    ),
    strobe: getLoop(
      "Strobe",
      4,
      [
        {
          effect: "strobe",
          params: {
            color: { param: "color" },
            flashesPerBeat: { param: "flashesPerBeat" },
            duty: 0.2,
          },
        },
      ],
      [
        getColorParameter("White", SINGLE_COLORS),
        getValueParameter(
          "Speed",
          "flashesPerBeat",
          { "Quarter time": 0.25, "Half time": 0.5, Beat: 1, Double: 2, Quad: 4 },
          "Double",
        ),
      ],
    ),
    flash: getLoop(
      "Flash",
      32,
      [
        {
          effect: "color-flash",
          params: { ...paletteParams, ...getReferences(["flashesPerBeat", "duty", "fade"]) },
        },
      ],
      [
        getLightColorParameter("Orange"),
        getValueParameter("Speed", "flashesPerBeat", flashSpeeds, "Beat"),
        getParameter(
          "Style",
          {
            Hard: { duty: 0.5, fade: 0 },
            Short: { duty: 0.25, fade: 0 },
            Pulse: { duty: 1, fade: 1 },
          },
          "Hard",
        ),
      ],
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
            startColor: { param: "startColor" },
            endColor: { param: "endColor" },
          },
        },
      ],
      [getPairParameter("Pink/cyan", squarePairs)],
    ),
    "color-fade": getLoop(
      "Color fade",
      16,
      [{ effect: "color-fade", params: { ...paletteParams, beatsPerColor: 8 } }],
      [getLightColorParameter("Orange/purple", MULTI_PALETTES)],
    ),
    equalizer: getLoop(
      "Equalizer",
      16,
      [{ effect: "equalizer", params: { ...paletteParams, ...getReferences(["style"]) } }],
      [getLightColorParameter("Pastel"), equalizerStyleParameter],
    ),
    loading: getLoop(
      "Loading",
      4,
      [
        {
          effect: "loading",
          params: { color: { param: "color" }, textColor: { param: "textColor" } },
        },
      ],
      [loadingParameter],
    ),
  }),
  ...getFolder("Basics/Transitions", {
    split: getBackgroundLoop("Split", 32, "split", splitReferences, [
      getBackgroundColorParameter("Orange"),
      ...splitParameters,
    ]),
    "split-strobe": getBackgroundLoop(
      "Split with strobe",
      32,
      "split",
      splitReferences,
      [getBackgroundColorParameter("Purple"), ...splitParameters],
      [{ effect: "strobe", params: { flashesPerBeat: 4, duty: 0.15 }, blend: "add", opacity: 0.5 }],
    ),
    wipe: getBackgroundLoop(
      "Wipe",
      32,
      "wipe",
      { ...transitionReferences, ...getReferences(["direction"]) },
      [
        getBackgroundColorParameter("Orange/purple"),
        getValueParameter(
          "Direction",
          "direction",
          {
            Right: "right",
            Left: "left",
            Down: "down",
            Up: "up",
            Diagonal: "down-right",
            Clockwise: "clockwise",
            Counterclockwise: "counterclockwise",
          },
          "Right",
        ),
        transitionSpeedParameter,
        transitionMotionParameter,
      ],
    ),
  }),
  ...getFolder("Basics/Patterns", {
    checker: getBackgroundLoop("Checker", 16, "checker", getReferences(["size", "swapsPerBeat"]), [
      getBackgroundColorParameter("Orange/purple"),
      getValueParameter(
        "Size",
        "size",
        { Small: 4, Medium: 8, Large: 16, Quadrants: 32 },
        "Medium",
      ),
      getValueParameter(
        "Speed",
        "swapsPerBeat",
        { "Eighth time": 0.125, "Quarter time": 0.25, "Half time": 0.5, Beat: 1, Double: 2 },
        "Beat",
      ),
    ]),
    stripes: getBackgroundLoop(
      "Stripes",
      8,
      "stripes",
      getReferences(["angle", "width", "cycles"]),
      [
        getBackgroundColorParameter("Orange/purple"),
        getValueParameter(
          "Angle",
          "angle",
          {
            Diagonal: "diagonal",
            "Anti-diagonal": "anti-diagonal",
            Vertical: "vertical",
            Horizontal: "horizontal",
          },
          "Diagonal",
        ),
        getValueParameter("Width", "width", { Thin: 3, Medium: 6, Wide: 8 }, "Medium"),
        getValueParameter("Speed", "cycles", { Slow: 1, Medium: 2, Fast: 4 }, "Slow"),
      ],
    ),
    rings: getBackgroundLoop("Rings", 8, "rings", getReferences(["shape", "width", "cycles"]), [
      getBackgroundColorParameter("Green"),
      getValueParameter(
        "Shape",
        "shape",
        { Circle: "circle", Square: "square", Diamond: "diamond" },
        "Circle",
      ),
      getValueParameter("Width", "width", { Thin: 3, Medium: 5, Wide: 8 }, "Medium"),
      getValueParameter(
        "Motion",
        "cycles",
        { "In fast": -2, In: -1, Out: 1, "Out fast": 2 },
        "In fast",
      ),
    ]),
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
        {
          name: "Arrive",
          mode: { type: "once", beats: 16 },
          layers: [{ effect: "cat-pair-spawn", params: { cats: "black" } }],
        },
        { name: "Stare", mode: { type: "loop", beats: 32 }, layers: [{ effect: "cat" }] },
        { name: "Spawn", mode: { type: "once", beats: 16 }, layers: [{ effect: "cat-spawn" }] },
        { name: "Bounce", mode: { type: "loop", beats: 16 }, layers: [{ effect: "cat-bounce" }] },
      ],
    },
    "cat-hyperspace": {
      name: "Cat hyperspace",
      parameters: [
        getLightColorParameter("White"),
        hyperspaceSpeedParameter,
        hyperspaceOrbitParameter,
      ],
      sections: [
        {
          name: "Spawn",
          mode: { type: "once", beats: 16 },
          layers: [hyperspaceLayer, { effect: "cat-pair-spawn" }],
        },
        {
          name: "Hyperspace",
          mode: { type: "loop", beats: 16 },
          layers: [
            hyperspaceLayer,
            {
              effect: "cat-hyperspace",
              params: getReferences(["orbits", "turns"]),
            },
          ],
        },
      ],
    },
    "cat-explosion": {
      name: "Cat explosion",
      parameters: [
        getParameter(
          "Spray",
          {
            Steady: { perStep: 24, beatBurst: 0, power: 0.9 },
            Pulse: { perStep: 12, beatBurst: 48, power: 1 },
            Gush: { perStep: 44, beatBurst: 0, power: 1.1 },
          },
          "Pulse",
        ),
      ],
      sections: [
        {
          name: "Spawn",
          mode: { type: "once", beats: 16 },
          layers: [{ effect: "cat-pair-spawn" }],
        },
        {
          name: "Explode",
          mode: { type: "once", beats: 8 },
          layers: [
            { effect: "cat-explode" },
            {
              effect: "cat-blood-spray",
              params: {
                ...sprayReferences,
                stains: false,
                intensity: {
                  keyframes: [
                    { at: 0, value: 0 },
                    { at: 0.5, value: 0, easing: "easeOutCubic" },
                    { at: 1, value: 1 },
                  ],
                },
              },
            },
          ],
        },
        {
          name: "Spray",
          mode: { type: "loop", beats: 8 },
          layers: [{ effect: "cat-blood-spray", params: sprayReferences }],
        },
      ],
    },
    "cat-headbang": getLoop(
      "Cat headbang",
      8,
      [{ effect: "cat-dance", params: { move: "headbang", ...getReferences(["offbeat"]) } }],
      [getValueParameter("Sync", "offbeat", { Together: false, Alternating: true }, "Together")],
    ),
    "cat-dance": getLoop(
      "Cat dance",
      16,
      [{ effect: "cat-dance", params: getReferences(["move", "offbeat"]) }],
      [
        getValueParameter(
          "Move",
          "move",
          {
            Sway: "sway",
            Hop: "hop",
            "Paws up": "paws-up",
            Twist: "twist",
            Conga: "conga",
            Twerk: "twerk",
          },
          "Sway",
        ),
        getValueParameter("Sync", "offbeat", { Together: false, Alternating: true }, "Together"),
      ],
    ),
    "cat-wiggle": getLoop(
      "Cat wiggle",
      8,
      [{ effect: "cat-dance", params: { move: "wiggle", ...getReferences(["offbeat"]) } }],
      [getValueParameter("Sync", "offbeat", { Together: false, Alternating: true }, "Alternating")],
    ),
    "cat-twerk": getLoop(
      "Cat twerk",
      8,
      [{ effect: "cat-dance", params: { move: "twerk", ...getReferences(["offbeat"]) } }],
      [getValueParameter("Sync", "offbeat", { Together: false, Alternating: true }, "Together")],
    ),
    "cat-hype": getLoop(
      "Cat hype",
      8,
      [
        {
          effect: "cat-hype",
          params: getReferences(["slamsPerBeat"]),
        },
      ],
      [getValueParameter("Speed", "slamsPerBeat", { Hype: 1, Hyper: 2, Frenzy: 4 }, "Hyper")],
    ),
    "cat-racecar": getLoop(
      "Cat racecar",
      8,
      [{ effect: "cat-racecar", params: getReferences(["every"]) }],
      [getValueParameter("Bounce", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat")],
    ),
    "cat-wands": getLoop(
      "Cat wand duel",
      16,
      [
        {
          effect: "cat-wands",
          params: {
            ...getReferences(["every", "tabbyMagicColor", "magicColor"]),
          },
        },
      ],
      [
        getValueParameter("Clash", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat"),
        getParameter(
          "Magic",
          {
            "Fire vs poison": { tabbyMagicColor: "#ff5a1e", magicColor: "#3cff50" },
            "Ice vs pink": { tabbyMagicColor: CYAN, magicColor: PINK },
            "Gold vs purple": { tabbyMagicColor: "#ffd030", magicColor: PURPLE },
            "Pink vs purple": { tabbyMagicColor: PINK, magicColor: PURPLE },
          },
          "Fire vs poison",
        ),
      ],
    ),
    "cat-space": getLoop(
      "Cat astronauts",
      32,
      [{ effect: "cat-space", params: getReferences(["every"]) }],
      [getValueParameter("Twinkle", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat")],
    ),
    "cat-laptop": getLoop(
      "Cat laptop jam",
      8,
      [{ effect: "cat-laptop", params: getReferences(["every", "cat"]) }],
      [
        getValueParameter("Bounce", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat"),
        catChoiceParameter,
      ],
    ),
    "cat-cyberspace": {
      name: "Cat cyberspace",
      parameters: [
        getValueParameter("Pulse", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat"),
        catChoiceParameter,
      ],
      sections: [
        {
          name: "Sucked in",
          mode: { type: "once", beats: 16 },
          layers: [
            {
              effect: "cat-laptop-portal",
              params: getReferences(["every", "cat"]),
            },
          ],
        },
        {
          name: "Cyberspace",
          mode: { type: "loop", beats: 8 },
          layers: [
            {
              effect: "cat-cyberspace",
              params: getReferences(["every", "cat"]),
            },
          ],
        },
      ],
    },
    "cat-call-me": {
      name: "Cat call me maybe",
      parameters: [
        getValueParameter(
          "Message",
          "message",
          {
            "Call me?": "CALL ME?",
            "Hey you": "HEY YOU",
            "Hi cutie": "HI CUTIE",
            "Maybe?": "MAYBE?",
          },
          "Call me?",
        ),
        getValueParameter("Pulse", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat"),
        getValueParameter(
          "Cats",
          "sender",
          { "Tabby → Black": "tabby", "Black → Tabby": "black" },
          "Tabby → Black",
        ),
      ],
      sections: [
        getCatPhoneSection("Typing", { type: "once", beats: 48 }, "typing"),
        getCatPhoneSection("Send", { type: "once", beats: 8 }, "send"),
        getCatPhoneSection("Buzz", { type: "once", beats: 8 }, "buzz"),
        getCatPhoneSection("Joy", { type: "loop", beats: 8 }, "joy"),
      ],
    },
    "cat-mimic": getLoop(
      "Cat in a mimic",
      8,
      [{ effect: "cat-mimic", params: getReferences(["every", "cat"]) }],
      [
        getValueParameter("Chomp", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat"),
        catChoiceParameter,
      ],
    ),
    "cat-bench": getLoop(
      "Cat bench press",
      8,
      [{ effect: "cat-bench", params: getReferences(["every", "cat"]) }],
      [liftTempoParameter, catChoiceParameter],
    ),
    "cat-squat": getLoop(
      "Cat squat",
      8,
      [{ effect: "cat-squat", params: getReferences(["every", "cat"]) }],
      [liftTempoParameter, catChoiceParameter],
    ),
    "cat-jam": getLoop(
      "Cat jam",
      8,
      [{ effect: "cat-jam", params: getReferences(["every"]) }],
      [getValueParameter("Bob", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat")],
    ),
    "chrome-cat-roll": getLoop(
      "Chrome cat roll",
      16,
      [
        { effect: "cat-roll", params: getReferences(["beatsPerRoll"]) },
        { effect: "trails", params: getReferences(["decay"]) },
      ],
      [
        getValueParameter("Speed", "beatsPerRoll", { Lazy: 8, Roll: 4, Hyper: 2 }, "Roll"),
        getValueParameter("Trail", "decay", { Off: 0, Short: 0.6, Long: 0.85 }, "Short"),
      ],
    ),
    "cat-hunters": getLoop("Cat hunters", 32, [
      { effect: "demon-hunters", params: { players: "cats" } },
    ]),
  }),
  ...getFolder("Cats/Halloween", {
    "witch-cats": getLoop("Witch cats", 16, [{ effect: "cat-broom" }]),
    "ghost-cats": getLoop("Ghost cats", 16, [
      { effect: "cat-eyes", params: { count: 3, glow: 0.15 }, opacity: 0.5 },
      { effect: "cat-ghosts" },
    ]),
    "cat-eyes": getLoop("Eyes in the dark", 32, [{ effect: "cat-eyes" }]),
  }),
  ...getFolder("Love", {
    "love-hearts": getLoop(
      "Heart pulse",
      8,
      [
        {
          effect: "heart-pulse",
          params: {
            ...getReferences(["every"]),
            color: { param: "heartColor" },
            backgroundColor: "#000000",
            rings: 0,
          },
        },
        {
          effect: "heart-float",
          params: { ...getReferences(["every"]), color: { param: "heartColor" } },
        },
      ],
      [lovePulseParameter, loveColorParameter],
    ),
    "love-heart-zoom": getLoop(
      "Heart zoom",
      8,
      [
        {
          effect: "heart-zoom",
          params: {
            ...getReferences(["every", "speed", "backgroundColor"]),
            color: { param: "heartColor" },
          },
        },
      ],
      [lovePulseParameter, loveColorParameter, heartZoomSpeedParameter],
    ),
    "love-heart-zoom-outline": getLoop(
      "Heart zoom outlined",
      8,
      [
        {
          effect: "heart-zoom",
          params: {
            ...getReferences(["every", "speed", "backgroundColor"]),
            color: { param: "heartColor" },
            outline: 1.5,
          },
        },
      ],
      [lovePulseParameter, loveColorParameter, heartZoomSpeedParameter],
    ),
    "love-heart-zoom-steady": getLoop(
      "Heart zoom (steady)",
      8,
      [
        {
          effect: "heart-zoom",
          params: {
            ...getReferences(["every", "speed", "backgroundColor"]),
            color: { param: "heartColor" },
            motion: "steady",
            flash: 0.35,
            ripple: 1,
          },
        },
      ],
      [lovePulseParameter, loveColorParameter, heartZoomSpeedParameter],
    ),
    "love-heart-zoom-outline-steady": getLoop(
      "Heart zoom outlined (steady)",
      8,
      [
        {
          effect: "heart-zoom",
          params: {
            ...getReferences(["every", "speed", "backgroundColor"]),
            color: { param: "heartColor" },
            outline: 1.5,
            motion: "steady",
            swell: 1.5,
          },
        },
      ],
      [lovePulseParameter, loveColorParameter, heartZoomSpeedParameter],
    ),
    "love-heart-grid": getLoop(
      "Heart grid",
      8,
      [
        {
          effect: "heart-grid",
          params: {
            ...getReferences(["every", "wave", "scroll", "backgroundColor"]),
            color: { param: "heartColor" },
          },
        },
      ],
      [
        getValueParameter(
          "Wave",
          "wave",
          { Ripple: "ripple", Diagonal: "diagonal", Checker: "checker" },
          "Ripple",
        ),
        getValueParameter("Scroll", "scroll", { Still: 0, Drift: 2 }, "Drift"),
        lovePulseParameter,
        loveColorParameter,
      ],
    ),
    "love-heartbeat": getLoop(
      "Heartbeat monitor",
      8,
      [
        {
          effect: "heart-ecg",
          params: {
            ...getReferences(["every", "backgroundColor"]),
            color: { param: "heartColor" },
          },
        },
      ],
      [lovePulseParameter, loveColorParameter],
    ),
    "love-heart-tunnel": getLoop(
      "Heart tunnel",
      8,
      [
        {
          effect: "heart-tunnel",
          params: {
            ...getReferences(["every", "backgroundColor"]),
            color: { param: "heartColor" },
          },
        },
      ],
      [lovePulseParameter, loveColorParameter],
    ),
    "love-heart-tunnel-steady": getLoop(
      "Heart tunnel (steady)",
      8,
      [
        {
          effect: "heart-tunnel",
          params: {
            ...getReferences(["every", "backgroundColor"]),
            color: { param: "heartColor" },
            motion: "steady",
            spin: 0.35,
            pop: 0.4,
          },
        },
      ],
      [lovePulseParameter, loveColorParameter],
    ),
    "love-equalizer": getLoop(
      "Heart equalizer",
      16,
      [
        {
          effect: "heart-equalizer",
          params: {
            ...getReferences(["every"]),
            color: { param: "heartColor" },
          },
        },
      ],
      [lovePulseParameter, loveColorParameter],
    ),
    "love-cat-dance": getLoop(
      "Lovestruck cat dance",
      16,
      [
        loveFloatLayer,
        {
          effect: "cat-dance",
          params: {
            ...getReferences(["move", "offbeat", "eyes", "heartColor"]),
            size: 12,
            spacing: 30,
          },
        },
      ],
      [
        getValueParameter(
          "Move",
          "move",
          {
            Sway: "sway",
            Hop: "hop",
            "Paws up": "paws-up",
            Wiggle: "wiggle",
            Headbang: "headbang",
          },
          "Sway",
        ),
        getValueParameter(
          "Eyes",
          "eyes",
          { Hearts: "hearts", Happy: "happy", Open: "open" },
          "Hearts",
        ),
        getValueParameter("Sync", "offbeat", { Together: false, Alternating: true }, "Together"),
        lovePulseParameter,
        loveColorParameter,
      ],
    ),
    "cat-heart-hands": getLoop(
      "Cat heart hands",
      8,
      [
        {
          effect: "cat-heart-hands",
          params: getReferences(["every", "heartColor"]),
        },
      ],
      [lovePulseParameter, loveColorParameter],
    ),
    "cat-kiss": getLoop(
      "Cat smooch",
      16,
      [
        {
          effect: "cat-kiss",
          params: getReferences(["every", "heartColor"]),
        },
      ],
      [lovePulseParameter, loveColorParameter],
    ),
    "hero-love": getLoop(
      "Frieren and Himmel love",
      16,
      [loveFloatLayer, { effect: "hero-dance", params: getReferences(["move", "sync"]) }],
      [
        getValueParameter(
          "Move",
          "move",
          { Sway: "sway", Twist: "twist", Headbang: "headbang" },
          "Sway",
        ),
        heroSyncParameter,
        lovePulseParameter,
        loveColorParameter,
      ],
    ),
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
    "huntrix-headbang": getLoop(
      "Huntrix headbang",
      8,
      [{ effect: "hunter-dance", params: { move: "headbang", ...getReferences(["sync"]) } }],
      [hunterSyncParameter],
    ),
    "huntrix-dance": getLoop(
      "Huntrix dance",
      16,
      [{ effect: "hunter-dance", params: getReferences(["move", "sync"]) }],
      [
        getValueParameter(
          "Move",
          "move",
          {
            Sway: "sway",
            Jump: "jump",
            "Fist pump": "pump",
            Twist: "twist",
            Point: "point",
          },
          "Sway",
        ),
        hunterSyncParameter,
      ],
    ),
    "huntrix-hyperspace": getLoop(
      "Huntrix hyperspace",
      16,
      [
        hyperspaceLayer,
        { effect: "hunter-hyperspace", params: getReferences(["orbits", "turns"]) },
      ],
      [getLightColorParameter("White"), hyperspaceSpeedParameter, hyperspaceOrbitParameter],
    ),
  }),
  ...getFolder("Frieren", {
    "frieren-mimic": getLoop(
      "Frieren in a mimic",
      8,
      [{ effect: "frieren-mimic", params: getReferences(["every"]) }],
      [getValueParameter("Chomp", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat")],
    ),
    "himmel-bench": getLoop(
      "Himmel bench press",
      8,
      [{ effect: "himmel-bench", params: getReferences(["every"]) }],
      [liftTempoParameter],
    ),
    "himmel-squat": getLoop(
      "Himmel squat",
      8,
      [{ effect: "himmel-squat", params: getReferences(["every"]) }],
      [liftTempoParameter],
    ),
    "himmel-sleep": getLoop("Himmel sleeping", 16, [{ effect: "himmel-sleep" }]),
    "frieren-himmel-headbang": getLoop(
      "Frieren and Himmel headbang",
      8,
      [{ effect: "hero-dance", params: { move: "headbang", ...getReferences(["sync"]) } }],
      [heroSyncParameter],
    ),
    "frieren-himmel-dance": getLoop(
      "Frieren and Himmel dance",
      16,
      [{ effect: "hero-dance", params: getReferences(["move", "sync"]) }],
      [
        getValueParameter(
          "Move",
          "move",
          {
            Sway: "sway",
            Jump: "jump",
            "Fist pump": "pump",
            Twist: "twist",
            Point: "point",
          },
          "Sway",
        ),
        heroSyncParameter,
      ],
    ),
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
    "vampire-laugh": {
      name: "Vampire laugh",
      sections: [
        {
          mode: { type: "loop", beats: 16 },
          layers: [
            {
              effect: "vampire-mouth",
              params: {
                pose: 1,
                laugh: 1,
                snap: false,
                bloodColor: "#800010",
                dripFrom: "fangs",
                drips: 2,
                scale: 1,
                spray: 8,
                sprayBurst: 48,
              },
              antialias: true,
            },
          ],
        },
      ],
    },
    "jack-o-lantern": getLoop(
      "Jack-o'-lantern",
      32,
      [{ effect: "pumpkin", params: { cyclesX: 3, cyclesY: 4, color: { param: "color" } } }],
      [
        getColorParameter("Pumpkin", {
          Pumpkin: PUMPKIN,
          Purple: PURPLE,
          Green: GREEN,
          White: WHITE,
          Pink: PINK,
          Blood: BLOOD_COLOR,
          "Fresh blood": FRESH_BLOOD_COLOR,
        }),
      ],
    ),
    "pumpkin-dance": getLoop(
      "Pumpkin dance",
      16,
      [{ effect: "pumpkin-dance", params: getReferences(["move", "count", "size", "sync"]) }],
      [
        getValueParameter(
          "Move",
          "move",
          { Kick: "kick", Spin: "spin", Jig: "jig", Headbang: "headbang" },
          "Kick",
        ),
        getParameter(
          "Lineup",
          {
            Solo: { count: 1, size: 18 },
            Trio: { count: 3, size: 12 },
          },
          "Solo",
        ),
        getValueParameter(
          "Sync",
          "sync",
          { Together: "together", Alternating: "alternate", Wave: "wave" },
          "Together",
        ),
      ],
    ),
    "skeleton-dance": getLoop(
      "Skeleton dance",
      16,
      [{ effect: "skeleton-dance", params: getReferences(["move", "count", "size", "sync"]) }],
      [
        getValueParameter(
          "Move",
          "move",
          { Jig: "jig", Rattle: "rattle", Charleston: "charleston", "Head toss": "toss" },
          "Jig",
        ),
        getParameter(
          "Lineup",
          {
            Solo: { count: 1, size: 20 },
            Trio: { count: 3, size: 13 },
          },
          "Solo",
        ),
        getValueParameter(
          "Sync",
          "sync",
          { Together: "together", Alternating: "alternate", Wave: "wave" },
          "Together",
        ),
      ],
    ),
    "doot-doot": getLoop(
      "Doot doot",
      16,
      [{ effect: "skull-doot", params: getReferences(["pattern", "count"]) }],
      [
        getValueParameter(
          "Pattern",
          "pattern",
          { "Doot doot": "doot-doot", "Every beat": "beat", Offbeat: "offbeat", Gallop: "gallop" },
          "Doot doot",
        ),
        getValueParameter("Horns", "count", { Solo: 1, Trio: 3 }, "Solo"),
      ],
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
  ...getFolder("Halloween/Blood", bloodAnimations),
  ...getFolder("Halloween/Blood/Bass", bassBloodAnimations),
  ...getFolder("One-offs", { rumble, "vocal-planet-dying": vocalPlanetDying }),
};

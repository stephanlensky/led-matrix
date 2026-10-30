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
const PASTEL_BLUE = "#8fd8ff";
const PASTEL_PURPLE = "#c39bff";
const PASTEL_GREEN = "#9cffb0";
const MINT = "#40ffa8";
const GOLD = "#ffc828";
const BLUE = "#3c70ff";
const ORCHID = "#d040ff";
const AQUA = "#20e8ff";
const TANGERINE = "#ff7a1a";
const YELLOW = "#ffe600";
const BRAT = "#8ace00";
const MAGENTA = "#ff00ff";

type Palette = readonly [string, ...string[]];

type Options = Readonly<Record<string, Record<string, unknown>>>;

const SINGLE_PALETTES: Readonly<Record<string, Palette>> = {
  Red: [RED],
  Orange: [ORANGE],
  Tangerine: [TANGERINE],
  Pumpkin: [PUMPKIN],
  Gold: [GOLD],
  Yellow: [YELLOW],
  Purple: [PURPLE],
  Orchid: [ORCHID],
  Magenta: [MAGENTA],
  Green: [GREEN],
  Mint: [MINT],
  Cyan: [CYAN],
  Aqua: [AQUA],
  Blue: [BLUE],
  "Ice blue": [ICE],
  White: [WHITE],
  "Hot pink": [PINK],
  Pink: [HEART_PINK],
  "Light pink": [LIGHT_PINK],
  "Pastel pink": [PASTEL_PINK],
  "Pastel blue": [PASTEL_BLUE],
  "Pastel purple": [PASTEL_PURPLE],
  "Pastel green": [PASTEL_GREEN],
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
  "Mint/gold": [MINT, GOLD],
  Pastel: [PASTEL_PINK, PASTEL_BLUE, PASTEL_PURPLE, PASTEL_GREEN],
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

const PAIR_PALETTES = Object.fromEntries(
  Object.entries(MULTI_PALETTES).filter(([, palette]) => palette.length === 2),
);

function getWithMissingOptions<T>(
  options: Readonly<Record<string, T>>,
  palettes: Readonly<Record<string, Palette>>,
  getOption: (palette: Palette) => T,
): Record<string, T> {
  return {
    ...options,
    ...Object.fromEntries(
      Object.entries(palettes)
        .filter(([name]) => !(name in options))
        .map(([name, palette]) => [name, getOption(palette)]),
    ),
  };
}

const FLASH_COLORS: Readonly<Record<string, string>> = { ...SINGLE_COLORS, Black: BLACK };

const FLASH_COLOR_KEYS = ["A", "B", "C", "D"] as const;

function getFlashColorParameters(defaultColor: string): Parameter[] {
  return FLASH_COLOR_KEYS.map((key, index) =>
    index === 0
      ? getValueParameter(`Color ${key}`, `color${key}`, FLASH_COLORS, defaultColor)
      : getValueParameter(`Color ${key}`, `color${key}`, { None: "none", ...FLASH_COLORS }, "None"),
  );
}

const flashColorParams = getReferences(FLASH_COLOR_KEYS.map((key) => `color${key}`));

const VEIN_COLORS = getWithMissingOptions(
  { Blood: "#7a0614", Cyan: "#0080b4", Blue: "#2646b4", Green: "#269800" },
  SINGLE_PALETTES,
  ([color]) => getDimColor(color, 0.7),
);

const danceSpeedParameter = getValueParameter(
  "Speed",
  "speed",
  { "Half time": 0.5, Normal: 1, "Double time": 2 },
  "Normal",
);

function getGustParameter(gust: number): Parameter {
  return getParameter(
    "Gust",
    {
      Off: { every: 1, gust: 0 },
      Beat: { every: 1, gust },
      "2 beats": { every: 2, gust },
      "4 beats": { every: 4, gust },
    },
    "2 beats",
  );
}

function getInkStyleParameter(defaultOption: string): Parameter {
  return getParameter(
    "Style",
    {
      "White on black": { ink: WHITE, paper: "none" },
      "Black on white": { ink: BLACK, paper: WHITE },
      "Green on black": { ink: "#40ff60", paper: "none" },
      "Blue on white": { ink: "#1040ff", paper: WHITE },
    },
    defaultOption,
  );
}

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
    Object.entries(SINGLE_COLORS).map(([name, color]) => [
      name,
      { color, textColor: getDimColor(color, 0.48) },
    ]),
  ),
  "Red",
);

const squarePairs = getWithMissingOptions<Palette>(
  {
    "Pink/cyan": [PINK, CYAN],
    "Pink/purple": [PINK, PURPLE],
    Pinks: [PINK, LIGHT_PINK],
    "Orange/purple": [ORANGE, PURPLE],
    "Green/purple": [GREEN, PURPLE],
    "White/orange": [WHITE, ORANGE],
    Ice: [WHITE, ICE],
    Blood: [FRESH_BLOOD_COLOR, DRIED_BLOOD_COLOR],
  },
  { ...PAIR_PALETTES, ...SINGLE_PALETTES },
  (palette) => palette,
);

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
  "cat-headbang",
  "cat-wiggle",
  "cat-twerk",
  "huntrix-headbang",
  "frieren-himmel-headbang",
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
        params: { ...getReferences(["every", "message", "sender", "background"]), scene },
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

const backgroundParameter = getValueParameter(
  "Background",
  "background",
  { Off: false, On: true },
  "Off",
);

const lovePulseParameter = getValueParameter(
  "Pulse",
  "every",
  { "Half beat": 0.5, Beat: 1, "2 beats": 2 },
  "Beat",
);

const loveColorParameter = getParameter(
  "Hearts",
  getWithMissingOptions(
    {
      Pink: { heartColor: HEART_PINK, backgroundColor: "#2a0418" },
      "Hot pink": { heartColor: PINK, backgroundColor: "#2a0014" },
      "Light pink": { heartColor: LIGHT_PINK, backgroundColor: "#2a0a18" },
      Red: { heartColor: "#ff1030", backgroundColor: "#240006" },
      Purple: { heartColor: ORCHID, backgroundColor: "#16052a" },
      Cyan: { heartColor: AQUA, backgroundColor: "#021a20" },
      Blue: { heartColor: BLUE, backgroundColor: "#040a2a" },
      Mint: { heartColor: MINT, backgroundColor: "#021a10" },
      Gold: { heartColor: GOLD, backgroundColor: "#201402" },
      Orange: { heartColor: TANGERINE, backgroundColor: "#200a02" },
      White: { heartColor: "#f0f0ff", backgroundColor: "#141420" },
    },
    SINGLE_PALETTES,
    ([heartColor]) => ({ heartColor, backgroundColor: getDimColor(heartColor, 0.14) }),
  ),
  "Pink",
);

const slowDanceLayer: LayerInput = {
  effect: "hero-slow-dance",
  params: getReferences(["turn", "every", "heartColor"]),
};

const catLoveMoveParameter = getValueParameter(
  "Move",
  "move",
  {
    Sway: "sway",
    Hop: "hop",
    "Paws up": "paws-up",
    Wiggle: "wiggle",
    Headbang: "headbang",
    Twerk: "twerk",
    "Front twerk": "front-twerk",
    "Booty shake": "booty-shake",
  },
  "Sway",
);

const heroLoveMoveParameter = getValueParameter(
  "Move",
  "move",
  {
    Sway: "sway",
    Twist: "twist",
    Headbang: "headbang",
    Twerk: "twerk",
    "Front twerk": "front-twerk",
    "Booty shake": "booty-shake",
  },
  "Sway",
);

const loveEyesParameter = getValueParameter(
  "Eyes",
  "eyes",
  { Hearts: "hearts", Happy: "happy", Open: "open" },
  "Hearts",
);

function getBloodHeartOption([heartColor]: Palette): Record<string, string> {
  return { heartColor, bloodColor: "#c00014", backgroundColor: getDimColor(heartColor, 0.06) };
}

const bleedingColorParameter = getParameter(
  "Hearts",
  getWithMissingOptions(
    {
      Pink: { heartColor: HEART_PINK, bloodColor: "#c00014", backgroundColor: "#100003" },
      "Hot pink": { heartColor: PINK, bloodColor: FRESH_BLOOD_COLOR, backgroundColor: "#120002" },
      "Light pink": { heartColor: LIGHT_PINK, bloodColor: "#a00010", backgroundColor: "#0e0204" },
      Blood: { heartColor: FRESH_BLOOD_COLOR, bloodColor: BLOOD_COLOR, backgroundColor: BLACK },
    },
    SINGLE_PALETTES,
    getBloodHeartOption,
  ),
  "Pink",
);

function getBleedingLoop(
  name: string,
  beats: number,
  effect: string,
  params: Record<string, unknown> = {},
  parameters: Parameter[] = [lovePulseParameter],
): AnimationInput {
  return getLoop(
    name,
    beats,
    [
      {
        effect,
        params: {
          ...getReferences(["bloodColor", "background", "backgroundColor"]),
          color: { param: "heartColor" },
          ...params,
        },
      },
    ],
    [...parameters, bleedingColorParameter, backgroundParameter],
  );
}

const bloodHeartColorParameter = getParameter(
  "Hearts",
  getWithMissingOptions(
    {
      "Fresh blood": {
        heartColor: FRESH_BLOOD_COLOR,
        bloodColor: BLOOD_COLOR,
        backgroundColor: "#120002",
      },
      Blood: { heartColor: "#a00008", bloodColor: FRESH_BLOOD_COLOR, backgroundColor: "#0a0000" },
      "Dried blood": { heartColor: "#6a0a06", bloodColor: "#a00010", backgroundColor: BLACK },
      Pink: { heartColor: HEART_PINK, bloodColor: "#c00014", backgroundColor: "#100003" },
    },
    SINGLE_PALETTES,
    getBloodHeartOption,
  ),
  "Fresh blood",
);

const dripsParameter = getParameter(
  "Drips",
  {
    Off: { dripCount: 0, dripLength: 9, dripPool: 0 },
    Light: { dripCount: 10, dripLength: 9, dripPool: 0 },
    Heavy: { dripCount: 22, dripLength: 16, dripPool: 3 },
  },
  "Light",
);

const bloodDripsLayer: LayerInput = {
  effect: "blood-drips",
  params: {
    color: { param: "bloodColor" },
    count: { param: "dripCount" },
    length: { param: "dripLength" },
    pool: { param: "dripPool" },
  },
};

function getBloodyLoop(
  name: string,
  love: AnimationInput,
  overrides: Record<string, unknown> = {},
): AnimationInput {
  return {
    name,
    parameters: [
      ...(love.parameters ?? []).filter((parameter) => parameter.name !== "Hearts"),
      bloodHeartColorParameter,
      dripsParameter,
    ],
    sections: love.sections.map((section) => ({
      ...section,
      layers: [
        ...section.layers.map((layer) => ({ ...layer, params: { ...layer.params, ...overrides } })),
        bloodDripsLayer,
      ],
    })),
  };
}

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

const tamagotchiShellParameter = getValueParameter(
  "Shell",
  "shellColor",
  getWithMissingOptions(
    { Pink: "#ff4fa8", Cyan: "#20c8ff", Purple: "#9a4dff", White: "#e8e8f0" },
    SINGLE_PALETTES,
    ([color]) => color,
  ),
  "Pink",
);

const tamagotchiPulseParameter = getValueParameter(
  "Pulse",
  "every",
  { Beat: 1, "Half beat": 0.5, "2 beats": 2 },
  "Beat",
);

const tamagotchiTwinkleLayer: LayerInput = { effect: "tamagotchi-twinkle" };

const tamagotchiCalmLayer: LayerInput = {
  effect: "tamagotchi",
  params: getReferences(["shellColor"]),
};

const tamagotchiRageLayers: LayerInput[] = [
  { effect: "tamagotchi-burst", params: getReferences(["every"]) },
  { effect: "tamagotchi", params: { ...getReferences(["shellColor", "every"]), anger: 1 } },
  { effect: "chromatic", params: { offset: 0.5, pulse: 2 } },
];

const tamagotchiLyricsLayers: LayerInput[] = [
  { effect: "tamagotchi-burst", params: { every: 1, y: 32, radius: 14, veins: 4 } },
  { effect: "word-slam" },
];

const tamagotchiSong: AnimationInput = {
  name: "Fuck tamagotchis",
  parameters: [tamagotchiShellParameter, tamagotchiPulseParameter],
  sections: [
    {
      name: "Calm",
      mode: { type: "loop", beats: 16 },
      layers: [tamagotchiTwinkleLayer, tamagotchiCalmLayer],
    },
    {
      name: "Build",
      mode: { type: "once", beats: 16 },
      layers: [
        { effect: "tamagotchi-twinkle", params: { amount: getRamp(1, 0) } },
        {
          effect: "tamagotchi-burst",
          params: { rays: 0, sparks: 0, veins: 0, every: 2, rings: getRamp(0, 1, "easeInQuad") },
        },
        {
          effect: "tamagotchi",
          params: { ...getReferences(["shellColor"]), anger: getRamp(0, 1, "easeInQuad") },
        },
      ],
    },
    { name: "Rage", mode: { type: "loop", beats: 8 }, layers: tamagotchiRageLayers },
    {
      name: "Fuck tamagotchis, bitch",
      mode: { type: "loop", beats: 4 },
      layers: tamagotchiLyricsLayers,
    },
  ],
};

const tamagotchiAnimations: Record<string, AnimationInput> = {
  "tamagotchi-calm": getLoop(
    "Tamagotchi calm",
    16,
    [tamagotchiTwinkleLayer, tamagotchiCalmLayer],
    [tamagotchiShellParameter],
  ),
  "tamagotchi-rage": getLoop("Tamagotchi rage", 8, tamagotchiRageLayers, [
    tamagotchiShellParameter,
    tamagotchiPulseParameter,
  ]),
  "tamagotchi-lyrics": getLoop("Fuck tamagotchis, bitch", 4, tamagotchiLyricsLayers),
  "tamagotchi-song": tamagotchiSong,
};

const explosionEveryParameter = getValueParameter(
  "Every",
  "every",
  { Beat: 1, "2 beats": 2, "4 beats": 4 },
  "2 beats",
);

const explosionAnimations: Record<string, AnimationInput> = {
  "explosion-fireball": getLoop(
    "Fireball",
    4,
    [{ effect: "explosion", params: getReferences(["every"]) }],
    [explosionEveryParameter],
  ),
  "explosion-ground": getLoop(
    "Ground blast",
    4,
    [{ effect: "explosion", params: { ...getReferences(["every"]), grounded: true, size: 26 } }],
    [explosionEveryParameter],
  ),
  "explosion-chain": getLoop("Chain reaction", 4, [
    {
      effect: "explosion",
      params: { every: 4, count: 4, scatter: 1, size: 17, length: 1.1, embers: 18 },
    },
  ]),
  "explosion-barrage": getLoop("Barrage", 4, [
    {
      effect: "explosion",
      params: { every: 4, count: 8, scatter: 1, size: 13, length: 1, embers: 12 },
    },
  ]),
  "mushroom-cloud": getLoop("Mushroom cloud", 4, [
    { effect: "mushroom-cloud", params: { every: 4 } },
  ]),
};

const troubleWaveform: AnimationInput = {
  name: "Trouble sub drop",
  parameters: [getColorParameter("Red", SINGLE_COLORS)],
  sections: [
    {
      mode: { type: "once", beats: 5 },
      layers: [{ effect: "sub-drop", params: getReferences(["color"]) }],
    },
  ],
};

const smpteBars: AnimationInput = {
  name: "SMPTE bars",
  sections: [
    { name: "Bars", mode: { type: "loop", beats: 8 }, layers: [{ effect: "smpte-bars" }] },
    {
      name: "Melt",
      mode: { type: "once", beats: 32 },
      layers: [{ effect: "smpte-bars", params: { melt: getRamp(0, 1) } }],
    },
  ],
};

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
    getVocalSection("But if we don't try, what the fuck is stopping us", 6, "shrug"),
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
          effect: "hero-heart-hands",
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
            background: { param: "background" },
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
          params: {
            interval: 0.5,
            flatline: true,
            color: { param: "color" },
            background: { param: "background" },
          },
        },
        ...extraLayers(0),
      ],
    },
  ];
}

const heartbeatColorParameter = getColorParameter(
  "Fresh blood",
  getWithMissingOptions(
    { "Fresh blood": FRESH_BLOOD_COLOR, Green: GREEN },
    SINGLE_PALETTES,
    ([color]) => color,
  ),
);

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
    parameters: [getColorParameter("Blood", VEIN_COLORS)],
    sections: [
      {
        name: "Creep",
        mode: { type: "once", beats: 16 },
        layers: [
          { effect: "blood-veins", params: { growth: getRamp(0, 1), color: { param: "color" } } },
        ],
      },
      {
        name: "Pulse",
        mode: { type: "loop", beats: 8 },
        layers: [{ effect: "blood-veins", params: { color: { param: "color" } } }],
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
    parameters: [heartbeatColorParameter, backgroundParameter],
    sections: getHeartbeatSections(() => []),
  },
  "heartbeat-crt": {
    name: "Heartbeat monitor (CRT)",
    parameters: [heartbeatColorParameter, backgroundParameter],
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

const heroMoveParameter = getValueParameter(
  "Move",
  "move",
  {
    Sway: "sway",
    Headbang: "headbang",
    Jump: "jump",
    "Fist pump": "pump",
    Twist: "twist",
    Point: "point",
    Twerk: "twerk",
    "Front twerk": "front-twerk",
    "Booty shake": "booty-shake",
  },
  "Sway",
);

const SPOTLIGHT_PALETTES: Readonly<Record<string, Palette>> = {
  Blues: [BLUE, CYAN, ICE],
  "Blue/ice": [BLUE, ICE],
  "Cyan/blue": [CYAN, BLUE],
  "Deep blue": ["#2646b4", BLUE],
  "Blue/white": [BLUE, WHITE],
  "Blue/purple": [BLUE, PURPLE],
  ...PALETTES,
};

const CLUB_PALETTES: Readonly<Record<string, Palette>> = {
  Club: ["#ff2fd0", CYAN, GOLD, "#7a40ff"],
  Brat: [BRAT],
  "Brat/white": [BRAT, WHITE],
  "Brat/pink": [BRAT, PINK],
  "Brat/purple": [BRAT, PURPLE],
  "Brat/cyan": [BRAT, CYAN],
  "Brat/gold": [BRAT, GOLD],
  "Brat greens": [BRAT, GREEN, MINT],
  "Brat club": [BRAT, PINK, WHITE, GREEN],
};

function getHeroSolo(name: string, hero: string): AnimationInput {
  return getLoop(
    name,
    16,
    [
      loveFloatLayer,
      {
        effect: "hero-dance",
        params: {
          ...getReferences(["move", "speed", "eyes", "heartColor"]),
          dancers: hero,
          size: 18,
        },
      },
    ],
    [
      heroLoveMoveParameter,
      danceSpeedParameter,
      loveEyesParameter,
      lovePulseParameter,
      loveColorParameter,
    ],
  );
}

const loveAnimations: Readonly<Record<string, AnimationInput>> = {
  "love-hearts": getLoop(
    "Heart pulse",
    8,
    [
      {
        effect: "heart-pulse",
        params: {
          ...getReferences(["every"]),
          color: { param: "heartColor" },
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
          ...getReferences(["every", "speed", "background", "backgroundColor"]),
          color: { param: "heartColor" },
        },
      },
    ],
    [lovePulseParameter, loveColorParameter, backgroundParameter, heartZoomSpeedParameter],
  ),
  "love-heart-zoom-outline": getLoop(
    "Heart zoom outlined",
    8,
    [
      {
        effect: "heart-zoom",
        params: {
          ...getReferences(["every", "speed", "background", "backgroundColor"]),
          color: { param: "heartColor" },
          outline: 1.5,
        },
      },
    ],
    [lovePulseParameter, loveColorParameter, backgroundParameter, heartZoomSpeedParameter],
  ),
  "love-heart-zoom-steady": getLoop(
    "Heart zoom (steady)",
    8,
    [
      {
        effect: "heart-zoom",
        params: {
          ...getReferences(["every", "speed", "background", "backgroundColor"]),
          color: { param: "heartColor" },
          motion: "steady",
          flash: 0.35,
          ripple: 1,
        },
      },
    ],
    [lovePulseParameter, loveColorParameter, backgroundParameter, heartZoomSpeedParameter],
  ),
  "love-heart-zoom-outline-steady": getLoop(
    "Heart zoom outlined (steady)",
    8,
    [
      {
        effect: "heart-zoom",
        params: {
          ...getReferences(["every", "speed", "background", "backgroundColor"]),
          color: { param: "heartColor" },
          outline: 1.5,
          motion: "steady",
          swell: 1.5,
        },
      },
    ],
    [lovePulseParameter, loveColorParameter, backgroundParameter, heartZoomSpeedParameter],
  ),
  "love-heart-grid": getLoop(
    "Heart grid",
    8,
    [
      {
        effect: "heart-grid",
        params: {
          ...getReferences(["every", "wave", "scroll", "background", "backgroundColor"]),
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
      backgroundParameter,
    ],
  ),
  "love-heartbeat": getLoop(
    "Heartbeat monitor",
    8,
    [
      {
        effect: "heart-ecg",
        params: {
          ...getReferences(["every", "background", "backgroundColor"]),
          color: { param: "heartColor" },
        },
      },
    ],
    [lovePulseParameter, loveColorParameter, backgroundParameter],
  ),
  "love-heart-tunnel": getLoop(
    "Heart tunnel",
    8,
    [
      {
        effect: "heart-tunnel",
        params: {
          ...getReferences(["every", "background", "backgroundColor"]),
          color: { param: "heartColor" },
        },
      },
    ],
    [lovePulseParameter, loveColorParameter, backgroundParameter],
  ),
  "love-heart-tunnel-steady": getLoop(
    "Heart tunnel (steady)",
    8,
    [
      {
        effect: "heart-tunnel",
        params: {
          ...getReferences(["every", "background", "backgroundColor"]),
          color: { param: "heartColor" },
          motion: "steady",
          spin: 0.35,
          pop: 0.4,
        },
      },
    ],
    [lovePulseParameter, loveColorParameter, backgroundParameter],
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
          ...getReferences(["move", "speed", "offbeat", "eyes", "heartColor"]),
          size: 12,
          spacing: 30,
        },
      },
    ],
    [
      catLoveMoveParameter,
      danceSpeedParameter,
      loveEyesParameter,
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
  "cat-gasp": getLoop(
    "Cat gasp",
    10,
    [{ effect: "cat-gasp", params: getReferences(["cat", "every"]) }],
    [
      getValueParameter("Cat", "cat", { Tabby: "tabby", Black: "black" }, "Tabby"),
      lovePulseParameter,
    ],
  ),
  "hero-heart-hands": getLoop(
    "Frieren and Himmel heart hands",
    8,
    [{ effect: "hero-heart-hands", params: getReferences(["every", "heartColor"]) }],
    [lovePulseParameter, loveColorParameter],
  ),
  "hero-kiss": getLoop(
    "Frieren and Himmel smooch",
    16,
    [{ effect: "hero-kiss", params: getReferences(["every", "heartColor"]) }],
    [lovePulseParameter, loveColorParameter],
  ),
  "hero-love": getLoop(
    "Frieren and Himmel love",
    16,
    [
      loveFloatLayer,
      {
        effect: "hero-dance",
        params: getReferences(["move", "speed", "sync", "eyes", "heartColor"]),
      },
    ],
    [
      heroLoveMoveParameter,
      danceSpeedParameter,
      loveEyesParameter,
      heroSyncParameter,
      lovePulseParameter,
      loveColorParameter,
    ],
  ),
  "love-cat-laptop": getLoop(
    "Lovestruck cat laptop",
    8,
    [
      {
        effect: "cat-laptop",
        params: {
          ...getReferences(["every", "cat", "eyes", "heartColor", "screen"]),
          headphonesColor: { param: "heartColor" },
          particles: "hearts",
          desk: "edge",
        },
      },
    ],
    [
      getValueParameter("Cat", "cat", { Black: "black", Tabby: "tabby" }, "Black"),
      getValueParameter("Screen", "screen", { Heart: "heart", Equalizer: "equalizer" }, "Heart"),
      loveEyesParameter,
      lovePulseParameter,
      loveColorParameter,
    ],
  ),
  "love-cat-laptop-duo": getLoop(
    "Lovestruck cats laptop",
    8,
    [
      {
        effect: "cat-laptop-duo",
        params: getReferences(["every", "eyes", "heartColor", "secondHeartColor", "swap"]),
      },
    ],
    [
      getParameter(
        "Hearts",
        getWithMissingOptions(
          {},
          { ...PAIR_PALETTES, ...SINGLE_PALETTES },
          ([heartColor, secondHeartColor = heartColor]) => ({ heartColor, secondHeartColor }),
        ),
        "Pink/cyan",
      ),
      getValueParameter("Swap", "swap", { Off: false, On: true }, "Off"),
      loveEyesParameter,
      lovePulseParameter,
    ],
  ),
  "hero-laptop": getLoop(
    "Frieren and Himmel laptop love",
    8,
    [
      {
        effect: "hero-laptop",
        params: getReferences(["hero", "view", "screen", "every", "eyes", "heartColor"]),
      },
    ],
    [
      getValueParameter("Character", "hero", { Frieren: "frieren", Himmel: "himmel" }, "Frieren"),
      getValueParameter("View", "view", { Front: "front", Side: "side" }, "Front"),
      getValueParameter("Screen", "screen", { Heart: "heart", Equalizer: "equalizer" }, "Heart"),
      loveEyesParameter,
      lovePulseParameter,
      loveColorParameter,
    ],
  ),
  "hero-slow-dance": {
    name: "Frieren and Himmel slow dance",
    parameters: [
      getValueParameter("Turn", "turn", { "2 bars": 8, "4 bars": 16 }, "2 bars"),
      lovePulseParameter,
      loveColorParameter,
    ],
    sections: [
      {
        name: "Wipe",
        mode: { type: "once", beats: 2 },
        layers: [
          {
            effect: "heart-wipe",
            params: { color: { param: "heartColor" }, coverAt: 0, revealAt: 2, endAt: 3 },
          },
        ],
      },
      {
        name: "Reveal",
        mode: { type: "once", beats: 16 },
        layers: [
          slowDanceLayer,
          {
            effect: "heart-wipe",
            params: { color: { param: "heartColor" }, coverAt: 0, revealAt: 0, endAt: 1.2 },
          },
        ],
      },
      { name: "Dance", mode: { type: "loop", beats: 16 }, layers: [slowDanceLayer] },
    ],
  },
  "frieren-heart-magic": getLoop(
    "Frieren heart magic",
    16,
    [
      {
        effect: "frieren-heart-magic",
        params: { ...getReferences(["every", "eyes", "heartColor", "flowers"]), loop: 16 },
      },
    ],
    [
      getValueParameter("Flowers", "flowers", { On: true, Off: false }, "On"),
      getValueParameter(
        "Eyes",
        "eyes",
        { Happy: "happy", Hearts: "hearts", Open: "open" },
        "Happy",
      ),
      lovePulseParameter,
      loveColorParameter,
    ],
  ),
  "cat-balloons": getLoop(
    "Cat heart balloons",
    16,
    [{ effect: "cat-balloons", params: getReferences(["cat", "every", "eyes", "heartColor"]) }],
    [
      getValueParameter("Cat", "cat", { Black: "black", Tabby: "tabby" }, "Black"),
      loveEyesParameter,
      lovePulseParameter,
      loveColorParameter,
    ],
  ),
  "cat-balloon-meet": {
    name: "Cat heart balloons meet",
    parameters: [
      getValueParameter("Cat", "cat", { Black: "black", Tabby: "tabby" }, "Black"),
      loveEyesParameter,
      lovePulseParameter,
      loveColorParameter,
    ],
    sections: [
      {
        name: "Meet",
        mode: { type: "once", beats: 16 },
        layers: [
          {
            effect: "cat-balloon-meet",
            params: { ...getReferences(["cat", "every", "eyes", "heartColor"]), phase: "meet" },
          },
        ],
      },
      {
        name: "Together",
        mode: { type: "loop", beats: 16 },
        layers: [
          {
            effect: "cat-balloon-meet",
            params: {
              ...getReferences(["cat", "every", "eyes", "heartColor"]),
              phase: "together",
            },
          },
        ],
      },
    ],
  },
  "frieren-love-solo": getHeroSolo("Frieren love solo", "frieren"),
  "himmel-love-solo": getHeroSolo("Himmel love solo", "himmel"),
  "love-cat-solo": getLoop(
    "Lovestruck cat solo",
    16,
    [
      loveFloatLayer,
      {
        effect: "cat-dance",
        params: { ...getReferences(["move", "speed", "eyes", "heartColor", "dancers"]), size: 14 },
      },
    ],
    [
      catLoveMoveParameter,
      getValueParameter("Cat", "dancers", { Black: "black", Tabby: "tabby" }, "Black"),
      danceSpeedParameter,
      loveEyesParameter,
      lovePulseParameter,
      loveColorParameter,
    ],
  ),
};

const nyanCatParameter = getValueParameter(
  "Cat",
  "cat",
  { Original: "original", Black: "black", Tabby: "tabby" },
  "Original",
);

const nyanSpeedParameter = getValueParameter(
  "Speed",
  "speed",
  { "Half time": 0.5, Normal: 1, "Double time": 2 },
  "Normal",
);

const nyanBackgroundParameter = getValueParameter(
  "Background",
  "background",
  { Black: BLACK, "Classic navy": "#003366" },
  "Black",
);

const nyanRiderParameter = getValueParameter(
  "Rider",
  "rider",
  { Frieren: "frieren", Himmel: "himmel", Both: "both" },
  "Frieren",
);

const nyanPulseParameter = getValueParameter(
  "Pulse",
  "every",
  { "Half beat": 0.5, Beat: 1, "2 beats": 2 },
  "Beat",
);

function getNyanLoop(
  name: string,
  effect: string,
  keys: readonly string[],
  parameters: Parameter[],
  params: Record<string, unknown> = {},
  beats = 16,
): AnimationInput {
  return getLoop(
    name,
    beats,
    [{ effect, params: { ...getReferences(["cat", ...keys]), ...params } }],
    [nyanCatParameter, ...parameters],
  );
}

const nyanAnimations: Readonly<Record<string, AnimationInput>> = {
  "nyan-cat": getNyanLoop(
    "Nyan cat",
    "nyan-cat",
    ["size", "background", "speed"],
    [
      getValueParameter("Size", "size", { Classic: 1, Big: 2 }, "Classic"),
      nyanBackgroundParameter,
      nyanSpeedParameter,
    ],
  ),
  "nyan-cyberspace": getNyanLoop(
    "Nyan cyberspace",
    "nyan-cyberspace",
    ["sky", "every", "glitch"],
    [
      getValueParameter("Background", "sky", { Sky: true, Black: false }, "Sky"),
      nyanPulseParameter,
      getValueParameter("Glitch", "glitch", { On: true, Off: false }, "On"),
    ],
  ),
  "nyan-squad": getNyanLoop(
    "Nyan squad",
    "nyan-squad",
    ["wingmen"],
    [getValueParameter("Wingmen", "wingmen", { Full: "full", Mini: "mini" }, "Full")],
  ),
  "nyan-pixel-riders": getNyanLoop(
    "Nyan riders (pixel)",
    "nyan-pixel-riders",
    ["rider", "pose"],
    [
      nyanRiderParameter,
      getValueParameter("Pose", "pose", { Pump: "pump", Sit: "sit", Cheer: "cheer" }, "Pump"),
    ],
  ),
  "nyan-mesh-riders": getNyanLoop(
    "Nyan riders (3D)",
    "nyan-mesh-riders",
    ["rider", "pose"],
    [
      nyanRiderParameter,
      getValueParameter("Pose", "pose", { Sit: "sit", Cheer: "cheer", Surf: "surf" }, "Sit"),
    ],
  ),
  "nyan-head-riders": getNyanLoop(
    "Nyan riders (big heads)",
    "nyan-head-riders",
    ["rider", "pose"],
    [
      nyanRiderParameter,
      getValueParameter("Pose", "pose", { Pump: "pump", Hold: "hold", Cheer: "cheer" }, "Pump"),
    ],
  ),
  "nyan-nostalgia": getNyanLoop(
    "Nyan nostalgia",
    "nyan-nostalgia",
    ["scene"],
    [
      getValueParameter(
        "Scene",
        "scene",
        {
          Tour: "tour",
          Minecraft: "minecraft",
          "Flappy Bird": "flappy",
          Emoticons: "emoji",
          Doge: "doge",
          "Angry Birds": "angry",
        },
        "Tour",
      ),
    ],
    {},
    80,
  ),
  "nyan-hardstyle": {
    name: "Nyan hardstyle drop",
    parameters: [
      nyanCatParameter,
      getValueParameter("Strobe", "strobe", { On: 0.85, Soft: 0.4, Off: 0 }, "On"),
      getValueParameter("Kick", "every", { Beat: 1, "Half beat": 0.5 }, "Beat"),
    ],
    sections: [
      {
        name: "Build",
        mode: { type: "once", beats: 16 },
        layers: [
          {
            effect: "nyan-hardstyle",
            params: { ...getReferences(["cat", "strobe", "every"]), phase: "build" },
          },
        ],
      },
      {
        name: "Drop",
        mode: { type: "loop", beats: 4 },
        layers: [
          {
            effect: "nyan-hardstyle",
            params: { ...getReferences(["cat", "strobe", "every"]), phase: "drop" },
          },
        ],
      },
    ],
  },
  "nyan-stampede": getNyanLoop(
    "Nyan stampede",
    "nyan-stampede",
    ["mix", "count", "flash"],
    [
      getValueParameter("Mix", "mix", { "All cats": true, "Selected cat": false }, "All cats"),
      getValueParameter("Count", "count", { Swarm: 14, Mega: 28, Few: 7 }, "Swarm"),
      getValueParameter("Flash", "flash", { "Every bar": 0.8, Off: 0 }, "Every bar"),
    ],
  ),
  "nyan-bounce": getNyanLoop("Nyan DVD bounce", "nyan-bounce", [], []),
  "nyan-wave": getNyanLoop("Nyan rainbow wave", "nyan-wave", ["every"], [nyanPulseParameter]),
  "nyan-vortex": getNyanLoop(
    "Nyan vortex",
    "nyan-vortex",
    ["spin", "shape", "every"],
    [
      getValueParameter("Spin", "spin", { "Every beat": 1, Flip: 2, Off: 0 }, "Every beat"),
      getValueParameter("Shape", "shape", { Square: "square", Circle: "circle" }, "Square"),
      nyanPulseParameter,
    ],
  ),
  "nyan-glitch": getNyanLoop(
    "Nyan glitch",
    "nyan-glitch",
    ["intensity"],
    [getValueParameter("Intensity", "intensity", { Low: 0.35, Medium: 0.7, High: 1 }, "Medium")],
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
      [getColorParameter("White", SINGLE_COLORS)],
    ),
    strobe: getLoop(
      "Strobe",
      4,
      [
        {
          effect: "color-flash",
          params: {
            ...flashColorParams,
            flashesPerBeat: { param: "flashesPerBeat" },
            duty: 1,
            singleColorDuty: 0.2,
            fade: 0,
          },
        },
      ],
      [
        ...getFlashColorParameters("White"),
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
          params: {
            ...flashColorParams,
            ...getReferences(["flashesPerBeat", "duty", "fade", "reverse"]),
          },
        },
      ],
      [
        ...getFlashColorParameters("Orange"),
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
        getValueParameter("Phase", "reverse", { Normal: false, Reverse: true }, "Normal"),
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
    "cat-dance": getLoop(
      "Cat dance",
      16,
      [{ effect: "cat-dance", params: getReferences(["move", "speed", "offbeat"]) }],
      [
        getValueParameter(
          "Move",
          "move",
          {
            Sway: "sway",
            Headbang: "headbang",
            Hop: "hop",
            "Paws up": "paws-up",
            Twist: "twist",
            Conga: "conga",
            Wiggle: "wiggle",
            Twerk: "twerk",
            "Front twerk": "front-twerk",
            "Booty shake": "booty-shake",
          },
          "Sway",
        ),
        danceSpeedParameter,
        getValueParameter("Sync", "offbeat", { Together: false, Alternating: true }, "Together"),
      ],
    ),
    "cat-hype": getLoop(
      "Cat hype",
      16,
      [
        {
          effect: "cat-hype",
          params: getReferences([
            "slamsPerBeat",
            "counterColor",
            "pulse",
            "objects",
            "objectColor",
            "objectSpeed",
          ]),
        },
      ],
      [
        getValueParameter("Speed", "slamsPerBeat", { Hype: 1, Hyper: 2, Frenzy: 4 }, "Hyper"),
        getValueParameter(
          "Table color",
          "counterColor",
          { Teal: "#2a8c8c", ...SINGLE_COLORS },
          "Teal",
        ),
        getValueParameter(
          "Table pulse",
          "pulse",
          { Off: 0, Soft: 0.3, Pulse: 0.6, Hard: 1 },
          "Pulse",
        ),
        getValueParameter(
          "Objects",
          "objects",
          { None: "none", Hearts: "hearts", Notes: "notes", Stars: "stars", Mixed: "mixed" },
          "None",
        ),
        getValueParameter("Object color", "objectColor", SINGLE_COLORS, "Hot pink"),
        getValueParameter("Object speed", "objectSpeed", { Slow: 8, Fast: 16 }, "Slow"),
      ],
    ),
    "cat-chase": getLoop(
      "Cat chase",
      16,
      [
        {
          effect: "cat-chase",
          params: getReferences(["heartColor", "every", "laps", "reverse"]),
        },
      ],
      [
        loveColorParameter,
        lovePulseParameter,
        getValueParameter("Speed", "laps", { Slow: 1, Normal: 2, Fast: 3 }, "Normal"),
        getValueParameter(
          "Reverse",
          "reverse",
          { "Every 2 bars": true, Off: false },
          "Every 2 bars",
        ),
      ],
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
          getWithMissingOptions(
            {
              "Fire vs poison": { tabbyMagicColor: "#ff5a1e", magicColor: "#3cff50" },
              "Ice vs pink": { tabbyMagicColor: CYAN, magicColor: PINK },
              "Gold vs purple": { tabbyMagicColor: "#ffd030", magicColor: PURPLE },
              "Pink vs purple": { tabbyMagicColor: PINK, magicColor: PURPLE },
            },
            PAIR_PALETTES,
            ([tabbyMagicColor, magicColor]) => ({ tabbyMagicColor, magicColor }),
          ),
          "Fire vs poison",
        ),
      ],
    ),
    "cat-space": getLoop(
      "Cat astronauts",
      32,
      [{ effect: "cat-space", params: getReferences(["every", "background"]) }],
      [
        getValueParameter("Twinkle", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat"),
        backgroundParameter,
      ],
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
          {
            "Tabby → Black": "tabby",
            "Black → Tabby": "black",
            "Frieren → Himmel": "frieren",
            "Himmel → Frieren": "himmel",
          },
          "Tabby → Black",
        ),
        backgroundParameter,
      ],
      sections: [
        getCatPhoneSection("Typing", { type: "once", beats: 48 }, "typing"),
        getCatPhoneSection("Send", { type: "once", beats: 8 }, "send"),
        getCatPhoneSection("Buzz", { type: "once", beats: 8 }, "buzz"),
        getCatPhoneSection("Joy", { type: "loop", beats: 8 }, "joy"),
        getCatPhoneSection("Arrive", { type: "once", beats: 8 }, "arrive"),
        getCatPhoneSection("Duet", { type: "loop", beats: 8 }, "duet"),
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
  ...getFolder("Nyan cat", nyanAnimations),
  ...getFolder("Cats/Halloween", {
    "witch-cats": getLoop("Witch cats", 16, [{ effect: "cat-broom" }]),
    "ghost-cats": getLoop("Ghost cats", 16, [
      { effect: "cat-eyes", params: { count: 3, glow: 0.15 }, opacity: 0.5 },
      { effect: "cat-ghosts" },
    ]),
    "cat-eyes": getLoop("Eyes in the dark", 32, [{ effect: "cat-eyes" }]),
  }),
  ...getFolder("Love", loveAnimations),
  ...getFolder("Love/Bleeding", {
    ...Object.fromEntries(
      Object.entries({
        "love-heart-zoom": "Bloody heart zoom",
        "love-heart-zoom-outline": "Bloody heart zoom outlined",
        "love-heart-zoom-steady": "Bloody heart zoom (steady)",
        "love-heart-grid": "Bloody heart grid",
        "love-heartbeat": "Bloody heartbeat monitor",
        "love-heart-tunnel": "Bloody heart tunnel",
        "love-heart-tunnel-steady": "Bloody heart tunnel (steady)",
        "love-equalizer": "Bloody heart equalizer",
      }).flatMap(([id, name]) => {
        const love = loveAnimations[id];
        const overrides = id === "love-heartbeat" ? { traceColor: "#ff4050" } : {};
        const bloody = love ? getBloodyLoop(name, love, overrides) : undefined;
        return bloody ? [[`bloody-${id.replace(/^love-/, "")}`, bloody]] : [];
      }),
    ),
    "rotten-heart": getLoop(
      "Rotten heart pulse",
      8,
      [
        {
          effect: "heart-corrupt",
          params: { ...getReferences(["every", "background"]), style: "rotten" },
        },
      ],
      [lovePulseParameter, backgroundParameter],
    ),
    "glitch-heart": getLoop(
      "Glitched heart pulse",
      8,
      [
        {
          effect: "heart-corrupt",
          params: { ...getReferences(["every", "background"]), style: "glitch" },
        },
      ],
      [lovePulseParameter, backgroundParameter],
    ),
    "raw-heart": getLoop(
      "Raw heart pulse",
      8,
      [
        {
          effect: "heart-corrupt",
          params: { ...getReferences(["every", "background"]), style: "raw" },
        },
      ],
      [lovePulseParameter, backgroundParameter],
    ),
    "void-heart": getLoop(
      "Void heart pulse",
      8,
      [
        {
          effect: "heart-corrupt",
          params: { ...getReferences(["every", "background"]), style: "void" },
        },
      ],
      [lovePulseParameter, backgroundParameter],
    ),
    "bleeding-heart": getBleedingLoop("Bleeding heart", 8, "heart-bleed", getReferences(["every"])),
    heartbreak: getBleedingLoop("Heartbreak", 8, "heart-break", {}, []),
    "melting-heart": getBleedingLoop(
      "Melting heart",
      8,
      "heart-melt",
      getReferences(["every", "speed"]),
      [lovePulseParameter, heartZoomSpeedParameter],
    ),
    flatline: getBleedingLoop("Flatline", 16, "heart-flatline", {}, []),
    "cupids-arrow": getBleedingLoop("Cupid's arrow", 4, "heart-arrow", getReferences(["every"])),
    "heart-rain": getBleedingLoop("Heart rain", 8, "heart-rain", getReferences(["every"])),
    "heart-burst": getBleedingLoop("Heart grid burst", 16, "heart-burst", getReferences(["every"])),
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
    "huntrix-dance": getLoop(
      "Huntrix dance",
      16,
      [{ effect: "hunter-dance", params: getReferences(["move", "speed", "sync"]) }],
      [
        getValueParameter(
          "Move",
          "move",
          {
            Sway: "sway",
            Headbang: "headbang",
            Jump: "jump",
            "Fist pump": "pump",
            Twist: "twist",
            Point: "point",
            Twerk: "twerk",
            "Front twerk": "front-twerk",
            "Booty shake": "booty-shake",
          },
          "Sway",
        ),
        danceSpeedParameter,
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
    "hero-desk": getLoop(
      "Frieren and Himmel sad at desk",
      8,
      [{ effect: "hero-desk", params: getReferences(["hero", "every", "rain"]) }],
      [
        getValueParameter("Character", "hero", { Frieren: "frieren", Himmel: "himmel" }, "Frieren"),
        getValueParameter("Pulse", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat"),
        getValueParameter("Rain", "rain", { Off: 0, Light: 3, Heavy: 8 }, "Light"),
      ],
    ),
    "hero-week": {
      name: "Frieren and Himmel too slow",
      parameters: [
        getValueParameter(
          "Characters",
          "waiter",
          { "Himmel waits, Frieren slow": "himmel", "Frieren waits, Himmel slow": "frieren" },
          "Himmel waits, Frieren slow",
        ),
        loveColorParameter,
        backgroundParameter,
      ],
      sections: [
        {
          mode: { type: "once", beats: 64 },
          layers: [
            {
              effect: "hero-week",
              params: getReferences(["waiter", "heartColor", "background"]),
            },
          ],
        },
      ],
    },
    "character-select": {
      name: "Character select",
      parameters: [
        getValueParameter(
          "Character",
          "selected",
          {
            Frieren: "frieren",
            Himmel: "himmel",
            Zoey: "zoey",
            Rumi: "rumi",
            Mira: "mira",
            "Tabby cat": "tabby",
            "Black cat": "black",
          },
          "Frieren",
        ),
        getParameter(
          "Colors",
          getWithMissingOptions(
            {
              "Gold and cyan": { arrowColor: "#ffd030", sparkColor: "#3cdcff" },
              "Pink and cyan": { arrowColor: "#ff3cb4", sparkColor: "#3cdcff" },
              "Green and violet": { arrowColor: "#40ff80", sparkColor: "#a050ff" },
            },
            PAIR_PALETTES,
            ([arrowColor, sparkColor]) => ({ arrowColor, sparkColor }),
          ),
          "Gold and cyan",
        ),
      ],
      sections: [
        {
          name: "Search",
          mode: { type: "once", beats: 32 },
          layers: [
            {
              effect: "character-select",
              params: getReferences(["selected", "arrowColor", "sparkColor"]),
            },
          ],
        },
        {
          name: "Selected",
          mode: { type: "loop", beats: 4 },
          layers: [
            {
              effect: "character-select",
              params: {
                ...getReferences(["selected", "arrowColor", "sparkColor"]),
                stage: "victory",
              },
            },
          ],
        },
      ],
    },
    "club-crowd": getLoop(
      "Club crowd",
      16,
      [
        {
          effect: "club-crowd",
          params: {
            ...paletteParams,
            ...getReferences(["move", "speed", "beams", "discoBall"]),
          },
        },
      ],
      [
        getValueParameter(
          "Move",
          "move",
          {
            Mixed: "mixed",
            Headbang: "headbang",
            Sway: "sway",
            Jump: "jump",
            "Fist pump": "pump",
            Twist: "twist",
            Point: "point",
          },
          "Mixed",
        ),
        danceSpeedParameter,
        getLightColorParameter("Club", { ...CLUB_PALETTES, ...SPOTLIGHT_PALETTES }),
        getValueParameter("Beams", "beams", { "3": 3, "4": 4, "6": 6 }, "4"),
        getValueParameter("Disco ball", "discoBall", { On: true, Off: false }, "On"),
      ],
    ),
    "hero-band": getLoop(
      "Frieren and Himmel band",
      16,
      [
        {
          effect: "hero-band",
          params: getReferences(["singer", "background", "lightColor", "noteColor"]),
        },
      ],
      [
        getValueParameter(
          "Characters",
          "singer",
          { "Himmel sings, Frieren guitar": "himmel", "Frieren sings, Himmel guitar": "frieren" },
          "Himmel sings, Frieren guitar",
        ),
        getParameter(
          "Lights",
          getWithMissingOptions(
            {
              "Pink and cyan": { lightColor: "#ff3cb4", noteColor: "#3cdcff" },
              "Gold and violet": { lightColor: "#ffc030", noteColor: "#a050ff" },
              "Red and white": { lightColor: "#ff2a3c", noteColor: "#ffffff" },
              "Green and blue": { lightColor: "#40ff80", noteColor: "#3c8cff" },
            },
            PAIR_PALETTES,
            ([lightColor, noteColor]) => ({ lightColor, noteColor }),
          ),
          "Pink and cyan",
        ),
        backgroundParameter,
      ],
    ),
    "frieren-himmel-dance": getLoop(
      "Frieren and Himmel dance",
      16,
      [{ effect: "hero-dance", params: getReferences(["move", "speed", "sync"]) }],
      [heroMoveParameter, danceSpeedParameter, heroSyncParameter],
    ),
    "himmel-spawn": {
      name: "Himmel spawn",
      parameters: [getColorParameter("Blue", VEIN_COLORS), heroMoveParameter, danceSpeedParameter],
      sections: [
        {
          name: "Spawn",
          mode: { type: "once", beats: 12 },
          layers: [
            {
              effect: "blood-veins",
              params: {
                color: { param: "color" },
                drain: {
                  keyframes: [
                    { at: 0, value: 0 },
                    { at: 1 / 12, value: 0, easing: "easeInQuad" },
                    { at: 7 / 12, value: 1 },
                  ],
                },
              },
            },
            { effect: "himmel-spawn", params: { color: { param: "color" } } },
          ],
        },
        {
          name: "Dance",
          mode: { type: "loop", beats: 16 },
          layers: [
            {
              effect: "hero-dance",
              params: { ...getReferences(["move", "speed"]), dancers: "himmel", size: 18 },
            },
          ],
        },
      ],
    },
    "himmel-spotlight-dance": getLoop(
      "Himmel spotlight dance",
      16,
      [
        {
          effect: "spotlights",
          params: { ...paletteParams, ...getReferences(["origin", "every", "count"]) },
        },
        {
          effect: "hero-dance",
          params: {
            ...getReferences(["move", "speed"]),
            dancers: "himmel",
            size: 18,
            outline: true,
          },
        },
      ],
      [
        heroMoveParameter,
        danceSpeedParameter,
        getLightColorParameter("Blues", SPOTLIGHT_PALETTES),
        getValueParameter(
          "Lights",
          "origin",
          { Above: "top", Below: "bottom", Both: "both" },
          "Above",
        ),
        getValueParameter("Sweep", "every", { "1 bar": 4, "2 bars": 8, "4 bars": 16 }, "2 bars"),
        getValueParameter("Beams", "count", { "3": 3, "4": 4, "6": 6 }, "4"),
      ],
    ),
    "himmel-cyberspace": getLoop(
      "Himmel cyberspace",
      8,
      [{ effect: "himmel-cyberspace", params: getReferences(["every"]) }],
      [getValueParameter("Pulse", "every", { "Half beat": 0.5, Beat: 1, "2 beats": 2 }, "Beat")],
    ),
  }),
  ...getFolder("Nurture", {
    scribble: getLoop(
      "Scribble",
      32,
      [
        {
          effect: "scribble",
          params: getReferences(["ink", "paper", "style", "mode", "pens", "speed"]),
        },
      ],
      [
        getInkStyleParameter("White on black"),
        getValueParameter("Line", "style", { Smooth: "smooth", Jagged: "jagged" }, "Smooth"),
        getValueParameter("Mode", "mode", { Trail: "trail", Build: "build" }, "Trail"),
        getValueParameter("Pens", "pens", { "1": 1, "2": 2, "3": 3 }, "1"),
        danceSpeedParameter,
      ],
    ),
    "scribble-flower": getLoop(
      "Scribble flower",
      32,
      [{ effect: "scribble-flower", params: getReferences(["ink", "paper", "speed"]) }],
      [getInkStyleParameter("Black on white"), danceSpeedParameter],
    ),
    "nurture-tree": getLoop(
      "Nurture tree",
      32,
      [{ effect: "nurture-tree", params: getReferences(["ink", "paper", "speed"]) }],
      [getInkStyleParameter("White on black"), danceSpeedParameter],
    ),
    "nurture-field": getLoop(
      "Nurture field",
      32,
      [
        {
          effect: "nurture-field",
          params: getReferences(["skyTop", "skyBottom", "line", "every", "gust", "speed"]),
        },
      ],
      [
        getParameter(
          "Sky",
          {
            Overcast: { skyTop: "#d4e0e8", skyBottom: WHITE, line: BLACK },
            Blue: { skyTop: "#1450e8", skyBottom: "#8cc8ff", line: WHITE },
          },
          "Overcast",
        ),
        getGustParameter(0.8),
        danceSpeedParameter,
      ],
    ),
    "summer-sky": getLoop(
      "Summer sky",
      32,
      [{ effect: "summer-sky", params: getReferences(["every", "gust", "speed"]) }],
      [getGustParameter(0.7), danceSpeedParameter],
    ),
    clouds: getLoop(
      "Clouds",
      32,
      [{ effect: "summer-sky", params: { grass: false, ...getReferences(["speed"]) } }],
      [danceSpeedParameter],
    ),
    "snow-burst": getLoop(
      "Snow burst",
      32,
      [{ effect: "snow-burst", params: getReferences(["skyTop", "every", "speed"]) }],
      [
        getValueParameter("Background", "skyTop", { Blue: "#0446e0", Black: "none" }, "Blue"),
        getValueParameter("Burst", "every", { Beat: 1, "2 beats": 2, "4 beats": 4 }, "Beat"),
        danceSpeedParameter,
      ],
    ),
    "get-your-wish": getLoop(
      "Get your wish",
      32,
      [{ effect: "get-your-wish", params: getReferences(["style", "speed"]) }],
      [
        getValueParameter("Line", "style", { Smooth: "smooth", Jagged: "jagged" }, "Jagged"),
        danceSpeedParameter,
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
        getColorParameter(
          "Pumpkin",
          getWithMissingOptions(
            {
              Pumpkin: PUMPKIN,
              Purple: PURPLE,
              Green: GREEN,
              White: WHITE,
              Pink: PINK,
              Blood: BLOOD_COLOR,
              "Fresh blood": FRESH_BLOOD_COLOR,
            },
            SINGLE_PALETTES,
            ([color]) => color,
          ),
        ),
      ],
    ),
    "pumpkin-dance": getLoop(
      "Pumpkin dance",
      16,
      [
        {
          effect: "pumpkin-dance",
          params: getReferences(["move", "speed", "count", "size", "sync"]),
        },
      ],
      [
        getValueParameter(
          "Move",
          "move",
          { Kick: "kick", Spin: "spin", Jig: "jig", Headbang: "headbang" },
          "Kick",
        ),
        danceSpeedParameter,
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
      [
        {
          effect: "skeleton-dance",
          params: getReferences(["move", "speed", "count", "size", "sync"]),
        },
      ],
      [
        getValueParameter(
          "Move",
          "move",
          { Jig: "jig", Rattle: "rattle", Charleston: "charleston", "Head toss": "toss" },
          "Jig",
        ),
        danceSpeedParameter,
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
  ...getFolder("Tamagotchi", tamagotchiAnimations),
  ...getFolder("Explosions", explosionAnimations),
  ...getFolder("One-offs", {
    rumble,
    "smpte-bars": smpteBars,
    "trouble-waveform": troubleWaveform,
    "vocal-planet-dying": vocalPlanetDying,
  }),
};

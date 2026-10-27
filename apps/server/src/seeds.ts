import type { AnimationInput, Parameter } from "@led-matrix/core";

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

type Options = Readonly<Record<string, Record<string, unknown>>>;

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

const transitionSpeedParameter = getValueParameter(
  "Speed",
  "beatsPerColor",
  { Double: 0.5, Beat: 1, "Half time": 2 },
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
        params: { text, font: "Anton", size: 40, color: { param: `${key}Text` }, ...textParams },
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
      },
      "Solid",
    ),
  ],
  sections: [
    ...RUMBLE_WORDS.map((word, index) => getRumbleSection(word, 1, `word${index + 1}`)),
    getRumbleSection(RUMBLE_TEXT, 6, "rumble", {
      scroll: {
        keyframes: [
          { at: 0, value: 0 },
          { at: 1, value: 1 },
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
  "Orange/purple": [ORANGE, PURPLE],
  "Green/purple": [GREEN, PURPLE],
  "White/orange": [WHITE, ORANGE],
  Ice: [WHITE, ICE],
};

const flashSpeeds = { "Half time": 0.5, Beat: 1, Double: 2, Quad: 4 };

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

const blackCatParameter = getValueParameter(
  "Black cat",
  "color",
  { Purple: "#4b1d7a", Midnight: "#24243a", Ginger: "#c0601c", Ghost: "#b0c8d8" },
  "Purple",
);

const catColorParams = getReferences(["color"]);

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

const sprayReferences = { period: 8, ...getReferences(["perStep", "beatBurst", "power"]) };

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
    [getValueParameter("Style", "style", { Bottom: "bottom", Center: "center" }, "Bottom")],
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
    strobe: getLoop(
      "Strobe",
      1,
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
        getValueParameter("Speed", "flashesPerBeat", { Beat: 1, Double: 2, Quad: 4 }, "Double"),
      ],
    ),
    flash: getLoop(
      "Flash",
      4,
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
    split: getBackgroundLoop("Split", 8, "split", splitReferences, [
      getBackgroundColorParameter("Orange"),
      ...splitParameters,
    ]),
    "split-strobe": getBackgroundLoop(
      "Split with strobe",
      8,
      "split",
      splitReferences,
      [getBackgroundColorParameter("Purple"), ...splitParameters],
      [{ effect: "strobe", params: { flashesPerBeat: 4, duty: 0.15 }, blend: "add", opacity: 0.5 }],
    ),
    wipe: getBackgroundLoop(
      "Wipe",
      8,
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
    checker: getBackgroundLoop("Checker", 4, "checker", getReferences(["size", "swapsPerBeat"]), [
      getBackgroundColorParameter("Orange/purple"),
      getValueParameter(
        "Size",
        "size",
        { Small: 4, Medium: 8, Large: 16, Quadrants: 32 },
        "Medium",
      ),
      getValueParameter("Speed", "swapsPerBeat", { "Half time": 0.5, Beat: 1, Double: 2 }, "Beat"),
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
        blackCatParameter,
      ],
      sections: [
        {
          name: "Spawn",
          mode: { type: "once", beats: 16 },
          layers: [hyperspaceLayer, { effect: "cat-pair-spawn", params: catColorParams }],
        },
        {
          name: "Hyperspace",
          mode: { type: "loop", beats: 16 },
          layers: [
            hyperspaceLayer,
            {
              effect: "cat-hyperspace",
              params: { ...catColorParams, ...getReferences(["orbits", "turns"]) },
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
        blackCatParameter,
      ],
      sections: [
        {
          name: "Spawn",
          mode: { type: "once", beats: 16 },
          layers: [{ effect: "cat-pair-spawn", params: catColorParams }],
        },
        {
          name: "Explode",
          mode: { type: "once", beats: 8 },
          layers: [
            { effect: "cat-explode", params: catColorParams },
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
          { Sway: "sway", Hop: "hop", "Paws up": "paws-up", Twist: "twist", Conga: "conga" },
          "Sway",
        ),
        getValueParameter("Sync", "offbeat", { Together: false, Alternating: true }, "Together"),
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
      [{ effect: "pumpkin", params: { cyclesX: 3, cyclesY: 4, color: { param: "color" } } }],
      [
        getColorParameter("Pumpkin", {
          Pumpkin: PUMPKIN,
          Purple: PURPLE,
          Green: GREEN,
          White: WHITE,
        }),
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
  ...getFolder("One-offs", { rumble }),
};

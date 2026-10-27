import type { Effect } from "../effect.ts";
import { emboss } from "./emboss.ts";
import { tilt } from "./tilt.ts";
import { pixelate } from "./pixelate.ts";
import { posterize } from "./posterize.ts";
import { blur } from "./blur.ts";
import { mirror } from "./mirror.ts";
import { kaleidoscope } from "./kaleidoscope.ts";
import { chromatic } from "./chromatic.ts";
import { trails } from "./trails.ts";
import { vampireMouth } from "./vampire-mouth.ts";
import { pumpkin } from "./pumpkin.ts";
import { split, wipe } from "./transitions.ts";
import { colorFade, colorFlash } from "./color-flash.ts";
import { checker, rings, stripes, twinkle } from "./patterns.ts";
import { hyperspace } from "./hyperspace.ts";
import { scareMeter } from "./scare-meter.ts";
import {
  bloodCurtain,
  bloodDrip,
  bloodEqualizer,
  bloodFountain,
  bloodShockwave,
  bloodStorm,
  bloodStrobe,
  bloodVortex,
  bloodExplosion,
  bloodPool,
  bloodSplatter,
  bloodText,
  bloodVeins,
  bloodWells,
} from "./blood/index.ts";
import { loading } from "./loading.ts";
import { cat } from "./cat.ts";
import { catBounce, catSpawn } from "./cat-duo.ts";
import { catDance } from "./cat-dance.ts";
import { catBloodSpray, catExplode } from "./cat-explode.ts";
import { catPairSpawn } from "./cat-pair-spawn.ts";
import { catEyes } from "./cat-eyes.ts";
import { catBroom, catGhosts } from "./cat-halloween.ts";
import { catHyperspace } from "./cat-hyperspace.ts";
import { demonHunters } from "./demon-hunters/index.ts";
import { bigText } from "./big-text.ts";
import { clip } from "./clip.ts";
import { plasma } from "./plasma.ts";
import { scrollingText } from "./scrolling-text.ts";
import { solid } from "./solid.ts";
import { squares } from "./squares.ts";
import { strobe } from "./strobe.ts";
import { text } from "./text.ts";

export const effects: readonly Effect[] = [
  solid,
  strobe,
  colorFlash,
  colorFade,
  split,
  wipe,
  checker,
  stripes,
  rings,
  twinkle,
  hyperspace,
  plasma,
  squares,
  text,
  scrollingText,
  bigText,
  clip,
  vampireMouth,
  pumpkin,
  scareMeter,
  bloodDrip,
  bloodSplatter,
  bloodExplosion,
  bloodPool,
  bloodText,
  bloodVeins,
  bloodCurtain,
  bloodFountain,
  bloodWells,
  bloodVortex,
  bloodEqualizer,
  bloodStorm,
  bloodShockwave,
  bloodStrobe,
  loading,
  cat,
  catSpawn,
  catBounce,
  catPairSpawn,
  catHyperspace,
  catExplode,
  catBloodSpray,
  catDance,
  catBroom,
  catGhosts,
  catEyes,
  demonHunters,
  emboss,
  tilt,
  pixelate,
  posterize,
  blur,
  mirror,
  kaleidoscope,
  chromatic,
  trails,
];

const effectsById = new Map(effects.map((effect) => [effect.id, effect]));

export function getEffect(id: string): Effect | undefined {
  return effectsById.get(id);
}

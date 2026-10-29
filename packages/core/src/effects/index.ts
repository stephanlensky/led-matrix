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
import { pumpkinDance } from "./pumpkin-dance.ts";
import { skeletonDance } from "./skeleton-dance.ts";
import { skullDoot } from "./skull-doot.ts";
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
  bloodHeartbeat,
  bloodMoon,
  bloodSeep,
  bloodHandprints,
  bloodTide,
  bloodSlash,
  bloodCountdown,
  bloodBite,
  bloodSplash,
  bloodHeart,
  bloodArterial,
  bloodBubbles,
  bloodTunnel,
  bloodLava,
  bloodSlam,
  bloodCymatics,
  bloodChainsaw,
  bloodScream,
} from "./blood/index.ts";
import { loading } from "./loading.ts";
import { cat } from "./cat.ts";
import { catBounce, catSpawn } from "./cat-duo.ts";
import { catDance } from "./cat-dance.ts";
import { catHype } from "./cat-hype.ts";
import { catRoll } from "./cat-roll.ts";
import { catBloodSpray, catExplode } from "./cat-explode.ts";
import { catPairSpawn } from "./cat-pair-spawn.ts";
import { catEyes } from "./cat-eyes.ts";
import { catBroom, catGhosts } from "./cat-halloween.ts";
import { catHyperspace } from "./cat-hyperspace.ts";
import { catRacecar } from "./cat-racecar.ts";
import { catWands } from "./cat-wands.ts";
import { catSpace } from "./cat-space.ts";
import { catLaptop } from "./cat-laptop.ts";
import { catLaptopDuo } from "./cat-laptop-duo.ts";
import { catBalloons } from "./cat-balloons.ts";
import { catChase } from "./cat-chase.ts";
import { catCyberspace, catLaptopPortal } from "./cat-cyberspace.ts";
import { catPhone, heartWipe } from "./cat-phone.ts";
import { heartFloat, heartPulse } from "./heart-pulse.ts";
import { heartEqualizer } from "./heart-equalizer.ts";
import {
  bloodDrips,
  heartArrow,
  heartBleed,
  heartBreak,
  heartBurst,
  heartCorrupt,
  heartFlatline,
  heartMelt,
  heartRain,
} from "./heart-blood.ts";
import { equalizer } from "./equalizer.ts";
import { catHeartHands, catKiss } from "./cat-love.ts";
import { catGasp } from "./cat-gasp.ts";
import { heartEcg, heartGrid, heartTunnel, heartZoom } from "./heart-patterns.ts";
import { catBench, catMimic, catSquat } from "./cat-gym.ts";
import { catJam } from "./cat-jam.ts";
import { vocalScene } from "./vocal-scenes.ts";
import { demonHunters } from "./demon-hunters/index.ts";
import { hunterDance } from "./hunter-dance.ts";
import { hunterHyperspace } from "./hunter-hyperspace.ts";
import { heroDance } from "./frieren-dance.ts";
import { himmelSpawn } from "./himmel-spawn.ts";
import { himmelCyberspace } from "./himmel-cyberspace.ts";
import { spotlights } from "./spotlights.ts";
import { heroHeartHands, heroKiss } from "./hero-love.ts";
import { frierenHeartMagic, heroLaptop, heroSlowDance } from "./hero-activities.ts";
import { frierenMimic } from "./frieren-mimic.ts";
import { himmelBench, himmelSquat } from "./himmel-lift.ts";
import { himmelSleep } from "./himmel-sleep.ts";
import { heroBand } from "./hero-band.ts";
import { characterSelect } from "./character-select.ts";
import { clubCrowd } from "./club-crowd.ts";
import { heroDesk } from "./hero-desk.ts";
import { heroWeek } from "./hero-week.ts";
import { bigText } from "./big-text.ts";
import { clip } from "./clip.ts";
import { plasma } from "./plasma.ts";
import { scrollingText } from "./scrolling-text.ts";
import { solid } from "./solid.ts";
import { squares } from "./squares.ts";
import { strobe } from "./strobe.ts";
import { text } from "./text.ts";
import { tamagotchi, tamagotchiBurst, tamagotchiTwinkle } from "./tamagotchi.ts";
import { wordSlam } from "./word-slam.ts";
import { explosion, mushroomCloud } from "./explosion.ts";
import { smpteBars } from "./smpte-bars.ts";

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
  pumpkinDance,
  skullDoot,
  skeletonDance,
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
  bloodHeartbeat,
  bloodMoon,
  bloodSeep,
  bloodHandprints,
  bloodTide,
  bloodSlash,
  bloodCountdown,
  bloodBite,
  bloodSplash,
  bloodHeart,
  bloodArterial,
  bloodBubbles,
  bloodTunnel,
  bloodLava,
  bloodSlam,
  bloodCymatics,
  bloodChainsaw,
  bloodScream,
  loading,
  cat,
  catSpawn,
  catBounce,
  catPairSpawn,
  catHyperspace,
  catRacecar,
  catWands,
  catSpace,
  catLaptop,
  catLaptopDuo,
  catBalloons,
  catChase,
  catLaptopPortal,
  catCyberspace,
  catPhone,
  heartWipe,
  heartPulse,
  catHeartHands,
  catKiss,
  catGasp,
  heartFloat,
  heartZoom,
  heartGrid,
  heartEcg,
  heartTunnel,
  heartEqualizer,
  heartBleed,
  heartBreak,
  heartMelt,
  heartFlatline,
  heartArrow,
  heartRain,
  heartBurst,
  heartCorrupt,
  tamagotchi,
  tamagotchiTwinkle,
  tamagotchiBurst,
  wordSlam,
  explosion,
  mushroomCloud,
  smpteBars,
  bloodDrips,
  equalizer,
  catBench,
  catSquat,
  catMimic,
  catJam,
  vocalScene,
  catExplode,
  catBloodSpray,
  catDance,
  catHype,
  catRoll,
  catBroom,
  catGhosts,
  catEyes,
  demonHunters,
  hunterDance,
  hunterHyperspace,
  heroDance,
  himmelSpawn,
  himmelCyberspace,
  spotlights,
  heroHeartHands,
  heroKiss,
  heroLaptop,
  heroSlowDance,
  frierenHeartMagic,
  frierenMimic,
  himmelBench,
  himmelSquat,
  himmelSleep,
  heroBand,
  characterSelect,
  clubCrowd,
  heroDesk,
  heroWeek,
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

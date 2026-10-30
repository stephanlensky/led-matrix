import type { Effect } from "../../effect.ts";
import { nyanBounce } from "./bounce.ts";
import { nyanCyberspace } from "./cyberspace.ts";
import { nyanGlitch } from "./glitch.ts";
import { nyanHardstyle } from "./hardstyle.ts";
import { nyanHeadRiders } from "./head-riders.ts";
import { nyanMeshRiders } from "./mesh-riders.ts";
import { nyanNostalgia } from "./nostalgia.ts";
import { nyanCat } from "./original.ts";
import { nyanPixelRiders } from "./pixel-riders.ts";
import { nyanSquad } from "./squad.ts";
import { nyanStampede } from "./stampede.ts";
import { nyanVortex } from "./vortex.ts";
import { nyanWave } from "./wave.ts";

export const nyanEffects: Effect[] = [
  nyanCat,
  nyanCyberspace,
  nyanSquad,
  nyanPixelRiders,
  nyanMeshRiders,
  nyanHeadRiders,
  nyanNostalgia,
  nyanHardstyle,
  nyanStampede,
  nyanBounce,
  nyanWave,
  nyanVortex,
  nyanGlitch,
];

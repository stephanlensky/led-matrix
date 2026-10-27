import { HEIGHT, WIDTH } from "../../frame.ts";
import {
  type DemonType,
  type Hunter,
  LEVEL_TOP,
  SCROLL_SPEED,
  TILE_SIZE,
  hunters,
  level,
  spawns,
} from "./scene.ts";
import type { Aim } from "./sprites.ts";

export const TICKS_PER_BEAT = 32;
export const LEVEL_WIDTH = (level[0]?.length ?? 0) * TILE_SIZE;
export const PERIOD_TICKS = Math.round((LEVEL_WIDTH / SCROLL_SPEED) * TICKS_PER_BEAT);

const DT = 1 / TICKS_PER_BEAT;
const GRAVITY = 128;
const JUMP_SPEED = 64;
const BULLET_SPEED = 64;
const FIRE_TICKS = TICKS_PER_BEAT / 2;
const HUNTER_HEIGHT = 12;
const HUNTER_FOOT = [2, 5] as const;
const HURT_TICKS = TICKS_PER_BEAT * 2;
const AIM_TICKS = TICKS_PER_BEAT;
const FLASH_TICKS = 3;
const HIT_TICKS = 3;
export const EXPLOSION_TICKS = 12;
const BAT_AMPLITUDE = 4;
const BAT_BEATS = 2;

type DemonDefinition = {
  width: number;
  height: number;
  hp: number;
  speed: number;
  foot: readonly [number, number];
  explosions: number;
};

export const demonDefinitions: Readonly<Record<DemonType, DemonDefinition>> = {
  imp: { width: 7, height: 8, hp: 3, speed: 6, foot: [1, 5], explosions: 1 },
  bat: { width: 9, height: 6, hp: 2, speed: 10, foot: [0, 8], explosions: 1 },
  brute: { width: 11, height: 12, hp: 9, speed: 3, foot: [2, 8], explosions: 4 },
};

type Body = {
  x: number;
  y: number;
  vy: number;
  isGrounded: boolean;
};

export type HunterState = Body & {
  hunter: Hunter;
  aim: Aim;
  aimTicks: number;
  flashTicks: number;
  hurtTicks: number;
  airTicks: number;
};

export type DemonState = Body & {
  type: DemonType;
  hp: number;
  hitTicks: number;
  age: number;
  baseY: number;
};

export type BulletState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hunter: Hunter;
};

export type ExplosionState = {
  x: number;
  y: number;
  age: number;
};

export type GameState = {
  tick: number;
  scroll: number;
  hunters: HunterState[];
  demons: DemonState[];
  bullets: BulletState[];
  explosions: ExplosionState[];
};

function getTile(column: number, row: number): string {
  const line = level[row];
  if (!line) {
    return ".";
  }
  return line[((column % line.length) + line.length) % line.length] ?? ".";
}

export function getLevelTile(x: number, y: number): string {
  return getTile(Math.floor(x / TILE_SIZE), Math.floor((y - LEVEL_TOP) / TILE_SIZE));
}

function isSurface(tile: string): boolean {
  return tile === "=" || tile === "-";
}

function getSurfaceColumns(left: number, right: number): number[] {
  const columns: number[] = [];
  for (
    let column = Math.floor(left / TILE_SIZE);
    column <= Math.floor(right / TILE_SIZE);
    column++
  ) {
    columns.push(column);
  }
  return columns;
}

function findSurface(left: number, right: number, fromY: number, toY: number): number | undefined {
  const columns = getSurfaceColumns(left, right);
  for (let row = 0; row < level.length; row++) {
    const top = LEVEL_TOP + row * TILE_SIZE;
    if (top < fromY || top > toY) {
      continue;
    }
    if (columns.some((column) => isSurface(getTile(column, row)))) {
      return top;
    }
  }
  return undefined;
}

function updateBody(body: Body, foot: readonly [number, number]): void {
  const left = body.x + foot[0];
  const right = body.x + foot[1];
  if (body.isGrounded && findSurface(left, right, body.y, body.y) === undefined) {
    body.isGrounded = false;
    body.vy = 0;
  }
  if (body.isGrounded) {
    return;
  }
  body.vy += GRAVITY * DT;
  const nextY = body.y + body.vy * DT;
  const landing = body.vy > 0 ? findSurface(left, right, Math.floor(body.y) + 1, nextY) : undefined;
  if (landing === undefined) {
    body.y = nextY;
    return;
  }
  body.y = landing;
  body.vy = 0;
  body.isGrounded = true;
}

function jump(body: Body): void {
  body.vy = -JUMP_SPEED;
  body.isGrounded = false;
}

function shouldJump(state: HunterState): boolean {
  const front = state.x + 6;
  const ledge = findSurface(front + 2, front + 4, state.y - 15, state.y - 4);
  const ground = findSurface(front, front + 3, state.y, HEIGHT);
  return ledge !== undefined || ground === undefined;
}

export function getDemonBox(demon: DemonState): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const definition = demonDefinitions[demon.type];
  const top = demon.type === "bat" ? demon.y : demon.y - definition.height;
  return {
    left: demon.x,
    top,
    right: demon.x + definition.width,
    bottom: top + definition.height,
  };
}

function getDemonCenter(demon: DemonState): [number, number] {
  const box = getDemonBox(demon);
  return [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
}

function getGunOrigin(state: HunterState, aim: Aim): [number, number] {
  const top = state.y - HUNTER_HEIGHT;
  if (!state.isGrounded) {
    return [state.x + 4, top + 6];
  }
  return [state.x + 8, top + (aim === "up" ? 2 : aim === "down" ? 8 : 5)];
}

function findTarget(
  state: HunterState,
  demons: readonly DemonState[],
  scroll: number,
): DemonState | undefined {
  let best: DemonState | undefined;
  let bestDistance = Infinity;
  for (const demon of demons) {
    const [x, y] = getDemonCenter(demon);
    const screenX = x - scroll;
    if (screenX < state.x - scroll + 8 || screenX > WIDTH) {
      continue;
    }
    const distance = Math.hypot(x - state.x, y - state.y);
    if (distance < bestDistance) {
      best = demon;
      bestDistance = distance;
    }
  }
  return best;
}

function fire(state: HunterState, target: DemonState, bullets: BulletState[]): void {
  const [targetX, targetY] = getDemonCenter(target);
  const speed = -demonDefinitions[target.type].speed;
  const roughAim: Aim = targetY < state.y - 16 ? "up" : targetY > state.y ? "down" : "right";
  const [originX, originY] = getGunOrigin(state, roughAim);
  let aimX = targetX;
  for (let iteration = 0; iteration < 2; iteration++) {
    const travel = Math.hypot(aimX - originX, targetY - originY) / BULLET_SPEED;
    aimX = targetX + speed * travel;
  }
  const dx = aimX - originX;
  const dy = targetY - originY;
  const length = Math.hypot(dx, dy) || 1;
  const slope = dy / Math.max(1, dx);
  state.aim = slope < -0.5 ? "up" : slope > 0.5 ? "down" : "right";
  state.aimTicks = AIM_TICKS;
  state.flashTicks = FLASH_TICKS;
  bullets.push({
    x: originX,
    y: originY,
    vx: (dx / length) * BULLET_SPEED,
    vy: (dy / length) * BULLET_SPEED,
    hunter: state.hunter,
  });
}

function explode(demon: DemonState, explosions: ExplosionState[]): void {
  const box = getDemonBox(demon);
  const count = demonDefinitions[demon.type].explosions;
  for (let index = 0; index < count; index++) {
    const spreadX = count > 1 ? ((index % 2) * 2 - 1) * 3 : 0;
    const spreadY = count > 1 ? (Math.floor(index / 2) * 2 - 1) * 3 : 0;
    explosions.push({
      x: (box.left + box.right) / 2 + spreadX,
      y: (box.top + box.bottom) / 2 + spreadY,
      age: -index * 4,
    });
  }
}

function isOverlapping(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function getScroll(tick: number): number {
  return (tick / TICKS_PER_BEAT) * SCROLL_SPEED;
}

function spawnDemons(state: GameState, previousScroll: number): void {
  for (const spawn of spawns) {
    const getCycle = (scroll: number) => Math.floor((scroll + WIDTH - spawn.x) / LEVEL_WIDTH);
    const cycle = getCycle(state.scroll);
    if (cycle <= getCycle(previousScroll)) {
      continue;
    }
    state.demons.push({
      type: spawn.type,
      x: spawn.x + cycle * LEVEL_WIDTH,
      y: spawn.y,
      baseY: spawn.y,
      vy: 0,
      isGrounded: false,
      hp: demonDefinitions[spawn.type].hp,
      hitTicks: 0,
      age: 0,
    });
  }
}

function step(state: GameState): void {
  const previousScroll = state.scroll;
  state.tick++;
  state.scroll = getScroll(state.tick);
  const scrollDelta = state.scroll - previousScroll;
  spawnDemons(state, previousScroll);

  for (const hunter of state.hunters) {
    hunter.x += scrollDelta;
    if (hunter.isGrounded && shouldJump(hunter)) {
      jump(hunter);
    }
    updateBody(hunter, HUNTER_FOOT);
    hunter.airTicks = hunter.isGrounded ? 0 : hunter.airTicks + 1;
    hunter.aimTicks = Math.max(0, hunter.aimTicks - 1);
    hunter.flashTicks = Math.max(0, hunter.flashTicks - 1);
    hunter.hurtTicks = Math.max(0, hunter.hurtTicks - 1);
    if (hunter.aimTicks === 0) {
      hunter.aim = "right";
    }
    const fireTick = state.tick - Math.round(hunter.hunter.fireOffset * TICKS_PER_BEAT);
    if (fireTick % FIRE_TICKS === 0) {
      const target = findTarget(hunter, state.demons, state.scroll);
      if (target) {
        fire(hunter, target, state.bullets);
      }
    }
  }

  for (const demon of state.demons) {
    const definition = demonDefinitions[demon.type];
    demon.age++;
    demon.hitTicks = Math.max(0, demon.hitTicks - 1);
    demon.x -= definition.speed * DT;
    if (demon.type === "bat") {
      demon.y =
        demon.baseY +
        BAT_AMPLITUDE * Math.sin((2 * Math.PI * demon.age) / (BAT_BEATS * TICKS_PER_BEAT));
    } else {
      updateBody(demon, definition.foot);
    }
  }

  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * DT;
    bullet.y += bullet.vy * DT;
  }

  state.bullets = state.bullets.filter((bullet) => {
    const target = state.demons.find((demon) => {
      const box = getDemonBox(demon);
      return (
        demon.hp > 0 &&
        bullet.x >= box.left - 1 &&
        bullet.x <= box.right + 1 &&
        bullet.y >= box.top - 1 &&
        bullet.y <= box.bottom + 1
      );
    });
    if (target) {
      target.hp--;
      target.hitTicks = HIT_TICKS;
      return false;
    }
    const screenX = bullet.x - state.scroll;
    return screenX > -4 && screenX < WIDTH + 4 && bullet.y > -4 && bullet.y < HEIGHT + 4;
  });

  for (const hunter of state.hunters) {
    const hunterBox = {
      left: hunter.x + 2,
      top: hunter.y - HUNTER_HEIGHT,
      right: hunter.x + 6,
      bottom: hunter.y,
    };
    for (const demon of state.demons) {
      if (demon.hp > 0 && isOverlapping(hunterBox, getDemonBox(demon))) {
        demon.hp = 0;
        hunter.hurtTicks = HURT_TICKS;
      }
    }
  }

  for (const explosion of state.explosions) {
    explosion.age++;
  }
  state.explosions = state.explosions.filter((explosion) => explosion.age < EXPLOSION_TICKS);
  state.demons = state.demons.filter((demon) => {
    if (demon.hp <= 0 || demon.y > HEIGHT + 8) {
      explode(demon, state.explosions);
      return false;
    }
    return getDemonBox(demon).right - state.scroll > -4;
  });
}

function createState(tick: number): GameState {
  const scroll = getScroll(tick);
  return {
    tick,
    scroll,
    hunters: hunters.map((hunter) => ({
      hunter,
      x: scroll + hunter.x,
      y: LEVEL_TOP,
      vy: 0,
      isGrounded: false,
      aim: "right",
      aimTicks: 0,
      flashTicks: 0,
      hurtTicks: 0,
      airTicks: 0,
    })),
    demons: [],
    bullets: [],
    explosions: [],
  };
}

export function simulateTicks(ticks: number): GameState {
  const state = createState(0);
  while (state.tick < ticks) {
    step(state);
  }
  return state;
}

export function simulate(beat: number): GameState {
  const tick = Math.floor(beat * TICKS_PER_BEAT);
  const cycle = Math.floor(tick / PERIOD_TICKS);
  return simulateTicks(tick - (cycle - 1) * PERIOD_TICKS);
}

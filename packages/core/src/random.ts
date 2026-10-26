export type Random = () => number;

export function hashSeed(...values: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash = Math.imul(hash ^ Math.floor(value), 0x01000193);
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x2c1b3c6d);
    hash ^= hash >>> 12;
  }
  return hash >>> 0;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function getRandomBetween(random: Random, min: number, max: number): number {
  return min + random() * (max - min);
}

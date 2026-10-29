const MIN_DB = -14;
const MAX_DB = 14;
const NEUTRAL_PARAMETER = 0.5;

function getRatio(db: number): number {
  return 10 ** (db / 20);
}

export function getDb(value: number): number {
  return 20 * Math.log10(value);
}

const offset = getRatio(MIN_DB);

export const MAX_GAIN = getRatio(MAX_DB);

export function getGainParameter(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value < 1) {
    const db = getDb(value + offset * (1 - value));
    return ((db - MIN_DB) * NEUTRAL_PARAMETER) / -MIN_DB;
  }
  if (value < MAX_GAIN) {
    return NEUTRAL_PARAMETER + (getDb(value) * (1 - NEUTRAL_PARAMETER)) / MAX_DB;
  }
  return 1;
}

export function getGainValue(parameter: number): number {
  if (parameter <= 0) {
    return 0;
  }
  if (parameter < NEUTRAL_PARAMETER) {
    const db = MIN_DB + (parameter * -MIN_DB) / NEUTRAL_PARAMETER;
    return (getRatio(db) - offset) / (1 - offset);
  }
  if (parameter < 1) {
    return getRatio(((parameter - NEUTRAL_PARAMETER) * MAX_DB) / (1 - NEUTRAL_PARAMETER));
  }
  return MAX_GAIN;
}

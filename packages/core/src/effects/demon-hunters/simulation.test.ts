import { describe, expect, it } from "vitest";
import { cats } from "./scene.ts";
import { LEVEL_WIDTH, PERIOD_TICKS, simulateTicks } from "./simulation.ts";

function getSnapshot(ticks: number, offset: number) {
  const state = simulateTicks(ticks);
  return {
    hunters: state.hunters.map((hunter) => [Math.round(hunter.x - offset), Math.round(hunter.y)]),
    demons: state.demons.map((demon) => [demon.type, Math.round(demon.x - offset), demon.hp]),
    bullets: state.bullets.length,
  };
}

describe("demon hunters simulation", () => {
  it("repeats every level period", () => {
    for (const ticks of [0, 100, 300]) {
      expect(getSnapshot(PERIOD_TICKS * 2 + ticks, LEVEL_WIDTH)).toEqual(
        getSnapshot(PERIOD_TICKS + ticks, 0),
      );
    }
  });

  it.each([
    ["hunters", undefined],
    ["cats", cats],
  ])("clears every demon before it reaches the %s", (_name, players) => {
    for (let ticks = PERIOD_TICKS; ticks < PERIOD_TICKS * 2; ticks++) {
      const state = simulateTicks(ticks, players);
      expect(state.hunters.every((hunter) => hunter.hurtTicks === 0)).toBe(true);
    }
  });
});

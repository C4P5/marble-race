import { Choreo, RACE_DYNAMICS, REPLAY_BASE_DURATION, SHOWCASE_BASE_DURATION } from "./choreo.ts";
import assert from "node:assert/strict";
import test from "node:test";

// Race 1's real finish order and VRF word, same fixture as the fairness tests.
const ORDER = [22, 23, 24, 21, 20, 18, 19, 25];
const SEED = "0xc30e377c48a2dbf03de145a52e4f85e8e4137a97b74a62e4d7c7885f6608d750";

const build = (duration: number) =>
  Choreo.buildSchedules(ORDER, SEED, {
    baseDuration: duration,
    rankGap: (duration * Choreo.DEFAULTS.rankGap) / Choreo.DEFAULTS.baseDuration,
    ...RACE_DYNAMICS,
  });

// The whole point of the tuning: crank the drama without touching the result.
for (const [name, duration] of [
  ["showcase", SHOWCASE_BASE_DURATION],
  ["replay", REPLAY_BASE_DURATION],
] as const) {
  test(`${name} pacing renders exactly the chain's finish order`, () => {
    assert.deepEqual(Choreo.renderedFinishOrder(build(duration)), ORDER);
  });

  test(`${name} pacing never produces a negative segment (a marble travelling backwards)`, () => {
    for (const s of build(duration)) {
      for (const t of s.segmentTimes) assert.ok(t > 0, `segment ${t} <= 0 for marble ${s.marbleId}`);
    }
  });

  test(`${name} pacing keeps each marble's segments summing to its total`, () => {
    for (const s of build(duration)) {
      const sum = s.segmentTimes.reduce((a, b) => a + b, 0);
      // Mean-subtracted noise makes this exact up to float error; drift here
      // would mean the finish order is no longer pinned.
      assert.ok(Math.abs(sum - s.total) < 1e-9, `drift ${sum - s.total} on marble ${s.marbleId}`);
    }
  });
}

test("the amplitude stays under the value that would reverse a marble", () => {
  assert.ok(RACE_DYNAMICS.noiseAmplitude < 0.5);
});

test("the field actually changes places during the race", () => {
  const schedules = build(REPLAY_BASE_DURATION);
  const end = Math.max(...schedules.map(s => s.total));
  const leaders = new Set<number>();
  for (let t = 0; t <= end; t += end / 200) {
    const leader = Choreo.leaderAt(schedules, t);
    if (leader !== null) leaders.add(leader);
  }
  // A single leader wire to wire would mean the tuning bought us nothing.
  assert.ok(leaders.size > 1, `only ${leaders.size} leader(s) all race`);
});

test("the winner still leads at the flag", () => {
  const schedules = build(REPLAY_BASE_DURATION);
  const end = Math.max(...schedules.map(s => s.total));
  assert.equal(Choreo.leaderAt(schedules, end), ORDER[0]);
});

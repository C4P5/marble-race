import { finishOrderMatches, recomputeFinishOrder } from "./fairness.ts";
import assert from "node:assert/strict";
import test from "node:test";

// Race 1 on Sepolia, real values — nothing here is synthetic.
// MarbleRace 0x48C6f3607474A0bF013924987371eeaF3A252215
// randomWord read from the RaceDrawn log in block 11380277
// (tx 0xab70925584c6a3b5af961d10107a7e5842a562e2f6d938837468ad25bfea485c).
// randomWord is event-only — no view exposes it — so it is pinned here.
const RACE_1 = {
  seed: 0xc30e377c48a2dbf03de145a52e4f85e8e4137a97b74a62e4d7c7885f6608d750n,
  entrants: [18n, 19n, 20n, 21n, 22n, 23n, 24n, 25n],
  finishOrder: [22n, 23n, 24n, 21n, 20n, 18n, 19n, 25n],
};

test("reproduces race 1's on-chain finish order from the VRF word alone", () => {
  assert.deepEqual(recomputeFinishOrder(RACE_1.entrants, RACE_1.seed), RACE_1.finishOrder);
});

test("finishOrderMatches agrees with the chain for race 1", () => {
  assert.equal(finishOrderMatches(recomputeFinishOrder(RACE_1.entrants, RACE_1.seed), RACE_1.finishOrder), true);
});

test("a one-bit change in the seed changes the order", () => {
  const tampered = recomputeFinishOrder(RACE_1.entrants, RACE_1.seed ^ 1n);
  assert.equal(finishOrderMatches(tampered, RACE_1.finishOrder), false);
});

test("does not mutate the entrant list it was given", () => {
  const entrants = [...RACE_1.entrants];
  recomputeFinishOrder(entrants, RACE_1.seed);
  assert.deepEqual(entrants, RACE_1.entrants);
});

test("a single entrant is returned unchanged and an empty field never matches", () => {
  assert.deepEqual(recomputeFinishOrder([7n], RACE_1.seed), [7n]);
  assert.equal(finishOrderMatches([], []), false);
});

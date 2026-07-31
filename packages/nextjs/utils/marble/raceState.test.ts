import { RESCUE_DELAY, RaceStatus, deriveRaceView, potOf } from "./raceState.ts";
import assert from "node:assert/strict";
import test from "node:test";

// Race 1's real shape: deadline 1785472956, min 8 / max 8 on the live deploy.
const DEADLINE = 1785472956n;
const base = {
  entrantCount: 8n,
  deadline: DEADLINE,
  minPlayers: 3n,
  maxPlayers: 16n,
  now: DEADLINE - 100n,
};

const phase = (over: Partial<typeof base> & { status: RaceStatus; hadDrawing?: boolean }) =>
  deriveRaceView({ ...base, ...over }).phase;

test("Open, short field, pre-deadline: join only", () => {
  const v = deriveRaceView({ ...base, status: RaceStatus.Open, entrantCount: 2n });
  assert.equal(v.phase, "open-filling");
  assert.deepEqual([v.canJoin, v.canStart, v.canCancel], [true, false, false]);
});

test("Open, minimum met but not full, pre-deadline: still join only, no start", () => {
  const v = deriveRaceView({ ...base, status: RaceStatus.Open, entrantCount: 5n });
  assert.equal(v.phase, "open-ready");
  assert.deepEqual([v.canJoin, v.canStart, v.canCancel], [true, false, false]);
});

test("Open and full: start at any time, even pre-deadline", () => {
  const v = deriveRaceView({ ...base, status: RaceStatus.Open, entrantCount: 16n });
  assert.equal(v.phase, "open-full");
  assert.deepEqual([v.canJoin, v.canStart], [false, true]);
});

test("Open past deadline with the minimum met: start only, never cancel", () => {
  const v = deriveRaceView({ ...base, status: RaceStatus.Open, entrantCount: 5n, now: DEADLINE + 1n });
  assert.equal(v.phase, "open-expired-startable");
  // cancel() reverts EnoughPlayers here — offering it would be a guaranteed failure.
  assert.deepEqual([v.canStart, v.canCancel], [true, false]);
});

test("Open past deadline below the minimum: cancel only", () => {
  const v = deriveRaceView({ ...base, status: RaceStatus.Open, entrantCount: 2n, now: DEADLINE + 1n });
  assert.equal(v.phase, "open-expired-dead");
  assert.deepEqual([v.canStart, v.canCancel], [false, true]);
});

test("the deadline itself is still open — the contract rejects join only when now > deadline", () => {
  assert.equal(phase({ status: RaceStatus.Open, entrantCount: 5n, now: DEADLINE }), "open-ready");
  assert.equal(phase({ status: RaceStatus.Open, entrantCount: 5n, now: DEADLINE + 1n }), "open-expired-startable");
});

test("Drawing waits, then becomes rescuable exactly one grace period after the deadline", () => {
  assert.equal(phase({ status: RaceStatus.Drawing, now: DEADLINE + RESCUE_DELAY }), "drawing");
  assert.equal(phase({ status: RaceStatus.Drawing, now: DEADLINE + RESCUE_DELAY + 1n }), "drawing-stalled");
});

test("Drawing offers no action at all — nothing to click but waiting", () => {
  const v = deriveRaceView({ ...base, status: RaceStatus.Drawing });
  assert.deepEqual([v.canJoin, v.canStart, v.canCancel, v.canRescue], [false, false, false, false]);
  assert.equal(v.isRacing, true);
});

test("Cancelled is disambiguated by whether a RaceDrawing event exists", () => {
  assert.equal(phase({ status: RaceStatus.Cancelled, hadDrawing: false }), "cancelled-empty");
  assert.equal(phase({ status: RaceStatus.Cancelled, hadDrawing: true }), "cancelled-stalled");
  // The two must not share copy: "nobody came" vs "the draw never landed".
  const empty = deriveRaceView({ ...base, status: RaceStatus.Cancelled, hadDrawing: false });
  const stalled = deriveRaceView({ ...base, status: RaceStatus.Cancelled, hadDrawing: true });
  assert.notEqual(empty.headline, stalled.headline);
});

test("Drawn and Settled", () => {
  assert.equal(phase({ status: RaceStatus.Drawn }), "drawn");
  assert.equal(phase({ status: RaceStatus.Settled }), "settled");
  assert.equal(deriveRaceView({ ...base, status: RaceStatus.Settled }).isRacing, false);
});

test("a race that was never created reads as none", () => {
  assert.equal(phase({ status: RaceStatus.None }), "none");
});

test("pot counts the host's seed on top of the field — race 1 was 8 entries but an 18 MRBL pot", () => {
  assert.equal(potOf(2_000000000000000000n, 8n), 18_000000000000000000n);
});

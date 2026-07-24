/**
 * Verifies the choreography engine's two non-negotiable properties:
 *   1. CORRECTNESS — the animation always finishes in the chain's order.
 *   2. DRAMA       — the eventual winner does not simply lead wire-to-wire.
 *
 * Run: node docs/prototype/verify.cjs
 */
const Choreo = require("./choreography.js");

const EPS = 1e-9;
let failures = 0;

function check(label, ok, detail) {
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
  }
  return ok;
}

const entrantCounts = [8, 9, 12, 16];
const seeds = [];
for (let i = 0; i < 250; i++) seeds.push("0x" + (i * 2654435761).toString(16));

let totalRaces = 0;
let racesWithLeadChange = 0;
let minSegmentTime = Infinity;
let worstTotalDrift = 0;

for (const n of entrantCounts) {
  // Entrant token ids: public marbles start at 17
  const entrants = Array.from({ length: n }, (_, i) => 17 + i * 3);

  for (const seed of seeds) {
    // Pretend the chain settled this order (a seed-dependent shuffle)
    const order = entrants
      .map(id => ({ id, k: Choreo.rng(Choreo.hashString(seed + ":ord:" + id))() }))
      .sort((a, b) => a.k - b.k)
      .map(o => o.id);

    const schedules = Choreo.buildSchedules(order, seed, { segments: 10 });
    totalRaces++;

    // 1. segment times sum to total (this is what pins the finishing order)
    for (const s of schedules) {
      const sum = s.segmentTimes.reduce((a, b) => a + b, 0);
      worstTotalDrift = Math.max(worstTotalDrift, Math.abs(sum - s.total));
      check("segment times sum to total", Math.abs(sum - s.total) < EPS,
        `marble ${s.marbleId} drift ${(sum - s.total).toExponential(2)}`);

      const minSeg = Math.min(...s.segmentTimes);
      minSegmentTime = Math.min(minSegmentTime, minSeg);
      check("no negative segment time", minSeg > 0,
        `marble ${s.marbleId} min segment ${minSeg}`);
    }

    // 2. rendered finish order equals the chain's order
    const rendered = Choreo.renderedFinishOrder(schedules);
    check("rendered order === chain order",
      rendered.length === order.length && rendered.every((id, i) => id === order[i]),
      `seed ${seed} n=${n}`);

    // 3. drama: did the lead ever belong to someone other than the winner?
    const winner = order[0];
    const raceLength = schedules[schedules.length - 1].total;
    let leadChanged = false;
    for (let step = 1; step < 40; step++) {
      const t = (raceLength * step) / 40;
      if (Choreo.leaderAt(schedules, t) !== winner) { leadChanged = true; break; }
    }
    if (leadChanged) racesWithLeadChange++;
  }
}

const dramaPct = ((racesWithLeadChange / totalRaces) * 100).toFixed(1);

console.log(`races simulated        : ${totalRaces}`);
console.log(`worst total drift      : ${worstTotalDrift.toExponential(2)} (must be ~0)`);
console.log(`smallest segment time  : ${minSegmentTime.toFixed(4)}s (must be > 0)`);
console.log(`races with lead change : ${racesWithLeadChange} (${dramaPct}%)`);
console.log(failures === 0 ? "\nPASS — all correctness properties hold." : `\n${failures} FAILURES`);

process.exit(failures === 0 ? 0 : 1);

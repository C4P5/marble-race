/**
 * Marble Race — choreography engine.
 *
 * The chain decides the podium. This module builds an animation that ARRIVES at
 * that podium: per-marble segment times whose noise sums to exactly zero, so the
 * total (and therefore the finishing order) is pinned while the intermediate
 * order is free to change. Lead changes are theatre; the result is not.
 *
 * Runs in the browser (window.Choreo) and in node (require) so the same code the
 * spike renders is the code the verifier tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Choreo = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  var DEFAULTS = {
    segments: 10, // obstacles: where lead changes are allowed to happen
    baseDuration: 18, // seconds for the winner
    rankGap: 0.35, // extra seconds per finishing place
    // Mean-subtracted noise lands in (-2, 2), so amplitude must stay below 0.5
    // or a segment time could go negative and a marble would travel backwards.
    noiseAmplitude: 0.45,
  };

  function hashString(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  /** mulberry32 — stands in for keccak256 until this is wired to viem. */
  function rng(seedInt) {
    var a = seedInt >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Per-segment noise for one marble, guaranteed to sum to zero. */
  function noiseFor(seed, marbleId, segments) {
    var next = rng(hashString(seed + ":" + marbleId));
    var raw = [];
    for (var i = 0; i < segments; i++) raw.push(next() * 2 - 1);
    var mean = raw.reduce(function (a, b) { return a + b; }, 0) / segments;
    return raw.map(function (v) { return v - mean; });
  }

  /**
   * @param order  tokenIds in authoritative finishing order, index 0 = winner
   * @param seed   raceSeed from the chain
   */
  function buildSchedules(order, seed, opts) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    return order.map(function (marbleId, rank) {
      var total = o.baseDuration + rank * o.rankGap;
      var segBase = total / o.segments;
      var noise = noiseFor(seed, marbleId, o.segments);
      var segmentTimes = noise.map(function (n) {
        return segBase + n * o.noiseAmplitude * segBase;
      });
      var cumulative = [0];
      for (var i = 0; i < o.segments; i++) {
        cumulative.push(cumulative[i] + segmentTimes[i]);
      }
      return {
        marbleId: marbleId,
        rank: rank,
        total: total,
        segmentTimes: segmentTimes,
        cumulative: cumulative,
        segments: o.segments,
      };
    });
  }

  /** Track position in [0,1] for a marble at race time t. */
  function progressAt(schedule, t) {
    if (t >= schedule.total) return 1;
    if (t <= 0) return 0;
    var cum = schedule.cumulative;
    var i = 0;
    while (i < schedule.segments && t >= cum[i + 1]) i++;
    var span = cum[i + 1] - cum[i];
    var frac = span > 0 ? (t - cum[i]) / span : 0;
    return (i + frac) / schedule.segments;
  }

  /** A non-revealer freezes partway round instead of finishing. */
  function dnfProgress(seed, marbleId) {
    return 0.25 + rng(hashString("dnf:" + seed + ":" + marbleId))() * 0.5;
  }

  /** Order actually produced by the animation — must equal the chain's order. */
  function renderedFinishOrder(schedules) {
    return schedules
      .slice()
      .sort(function (a, b) { return a.total - b.total; })
      .map(function (s) { return s.marbleId; });
  }

  /** Whoever is furthest round at time t. Used to detect lead changes. */
  function leaderAt(schedules, t) {
    var best = null;
    var bestP = -1;
    schedules.forEach(function (s) {
      var p = progressAt(s, t);
      if (p > bestP) { bestP = p; best = s.marbleId; }
    });
    return best;
  }

  return {
    DEFAULTS: DEFAULTS,
    hashString: hashString,
    rng: rng,
    noiseFor: noiseFor,
    buildSchedules: buildSchedules,
    progressAt: progressAt,
    dnfProgress: dnfProgress,
    renderedFinishOrder: renderedFinishOrder,
    leaderAt: leaderAt,
  };
});

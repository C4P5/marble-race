/**
 * The single typed seam onto docs/prototype/choreography.js.
 *
 * That file is deliberately NOT copied into this package and NOT modified: it is
 * the artifact `docs/prototype/verify.cjs` tests (1000 simulated races, zero
 * drift), and the partner's 3D work targets the same module. It is UMD, so the
 * bundler picks up its `module.exports` branch and it imports as-is.
 *
 * Everything tunable is passed in at the call site — never edited in the module.
 */
// @ts-nocheck
import ChoreoModule from "../../../../docs/prototype/choreography.js";

export type Schedule = {
  marbleId: number;
  rank: number;
  /** Seconds from the start to this marble's finish. Pins the finishing order. */
  total: number;
  segmentTimes: number[];
  cumulative: number[];
  segments: number;
};

type ChoreoApi = {
  DEFAULTS: { segments: number; baseDuration: number; rankGap: number; noiseAmplitude: number };
  buildSchedules: (
    order: number[],
    seed: string,
    opts?: Partial<{ segments: number; baseDuration: number; rankGap: number; noiseAmplitude: number }>,
  ) => Schedule[];
  progressAt: (schedule: Schedule, t: number) => number;
  renderedFinishOrder: (schedules: Schedule[]) => number[];
  leaderAt: (schedules: Schedule[], t: number) => number | null;
  hashString: (s: string) => number;
  rng: (seed: number) => () => number;
};

export const Choreo = ChoreoModule as ChoreoApi;

/**
 * Live race: the animation starts when RaceDrawn lands, but `settle` still has
 * to be mined before the chain has a finish order to compare against — up to
 * 12s to notice Drawn, ~12s for the tx, up to 12s to notice Settled. Running
 * long means the fairness panel can show BOTH columns the moment the marbles
 * stop, instead of the audience watching a finished race wait for a podium.
 * 95s sits inside the ratified 90-120s band.
 */
export const SHOWCASE_BASE_DURATION = 95;

/**
 * Replay of an already-settled race: nothing is pending. The word, the finish
 * order and the payouts are all on chain before the page loads, so there is no
 * dead air to cover and the 95s is pure waiting. Short enough to hold attention,
 * long enough for the lead changes to read.
 */
export const REPLAY_BASE_DURATION = 32;

/**
 * Drama tuning, passed at the call site — the module is never edited.
 *
 * The finish order is fixed by the chain and cannot be affected by any of this:
 * `noiseFor` mean-subtracts its noise so every marble's segment times sum to
 * exactly its `total`, whatever the amplitude or the segment count. These knobs
 * only decide how much the running order churns on the way there.
 *
 * `noiseAmplitude` has a hard ceiling: mean-subtracted noise lands in (-2, 2),
 * so at 0.5 or above a segment time can go negative and a marble would travel
 * backwards. 0.47 is as close to the edge as is safe.
 */
export const RACE_DYNAMICS = {
  // 37 places round the lap where positions can swap. Frequent small trades
  // rather than a few big ones.
  segments: 37,
  // Deliberately well under the 0.5 ceiling. A high amplitude reads as marbles
  // teleporting — nothing on a rolling circuit justifies that kind of burst.
  // With this many segments the churn comes from how often places change, not
  // from how violently any single one does.
  noiseAmplitude: 0.33,
};

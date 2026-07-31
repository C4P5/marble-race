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
 * The VRF dead-air window means 2-4 minutes pass between the last join and a
 * visible podium. An 18s animation (the module default, tuned for the spike)
 * would end long before the chain resolves and leave the audience staring at a
 * finished race waiting for a podium. 95s covers the measured 60s VRF latency
 * with margin and lands inside the ratified 90-120s band.
 */
export const SHOWCASE_BASE_DURATION = 95;

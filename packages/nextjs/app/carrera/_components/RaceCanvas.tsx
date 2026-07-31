"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Choreo, SHOWCASE_BASE_DURATION, Schedule } from "~~/utils/marble/choreo";

/**
 * Track traced from the reference circuit, same control points as the 2D spike
 * in docs/prototype/race16.html so the ported race looks like the one already
 * shown. Normalised 0-1, scaled to the canvas at draw time.
 */
const CONTROL: [number, number][] = [
  [0.12, 0.5],
  [0.17, 0.26],
  [0.34, 0.14],
  [0.55, 0.2],
  [0.71, 0.11],
  [0.88, 0.24],
  [0.9, 0.47],
  [0.76, 0.6],
  [0.58, 0.54],
  [0.45, 0.69],
  [0.51, 0.86],
  [0.29, 0.89],
  [0.14, 0.74],
];

/**
 * Lane colours assigned by the UI, NOT read from the NFT. The first 80 public
 * marbles are all the same "Roja" family — #17 and #24 sit 2% lightness and 2
 * degrees of hue apart — so the on-chain art cannot tell racers apart on a
 * projector. High-contrast lane colours plus the "#N" badge do that job.
 */
const LANE_COLORS = [
  "#f87171",
  "#fbbf24",
  "#34d399",
  "#60a5fa",
  "#c084fc",
  "#fb923c",
  "#22d3ee",
  "#f472b6",
  "#a3e635",
  "#e879f9",
  "#38bdf8",
  "#facc15",
  "#4ade80",
  "#818cf8",
  "#fca5a5",
  "#2dd4bf",
];

const catmullRom = (
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  u: number,
): [number, number] => {
  const u2 = u * u;
  const u3 = u2 * u;
  return [
    0.5 *
      (2 * p1[0] +
        (-p0[0] + p2[0]) * u +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
    0.5 *
      (2 * p1[1] +
        (-p0[1] + p2[1]) * u +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
  ];
};

const PATH: [number, number][] = (() => {
  const pts: [number, number][] = [];
  const n = CONTROL.length;
  const samples = 24;
  for (let i = 0; i < n; i++) {
    const p0 = CONTROL[(i - 1 + n) % n];
    const p1 = CONTROL[i];
    const p2 = CONTROL[(i + 1) % n];
    const p3 = CONTROL[(i + 2) % n];
    for (let s = 0; s < samples; s++) pts.push(catmullRom(p0, p1, p2, p3, s / samples));
  }
  pts.push(pts[0]);
  return pts;
})();

const pointAt = (p: number, w: number, h: number): [number, number] => {
  const t = Math.max(0, Math.min(1, p)) * (PATH.length - 1);
  const i = Math.min(Math.floor(t), PATH.length - 2);
  const f = t - i;
  const a = PATH[i];
  const b = PATH[i + 1];
  return [(a[0] + (b[0] - a[0]) * f) * w, (a[1] + (b[1] - a[1]) * f) * h];
};

export type Standing = {
  tokenId: number;
  progress: number;
  finished: boolean;
  isMine: boolean;
  color: string;
};

type Props = {
  /** Authoritative finish order, index 0 = winner. Empty = starting grid. */
  order: readonly bigint[];
  /** Entrants in join order, used to draw the grid before the draw lands. */
  entrants: readonly bigint[];
  /** The VRF word as a hex string — the choreography seeds its noise from it. */
  seed: string | undefined;
  myTokenId: bigint | undefined;
  baseDuration?: number;
};

/**
 * Owns the canvas and the whole animation. One rAF loop, started and cancelled
 * in a single effect, all mutable race state behind refs so a StrictMode double
 * invoke tears the first loop down completely and the second starts clean.
 *
 * The live leaderboard is rendered here rather than by the parent: the loop
 * updates ~5x/second instead of every frame, which keeps 60fps drawing from
 * triggering 60 React renders a second.
 */
export const RaceCanvas = ({ order, entrants, seed, myTokenId, baseDuration }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [elapsed, setElapsed] = useState(0);

  // Purely cosmetic (a ring and a label), and it arrives from a slower
  // multicall than the one that starts the race. Kept in a ref so it can never
  // land mid-animation and restart it from the starting line.
  const mineRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    mineRef.current = myTokenId === undefined ? undefined : Number(myTokenId);
  }, [myTokenId]);

  // Stable primitive keys: bigint arrays are new objects on every read, and
  // depending on their identity would restart the animation on every poll.
  const orderKey = order.map(String).join(",");
  const entrantsKey = entrants.map(String).join(",");

  const colorOf = useMemo(() => {
    const ids = (entrants.length ? entrants : order).map(Number);
    const map = new Map<number, string>();
    ids.forEach((id, i) => map.set(id, LANE_COLORS[i % LANE_COLORS.length]));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrantsKey, orderKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ids = orderKey ? orderKey.split(",").map(Number) : [];
    const gridIds = entrantsKey ? entrantsKey.split(",").map(Number) : [];
    const running = ids.length > 0 && Boolean(seed);

    // rankGap has to be scaled with baseDuration, not left at the module's 0.35.
    // That default was tuned against an 18s race, where it spreads the field
    // over 13.6% of the total. Stretched to 95s and left alone it becomes 2.6%,
    // and the whole field crosses the line inside a few pixels of track.
    const duration = baseDuration ?? SHOWCASE_BASE_DURATION;
    const schedules: Schedule[] = running
      ? Choreo.buildSchedules(ids, seed as string, {
          baseDuration: duration,
          rankGap: (duration * Choreo.DEFAULTS.rankGap) / Choreo.DEFAULTS.baseDuration,
        })
      : [];
    const raceLength = schedules.length ? Math.max(...schedules.map(s => s.total)) : 0;

    let raf = 0;
    let startedAt: number | null = null;
    let lastBoard = 0;
    let finishedAnnounced = false;

    const drawTrack = (w: number, h: number) => {
      ctx.beginPath();
      PATH.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      ctx.closePath();
      ctx.strokeStyle = "#232c38";
      ctx.lineWidth = 26;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.strokeStyle = "#2f3c4c";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      const [sx, sy] = pointAt(0, w, h);
      ctx.fillStyle = "#e6edf3";
      ctx.fillRect(sx - 1.5, sy - 13, 3, 26);
    };

    /** A marble: lane-coloured disc, "#N" badge, and a ring if it is the viewer's. */
    const drawMarble = (id: number, x: number, y: number) => {
      const r = 14;
      const isMine = id === mineRef.current;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = colorOf.get(id) ?? "#5b6673";
      ctx.fill();
      ctx.lineWidth = isMine ? 3.5 : 1.5;
      ctx.strokeStyle = isMine ? "#ffffff" : "rgba(255,255,255,.3)";
      ctx.stroke();
      if (isMine) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // The tokenId ON the racer — mandatory, this is how anyone finds their marble.
      ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,.65)";
      ctx.strokeText(`#${id}`, x, y);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`#${id}`, x, y);
    };

    const frame = (now: number) => {
      if (startedAt === null) startedAt = now;
      const w = canvas.width;
      const h = canvas.height;
      const t = (now - startedAt) / 1000;
      ctx.clearRect(0, 0, w, h);
      drawTrack(w, h);

      if (!running) {
        // Starting grid: lined up behind the start, no motion, no progress bar.
        // The draw has not landed, so any movement here would be a lie about
        // state. The track is a closed loop, so the stagger wraps backwards from
        // the line instead of going negative — pointAt clamps to [0,1] and would
        // otherwise stack the whole field on one pixel.
        // 2% of the lap per marble ≈ 40px of track at this canvas size, enough
        // to clear a 28px disc. Tighter and the field reads as one blob.
        gridIds.forEach((id, i) => {
          const [x, y] = pointAt(1 - 0.02 * (i + 1), w, h);
          drawMarble(id, x, y);
        });
        setStandings(
          gridIds.map(id => ({
            tokenId: id,
            progress: 0,
            finished: false,
            isMine: id === mineRef.current,
            color: colorOf.get(id) ?? "#5b6673",
          })),
        );
        // Nothing moves until the draw lands, so draw once and stop. A 60fps
        // loop over a static grid would spin for the whole join window.
        return;
      }

      const live = schedules.map(s => ({
        s,
        p: Choreo.progressAt(s, t),
        finished: t >= s.total,
      }));

      // Trailing marbles first so leaders sit on top.
      live
        .slice()
        .sort((a, b) => a.p - b.p)
        .forEach(({ s, p, finished }) => {
          // progressAt saturates at exactly 1, and the track is a closed loop so
          // pointAt(1) === pointAt(0). Left alone every finisher lands on the
          // same pixel and the final frame shows one marble instead of a podium.
          // Park them in a fan just past the line, in finishing order.
          const drawP = finished ? 1 - 0.018 * (s.rank + 1) : p;
          const [x, y] = pointAt(drawP, w, h);
          drawMarble(s.marbleId, x, y);
        });

      if (now - lastBoard > 200) {
        lastBoard = now;
        setElapsed(t);
        setStandings(
          live
            .slice()
            .sort((a, b) => b.p - a.p)
            .map(({ s, p, finished }) => ({
              tokenId: s.marbleId,
              progress: p,
              finished,
              isMine: s.marbleId === mineRef.current,
              color: colorOf.get(s.marbleId) ?? "#5b6673",
            })),
        );
      }

      if (t < raceLength) {
        raf = requestAnimationFrame(frame);
      } else if (!finishedAnnounced) {
        finishedAnnounced = true;
        setElapsed(raceLength);
        setStandings(
          ids.map(id => ({
            tokenId: id,
            progress: 1,
            finished: true,
            isMine: id === mineRef.current,
            color: colorOf.get(id) ?? "#5b6673",
          })),
        );
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // myTokenId is deliberately absent: it is read through mineRef so a late
    // ownerOf multicall cannot restart a race that is already running.
  }, [orderKey, entrantsKey, seed, baseDuration, colorOf]);

  const racing = order.length > 0 && Boolean(seed);

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <div className="flex-1 min-w-0 w-full">
        <canvas
          ref={canvasRef}
          width={760}
          height={520}
          className="w-full h-auto rounded-xl border border-base-300 bg-base-300/40"
        />
        {racing && (
          <div className="text-xs text-base-content/60 mt-2 tabular-nums">
            {elapsed.toFixed(1)}s de carrera · el orden de llegada ya estaba fijado antes de la primera vuelta
          </div>
        )}
      </div>

      <div className="w-full lg:w-72 shrink-0">
        <div className="text-xs uppercase tracking-wide text-base-content/60 mb-2">
          {racing ? "Posiciones en vivo" : "Parrilla de partida"}
        </div>
        <ol className="flex flex-col gap-1">
          {standings.map((s, i) => (
            <li
              key={s.tokenId}
              className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${
                s.isMine ? "bg-primary/20 ring-1 ring-primary" : "bg-base-200"
              }`}
            >
              <span className="w-5 text-right tabular-nums text-base-content/60">{racing ? i + 1 : "–"}</span>
              <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="font-semibold tabular-nums">#{s.tokenId}</span>
              {s.isMine && <span className="badge badge-primary badge-xs font-bold">MY MARBLE</span>}
              <span className="ml-auto text-xs tabular-nums text-base-content/60">
                {s.finished ? "🏁" : racing ? `${Math.round(s.progress * 100)}%` : "en la línea"}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Choreo, RACE_DYNAMICS, SHOWCASE_BASE_DURATION, Schedule } from "~~/utils/marble/choreo";

/**
 * The circuit — a rounded homage to the Shanghai International Circuit.
 *
 * Normalised 0-1, scaled to the canvas at draw time, fed through a Catmull-Rom
 * spline and closed into a loop. Shanghai's straights are deliberately rounded
 * off here: a straight is dead screen time for a marble race, where the reason
 * to keep watching is the pack trading places.
 *
 * The choreography is time-based — `progressAt` returns 0→1 across `total`
 * seconds however long the path is — so a longer, curvier track does NOT make
 * the race longer. It makes the marbles cover more ground per second, which
 * reads as speed. Same lap time, more circuit. And since these points only map
 * progress to pixels, no shape here can change who wins.
 */
const CONTROL: [number, number][] = [
  [0.1, 0.55], // start/finish — the grid and the finish fan anchor here
  [0.09, 0.43],
  [0.12, 0.32],
  [0.19, 0.23],
  [0.28, 0.17],
  [0.38, 0.15], // sweeping top-left arc
  [0.46, 0.19],
  [0.51, 0.27], // dip
  [0.57, 0.31],
  [0.63, 0.26],
  [0.67, 0.17], // rise back up
  [0.75, 0.12],
  [0.84, 0.14],
  [0.9, 0.22],
  [0.91, 0.32],
  [0.86, 0.4],
  [0.78, 0.42],
  [0.71, 0.46], // infield sweep
  [0.67, 0.53],
  [0.7, 0.61],
  [0.77, 0.65],
  [0.85, 0.68],
  [0.9, 0.76],
  [0.87, 0.85], // bottom-right hairpin
  [0.78, 0.89],
  [0.68, 0.87],
  [0.61, 0.81],
  [0.54, 0.75],
  [0.46, 0.76], // bottom esses
  [0.4, 0.82],
  [0.32, 0.88],
  [0.23, 0.89],
  [0.15, 0.84],
  [0.11, 0.75],
  [0.12, 0.65],
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

const TRACK_OUTER = 52;
const TRACK_INNER = 46;
const MARBLE_R = 10;
/** Cinematic zoom, same as the original 2D spike. */
const FOLLOW_ZOOM = 2.4;

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

type TrackPoint = { x: number; y: number; nx: number; ny: number };

/**
 * Position on the track at progress p, plus the unit normal in pixel space.
 * The normal is what puts marbles on their own racing line and stands the
 * checkpoint bars across the track instead of along it.
 */
const pointAt = (p: number, w: number, h: number): TrackPoint => {
  const t = Math.max(0, Math.min(1, p)) * (PATH.length - 1);
  const i = Math.min(Math.floor(t), PATH.length - 2);
  const f = t - i;
  const a = PATH[i];
  const b = PATH[i + 1];
  const x = (a[0] + (b[0] - a[0]) * f) * w;
  const y = (a[1] + (b[1] - a[1]) * f) * h;
  const dx = (b[0] - a[0]) * w;
  const dy = (b[1] - a[1]) * h;
  const len = Math.hypot(dx, dy) || 1;
  return { x, y, nx: -dy / len, ny: dx / len };
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
  /** Fires once when the marbles stop — used to un-blur the podium. */
  onFinish?: () => void;
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
export const RaceCanvas = ({ order, entrants, seed, myTokenId, baseDuration, onFinish }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [camera, setCamera] = useState<"overview" | "follow">("overview");

  // Everything below is read through a ref inside the loop rather than being an
  // effect dependency. Any of these changing mid-race would otherwise tear down
  // the animation and restart it from the starting line in front of the crowd.
  const mineRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    mineRef.current = myTokenId === undefined ? undefined : Number(myTokenId);
  }, [myTokenId]);

  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  // Stable primitive keys: bigint arrays are new objects on every read, and
  // depending on their identity would restart the animation on every poll.
  const orderKey = order.map(String).join(",");
  const entrantsKey = entrants.map(String).join(",");

  const { colorOf, laneOf } = useMemo(() => {
    const ids = (entrants.length ? entrants : order).map(Number);
    const colors = new Map<number, string>();
    const lanes = new Map<number, number>();
    // Spread the field across the width of the track, centred on the middle.
    const n = Math.max(ids.length, 1);
    ids.forEach((id, i) => {
      colors.set(id, LANE_COLORS[i % LANE_COLORS.length]);
      lanes.set(id, (i - (n - 1) / 2) * Math.min(5, (TRACK_INNER - MARBLE_R) / n));
    });
    return { colorOf: colors, laneOf: lanes };
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
    // over 13.6% of the total. Stretched and left alone it shrinks to a couple
    // of percent and the whole field crosses the line inside a few pixels.
    const duration = baseDuration ?? SHOWCASE_BASE_DURATION;
    const schedules: Schedule[] = running
      ? Choreo.buildSchedules(ids, seed as string, {
          baseDuration: duration,
          rankGap: (duration * Choreo.DEFAULTS.rankGap) / Choreo.DEFAULTS.baseDuration,
          ...RACE_DYNAMICS,
        })
      : [];
    const raceLength = schedules.length ? Math.max(...schedules.map(s => s.total)) : 0;

    let raf = 0;
    let startedAt: number | null = null;
    let lastBoard = 0;
    let finishedAnnounced = false;

    const drawTrack = (w: number, h: number) => {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const stroke = (width: number, color: string) => {
        ctx.beginPath();
        PATH.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
        ctx.closePath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      };
      // Broad two-tone tarmac, as in the original spike — wide enough for the
      // field to run side by side instead of nose to tail.
      stroke(TRACK_OUTER, "#1b2430");
      stroke(TRACK_INNER, "#232f3d");

      // Checkpoint bars stood across the track at the segment boundaries — the
      // exact points where the choreography lets positions swap. Drawn from the
      // same constant the schedules use, so they can never drift apart.
      for (let i = 0; i < RACE_DYNAMICS.segments; i++) {
        const pt = pointAt(i / RACE_DYNAMICS.segments, w, h);
        ctx.save();
        ctx.translate(pt.x, pt.y);
        // Rotating to the normal puts local +X across the track, so the long
        // side of the bar spans it. (Putting the long side on local Y instead
        // lays the bar along the direction of travel and it reads as a centre
        // line, which is what the original spike accidentally drew.)
        ctx.rotate(Math.atan2(pt.ny, pt.nx));
        ctx.fillStyle = i === 0 ? "#e6edf3" : "#33445a";
        ctx.fillRect(-TRACK_INNER / 2, -1.5, TRACK_INNER, 3);
        ctx.restore();
      }
    };

    /** A marble: lane-coloured disc, "#N" badge, and a ring if it is the viewer's. */
    const drawMarble = (id: number, x: number, y: number) => {
      const isMine = id === mineRef.current;
      ctx.beginPath();
      ctx.arc(x, y, MARBLE_R, 0, Math.PI * 2);
      ctx.fillStyle = colorOf.get(id) ?? "#5b6673";
      ctx.fill();
      ctx.lineWidth = isMine ? 3 : 1.5;
      ctx.strokeStyle = isMine ? "#ffffff" : "rgba(0,0,0,.45)";
      ctx.stroke();
      if (isMine) {
        ctx.beginPath();
        ctx.arc(x, y, MARBLE_R + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // The tokenId ON the racer — mandatory, this is how anyone finds their marble.
      ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,.6)";
      ctx.strokeText(`#${id}`, x, y);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`#${id}`, x, y);
    };

    const place = (p: number, id: number, w: number, h: number) => {
      const pt = pointAt(p, w, h);
      const lane = laneOf.get(id) ?? 0;
      return { x: pt.x + pt.nx * lane, y: pt.y + pt.ny * lane };
    };

    const frame = (now: number) => {
      if (startedAt === null) startedAt = now;
      const w = canvas.width;
      const h = canvas.height;
      const t = (now - startedAt) / 1000;

      const live = schedules.map(s => ({
        s,
        p: Choreo.progressAt(s, t),
        finished: t >= s.total,
      }));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Cinematic camera: lock onto whoever is furthest round. Computed from the
      // same positions that get drawn, so the view can never lag the marbles.
      if (cameraRef.current === "follow" && live.length) {
        const lead = live.reduce((a, b) => (b.p > a.p ? b : a), live[0]);
        const lp = place(lead.p, lead.s.marbleId, w, h);
        ctx.setTransform(FOLLOW_ZOOM, 0, 0, FOLLOW_ZOOM, w / 2 - lp.x * FOLLOW_ZOOM, h / 2 - lp.y * FOLLOW_ZOOM);
      }

      drawTrack(w, h);

      if (!running) {
        // Starting grid: lined up behind the line, no motion, no progress bar.
        // The draw has not landed, so any movement here would be a lie about
        // state. The track is a closed loop, so the stagger wraps backwards.
        gridIds.forEach((id, i) => {
          const { x, y } = place(1 - 0.012 * (i + 1), id, w, h);
          drawMarble(id, x, y);
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // The grid list is static, so it is published once outside this loop.
        // Setting it here would allocate a new array 60x a second and re-render
        // React just as often — that crashed the page outright.
        //
        // The loop still runs: nothing moves, but the camera control has to
        // stay responsive while we wait for the draw.
        raf = requestAnimationFrame(frame);
        return;
      }

      // Trailing marbles first so leaders sit on top.
      live
        .slice()
        .sort((a, b) => a.p - b.p)
        .forEach(({ s, p, finished }) => {
          // progressAt saturates at exactly 1, and the track is a closed loop so
          // pointAt(1) === pointAt(0). Left alone every finisher lands on the
          // same spot and the final frame shows one marble instead of a podium.
          // Park them in a fan just past the line, in finishing order.
          const drawP = finished ? 1 - 0.011 * (s.rank + 1) : p;
          const { x, y } = place(drawP, s.marbleId, w, h);
          drawMarble(s.marbleId, x, y);
        });

      ctx.setTransform(1, 0, 0, 1, 0, 0);

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
        onFinishRef.current?.();
      }
    };

    // Published once per race setup rather than per frame — see the grid branch.
    if (!running) {
      setStandings(
        gridIds.map(id => ({
          tokenId: id,
          progress: 0,
          finished: false,
          isMine: id === mineRef.current,
          color: colorOf.get(id) ?? "#5b6673",
        })),
      );
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // myTokenId, camera and onFinish are read through refs on purpose — see above.
  }, [orderKey, entrantsKey, seed, baseDuration, colorOf, laneOf]);

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
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <div className="join">
            <button
              className={`btn btn-xs join-item ${camera === "overview" ? "btn-active" : ""}`}
              onClick={() => setCamera("overview")}
            >
              Circuito completo
            </button>
            <button
              className={`btn btn-xs join-item ${camera === "follow" ? "btn-active" : ""}`}
              onClick={() => setCamera("follow")}
            >
              Cámara al líder
            </button>
          </div>
          {racing && (
            <span className="text-xs text-base-content/60 tabular-nums">
              {elapsed.toFixed(1)}s · el orden de llegada ya estaba fijado antes de la primera vuelta
            </span>
          )}
        </div>
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

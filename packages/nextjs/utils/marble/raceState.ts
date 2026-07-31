/**
 * The contract's Status enum has 6 values, but `Open` alone covers five
 * operationally distinct situations that the contract does not model — whether
 * you may join, start, or cancel depends on the entrant count and the deadline.
 * The UI has to derive them, so the derivation lives here as one pure function
 * with no React in it.
 *
 * `Cancelled` is ambiguous on purpose: it is reachable from `Open` (nobody came)
 * and from `Drawing` via rescueStalled (the draw never landed). Both emit a bare
 * RaceCancelled with no reason, so the only way to tell them apart is whether a
 * RaceDrawing event exists for that raceId — hence `hadDrawing`. On stage these
 * are very different stories and must not share copy.
 */

/** Mirrors MarbleRace.Status. A const object rather than an enum: enums are not
 * erasable syntax, so node's type-stripping test runner cannot load them. */
export const RaceStatus = {
  None: 0,
  Open: 1,
  Drawing: 2,
  Drawn: 3,
  Settled: 4,
  Cancelled: 5,
} as const;

export type RaceStatus = (typeof RaceStatus)[keyof typeof RaceStatus];

/** MarbleRace.RESCUE_DELAY — 1 day, a compile-time constant on-chain. */
export const RESCUE_DELAY = 86400n;

export type RacePhase =
  | "none"
  | "open-filling"
  | "open-ready"
  | "open-full"
  | "open-expired-startable"
  | "open-expired-dead"
  | "drawing"
  | "drawing-stalled"
  | "drawn"
  | "settled"
  | "cancelled-empty"
  | "cancelled-stalled";

export type RaceInputs = {
  status: RaceStatus;
  entrantCount: bigint;
  deadline: bigint;
  minPlayers: bigint;
  maxPlayers: bigint;
  /** Chain time, not the browser clock — the contract compares against block.timestamp. */
  now: bigint;
  /** Whether a RaceDrawing event exists for this race. Only used to explain a cancel. */
  hadDrawing?: boolean;
};

export type RaceView = {
  phase: RacePhase;
  canJoin: boolean;
  /** True when `startRace` would pass its guards right now. */
  canStart: boolean;
  canCancel: boolean;
  canRescue: boolean;
  /** True while the pot is committed and the outcome is not knowable yet. */
  isRacing: boolean;
  headline: string;
  detail: string;
};

const VIEW: Record<RacePhase, Omit<RaceView, "phase">> = {
  none: {
    canJoin: false,
    canStart: false,
    canCancel: false,
    canRescue: false,
    isRacing: false,
    headline: "Esta carrera no existe",
    detail: "Ningún carril reservado con ese número.",
  },
  "open-filling": {
    canJoin: true,
    canStart: false,
    canCancel: false,
    canRescue: false,
    isRacing: false,
    headline: "Inscripción abierta",
    detail: "Faltan bolitas para llegar al mínimo. Todavía no se puede largar.",
  },
  "open-ready": {
    canJoin: true,
    canStart: false,
    canCancel: false,
    canRescue: false,
    isRacing: false,
    headline: "Mínimo alcanzado — sigue abierta",
    detail: "Ya hay podio posible. La largada espera a que se llene o a que cierre el plazo.",
  },
  "open-full": {
    canJoin: false,
    canStart: true,
    canCancel: false,
    canRescue: false,
    isRacing: false,
    headline: "¡Parrilla completa!",
    detail: "Todos los carriles ocupados. Se puede largar ya mismo.",
  },
  "open-expired-startable": {
    canJoin: false,
    canStart: true,
    canCancel: false,
    canRescue: false,
    isRacing: false,
    headline: "Plazo cerrado — lista para largar",
    detail: "No se llenó, pero llegó al mínimo. Se larga con las que están.",
  },
  "open-expired-dead": {
    canJoin: false,
    canStart: false,
    canCancel: true,
    canRescue: false,
    isRacing: false,
    headline: "No llegó gente",
    detail: "El plazo cerró sin alcanzar el mínimo. Se cancela y se devuelve todo.",
  },
  drawing: {
    canJoin: false,
    canStart: false,
    canCancel: false,
    canRescue: false,
    isRacing: true,
    headline: "Pidiendo el número al azar",
    detail: "Chainlink VRF está firmando la aleatoriedad. Suele tardar unos 60 segundos.",
  },
  "drawing-stalled": {
    canJoin: false,
    canStart: false,
    canCancel: false,
    canRescue: true,
    isRacing: false,
    headline: "El sorteo nunca llegó",
    detail: "Pasó el plazo de gracia sin respuesta del sorteo. Se puede liberar el pote y las bolitas.",
  },
  drawn: {
    canJoin: false,
    canStart: false,
    canCancel: false,
    canRescue: false,
    isRacing: true,
    headline: "¡Número sorteado — corriendo!",
    detail: "El orden de llegada ya está determinado y es verificable. Falta liquidar los premios.",
  },
  settled: {
    canJoin: false,
    canStart: false,
    canCancel: false,
    canRescue: false,
    isRacing: false,
    headline: "Carrera liquidada",
    detail: "Premios pagados, casa quemada y bolitas liberadas para volver a correr.",
  },
  "cancelled-empty": {
    canJoin: false,
    canStart: false,
    canCancel: false,
    canRescue: false,
    isRacing: false,
    headline: "Cancelada — no llegó gente",
    detail: "El plazo cerró sin alcanzar el mínimo. Cada entrada fue devuelta.",
  },
  "cancelled-stalled": {
    canJoin: false,
    canStart: false,
    canCancel: false,
    canRescue: false,
    isRacing: false,
    headline: "Cancelada — el sorteo nunca llegó",
    detail: "Se pidió la aleatoriedad pero nunca respondió. El pote se devolvió íntegro.",
  },
};

const phaseOf = (i: RaceInputs): RacePhase => {
  switch (i.status) {
    case RaceStatus.Open: {
      // A full field can start at any time; the deadline only gates a short field.
      if (i.entrantCount >= i.maxPlayers) return "open-full";
      if (i.now <= i.deadline) return i.entrantCount < i.minPlayers ? "open-filling" : "open-ready";
      // Past the deadline `cancel` reverts EnoughPlayers once the minimum is met,
      // so a startable race is never also cancellable.
      return i.entrantCount >= i.minPlayers ? "open-expired-startable" : "open-expired-dead";
    }
    case RaceStatus.Drawing:
      return i.now > i.deadline + RESCUE_DELAY ? "drawing-stalled" : "drawing";
    case RaceStatus.Drawn:
      return "drawn";
    case RaceStatus.Settled:
      return "settled";
    case RaceStatus.Cancelled:
      return i.hadDrawing ? "cancelled-stalled" : "cancelled-empty";
    default:
      return "none";
  }
};

export const deriveRaceView = (i: RaceInputs): RaceView => {
  const phase = phaseOf(i);
  return { phase, ...VIEW[phase] };
};

/** `pot = entryFee × (entrants + 1)` — the host seeds one entry on top of the field. */
export const potOf = (entryFee: bigint, entrantCount: bigint) => entryFee * (entrantCount + 1n);

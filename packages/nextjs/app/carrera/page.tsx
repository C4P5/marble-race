"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Address as AddressDisplay } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { Abi, Address, formatEther } from "viem";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { FairnessPanel } from "~~/app/carrera/_components/FairnessPanel";
import { JoinBox } from "~~/app/carrera/_components/JoinBox";
import { RaceCanvas } from "~~/app/carrera/_components/RaceCanvas";
import { useRaceData } from "~~/hooks/marble/useRaceData";
import { useDeployedContractInfo, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { SHOWCASE_BASE_DURATION } from "~~/utils/marble/choreo";
import { recomputeFinishOrder } from "~~/utils/marble/fairness";
import { RaceStatus } from "~~/utils/marble/raceState";

/** Race 1 is Settled on Sepolia — the replay this page was built against. */
const DEFAULT_RACE_ID = 1n;

const MEDALS = ["🥇", "🥈", "🥉"];

const Carrera: NextPage = () => {
  const [raceId, setRaceId] = useState<bigint>(DEFAULT_RACE_ID);
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: nftContract } = useDeployedContractInfo({ contractName: "MarbleNFT" });

  const race = useRaceData(raceId);
  const { view, entrants, onChainFinishOrder, randomWord, status } = race;

  // Owners of every entrant. Needed twice over: the podium must show who owns a
  // marble NOW (prizes go to nft.ownerOf at settle time, not to whoever paid the
  // entry), and it is how the viewer's own marble is found in this field.
  const { data: ownerData } = useReadContracts({
    allowFailure: true,
    contracts:
      nftContract && entrants
        ? entrants.map(id => ({
            address: nftContract.address,
            abi: nftContract.abi as Abi,
            functionName: "ownerOf" as const,
            args: [id] as const,
          }))
        : [],
    query: { enabled: Boolean(nftContract && entrants?.length) },
  });

  const ownerOf = useMemo(() => {
    const map = new Map<string, Address>();
    entrants?.forEach((id, i) => {
      const r = ownerData?.[i];
      if (r?.status === "success" && r.result) map.set(id.toString(), r.result as Address);
    });
    return map;
  }, [entrants, ownerData]);

  const myTokenId = useMemo(() => {
    if (!connectedAddress || !entrants) return undefined;
    return entrants.find(id => ownerOf.get(id.toString())?.toLowerCase() === connectedAddress.toLowerCase());
  }, [connectedAddress, entrants, ownerOf]);

  // The finish order is computable the instant RaceDrawn delivers the word —
  // before `settle` is mined. That is what lets the animation start during the
  // dead-air window instead of after it. Falls back to the chain's stored order
  // if the word could not be recovered (a race older than the log scan window).
  const computedOrder = useMemo(
    () => (entrants?.length && randomWord !== undefined ? recomputeFinishOrder(entrants, randomWord) : []),
    [entrants, randomWord],
  );
  const displayOrder: readonly bigint[] = computedOrder.length ? computedOrder : (onChainFinishOrder ?? []);

  // Choreo seeds its per-marble noise from this string, so the same race always
  // animates identically. Deliberately undefined until the real VRF word is in
  // hand: a placeholder seed would start the animation and then be replaced when
  // the log scan returns a second later, snapping the race back to the line in
  // front of the audience. Without a word the canvas holds the starting grid.
  const seed = randomWord !== undefined ? `0x${randomWord.toString(16)}` : undefined;

  const isHost = Boolean(connectedAddress && race.host && connectedAddress.toLowerCase() === race.host.toLowerCase());

  return (
    <div className="flex flex-col gap-5 py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold m-0">Carrera de bolitas</h1>
          <p className="text-sm text-base-content/60 m-0">
            El azar lo firma Chainlink VRF. El orden de llegada se puede recalcular acá mismo.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-base-content/60">Carrera Nº</span>
          <input
            type="number"
            min={1}
            value={Number(raceId)}
            // Math.trunc is load-bearing: a number input yields "1.5" for a
            // valid decimal and BigInt(1.5) throws, which in an onChange handler
            // takes the whole page down to an error boundary.
            onChange={e => setRaceId(BigInt(Math.trunc(Math.max(1, Number(e.target.value) || 1))))}
            // A focused number input eats wheel events and would silently change
            // the race out from under the operator when they scroll the page.
            onWheel={e => e.currentTarget.blur()}
            className="input input-sm input-bordered w-20 tabular-nums"
          />
        </label>
      </header>

      <StatusBar race={race} isHost={isHost} />

      <RaceCanvas
        order={displayOrder}
        entrants={entrants ?? []}
        seed={seed}
        myTokenId={myTokenId}
        baseDuration={SHOWCASE_BASE_DURATION}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <RaceFacts race={race} myTokenId={myTokenId} />
          <Podium order={displayOrder} ownerOf={ownerOf} settled={status === RaceStatus.Settled} pot={race.pot} />
        </div>
        <div className="flex flex-col gap-5">
          <FairnessPanel entrants={entrants} onChainOrder={onChainFinishOrder} randomWord={randomWord} />
          <HostControls race={race} isHost={isHost} publicClient={publicClient} connectedAddress={connectedAddress} />
          <JoinBox
            raceId={raceId}
            entryFee={race.entryFee}
            canJoin={Boolean(view?.canJoin)}
            alreadyIn={myTokenId !== undefined}
            entrants={entrants}
          />
        </div>
      </div>

      {view?.phase === "drawing" && (
        <p className="text-xs text-base-content/50 text-center">
          Sin barra de progreso a propósito: nadie sabe cuánto tarda el sorteo, y una barra que llega al 100% antes que
          la respuesta sería mentira.
        </p>
      )}
    </div>
  );
};

const StatusBar = ({ race, isHost }: { race: ReturnType<typeof useRaceData>; isHost: boolean }) => {
  const { view, isLoading, error, refetch } = race;
  // With allowFailure:false one failed call empties the batch, which would
  // otherwise leave a grey skeleton shimmering forever with isLoading already
  // false — indistinguishable from a hung app on a projector.
  if (error) {
    return (
      <div className="rounded-xl ring-1 ring-error/40 bg-error/15 px-4 py-3 flex flex-wrap items-center gap-3">
        <div>
          <div className="font-bold">No se pudo leer la carrera</div>
          <div className="text-sm text-base-content/70">
            El nodo RPC no respondió. Los datos de la carrera están en la cadena, es la lectura lo que falló.
          </div>
        </div>
        <button className="btn btn-sm ml-auto" onClick={() => refetch()}>
          Reintentar
        </button>
      </div>
    );
  }
  if (isLoading || !view) {
    return <div className="skeleton h-16 w-full rounded-xl" />;
  }
  const tone =
    view.phase === "settled"
      ? "bg-success/15 ring-success/40"
      : view.phase.startsWith("cancelled") || view.phase === "drawing-stalled" || view.phase === "none"
        ? "bg-error/15 ring-error/40"
        : view.isRacing
          ? "bg-warning/15 ring-warning/40"
          : "bg-info/15 ring-info/40";
  return (
    <div className={`rounded-xl ring-1 px-4 py-3 ${tone}`}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-bold">{view.headline}</span>
        {isHost && <span className="badge badge-sm badge-outline">sos el anfitrión</span>}
      </div>
      <div className="text-sm text-base-content/70">{view.detail}</div>
    </div>
  );
};

const RaceFacts = ({ race, myTokenId }: { race: ReturnType<typeof useRaceData>; myTokenId: bigint | undefined }) => {
  const { entrantCount, minPlayers, maxPlayers, entryFee, pot, specialId, host, entrants } = race;
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">La carrera</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Fact
            label="Bolitas en pista"
            value={`${entrantCount ?? "–"} / ${maxPlayers ?? "–"}`}
            note={`mínimo ${minPlayers ?? "–"}`}
          />
          <Fact label="Entrada" value={entryFee !== undefined ? `${formatEther(entryFee)} MRBL` : "–"} />
          <Fact
            label="Pote"
            value={pot !== undefined ? `${formatEther(pot)} MRBL` : "–"}
            // Non-obvious and it confuses every audience: the pot is one entry
            // bigger than the field because the hosting special seeds one.
            note={
              entryFee !== undefined && entrantCount !== undefined
                ? `${formatEther(entryFee)} × (${entrantCount} bolitas + 1 del anfitrión)`
                : undefined
            }
          />
          <Fact label="Anfitriona" value={specialId !== undefined ? `Especial #${specialId}` : "–"} />
        </div>

        {host && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-base-content/60">Dueño de la anfitriona:</span>
            <AddressDisplay address={host} size="sm" />
          </div>
        )}

        {entrants && entrants.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-base-content/60 mb-1">Inscriptas</div>
            <div className="flex flex-wrap gap-1">
              {entrants.map(id => (
                <span
                  key={id.toString()}
                  className={`badge badge-sm tabular-nums ${
                    myTokenId === id ? "badge-primary font-bold" : "badge-ghost"
                  }`}
                >
                  #{id.toString()}
                  {myTokenId === id && <span className="ml-1 text-[10px]">MY MARBLE</span>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Fact = ({ label, value, note }: { label: string; value: string; note?: string }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-base-content/60">{label}</div>
    <div className="font-semibold tabular-nums">{value}</div>
    {note && <div className="text-[11px] text-base-content/50">{note}</div>}
  </div>
);

const Podium = ({
  order,
  ownerOf,
  settled,
  pot,
}: {
  order: readonly bigint[];
  ownerOf: Map<string, Address>;
  settled: boolean;
  pot: bigint | undefined;
}) => {
  if (order.length < 3) return null;
  // 50 / 25 / 12.5 of the pot; the winner absorbs the rounding so nothing is dust.
  const shares = pot === undefined ? [] : [(pot * 5000n) / 10000n, (pot * 2500n) / 10000n, (pot * 1250n) / 10000n];
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">Podio</h2>
        <ol className="flex flex-col gap-2">
          {order.slice(0, 3).map((id, i) => {
            const owner = ownerOf.get(id.toString());
            return (
              <li key={id.toString()} className="flex items-center gap-3 bg-base-200 rounded-lg px-3 py-2">
                <span className="text-xl">{MEDALS[i]}</span>
                <span className="font-bold tabular-nums">#{id.toString()}</span>
                <div className="ml-auto flex flex-col items-end gap-0.5">
                  {shares[i] !== undefined && (
                    <span className="text-sm font-semibold tabular-nums">{formatEther(shares[i])} MRBL</span>
                  )}
                  {owner ? (
                    <AddressDisplay address={owner} size="xs" />
                  ) : (
                    <span className="text-xs text-base-content/50">dueño desconocido</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-xs text-base-content/50">
          {settled
            ? "El premio fue a quien era dueño de la bolita al liquidar, no a quien pagó la entrada. Nada bloquea una transferencia durante la carrera."
            : "Los premios van a quien sea dueño de la bolita en el momento de liquidar, no a quien pagó la entrada."}
        </p>
      </div>
    </div>
  );
};

/**
 * startRace/settle/rescueStalled are all permissionless. If every spectator's
 * tab fired them, N clients would race for one slot and every loser would show a
 * red error toast that reads as "the app is broken" on a projector. So auto-fire
 * is gated on the connected wallet being the host's, and a doomed call is
 * dropped silently after a simulation rather than sent.
 */
const HostControls = ({
  race,
  isHost,
  publicClient,
  connectedAddress,
}: {
  race: ReturnType<typeof useRaceData>;
  isHost: boolean;
  publicClient: ReturnType<typeof usePublicClient>;
  connectedAddress: Address | undefined;
}) => {
  const { view, raceAddress, raceAbi, status } = race;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef<Set<string>>(new Set());

  // Simulation happens here so a revert can be swallowed without a toast; the
  // scaffold hook's own simulate-and-notify would surface it.
  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "MarbleRace", disableSimulate: true });

  const fire = useCallback(
    async (fn: "startRace" | "settle" | "rescueStalled", opts?: { silent?: boolean }) => {
      if (!raceAddress || !raceAbi || !publicClient || !connectedAddress) return;
      setBusy(fn);
      setError(null);
      try {
        await publicClient.simulateContract({
          address: raceAddress,
          abi: raceAbi,
          functionName: fn,
          args: [race.raceId],
          account: connectedAddress,
        });
      } catch {
        // Someone else already did it, or it is genuinely not time yet. Both are
        // normal for a permissionless call and neither is worth a red toast.
        // A definitive revert, so the auto-fire attempt is spent either way.
        if (!opts?.silent) setError(ERROR_COPY[fn]);
        setBusy(null);
        return false;
      }
      try {
        await writeContractAsync({ functionName: fn, args: [race.raceId] });
        return true;
      } catch {
        // Simulation passed but the send did not land — a rejected signature, a
        // nonce hiccup, an RPC blip. Retryable, unlike the branch above.
        if (!opts?.silent) setError(ERROR_COPY[fn]);
        return false;
      } finally {
        setBusy(null);
      }
    },

    [raceAddress, raceAbi, publicClient, connectedAddress, writeContractAsync, race.raceId],
  );

  // Auto-fire, host only, once per (race, action). The key is claimed
  // synchronously before the first await, so a poll cycle cannot resubmit while
  // an attempt is in flight and a StrictMode double-invoke fires once.
  //
  // Deliberately NOT retried on failure: the most common failure is the host
  // rejecting the signature, and an auto-retry would re-prompt the wallet in a
  // loop on stage. Instead the failure is shown (not silent) and the manual
  // button stays on screen, so the host always has one thing to click.
  useEffect(() => {
    if (!isHost || busy || !view) return;
    const prefix = `${race.raceId}:`;
    const run = (fn: "startRace" | "settle") => {
      const key = prefix + fn;
      if (attempted.current.has(key)) return;
      attempted.current.add(key);
      fire(fn);
    };
    if (view.canStart) run("startRace");
    else if (status === RaceStatus.Drawn) run("settle");
  }, [isHost, busy, view, status, fire, race.raceId]);

  if (!view) return null;

  const actions: { fn: "startRace" | "settle" | "rescueStalled"; label: string; show: boolean }[] = [
    { fn: "startRace", label: "Largar la carrera", show: view.canStart },
    { fn: "settle", label: "Liquidar y pagar", show: status === RaceStatus.Drawn },
    { fn: "rescueStalled", label: "Liberar el pote", show: view.canRescue },
  ];
  const visible = actions.filter(a => a.show);

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">Controles</h2>

        {!connectedAddress ? (
          <p className="text-sm text-base-content/60">Conectá una wallet para operar la carrera.</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-base-content/60">
            Nada que hacer en este momento. {view.isRacing ? "La carrera está en curso." : ""}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visible.map(a => (
              <button key={a.fn} className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => fire(a.fn)}>
                {busy === a.fn && <span className="loading loading-spinner loading-xs" />}
                {busy === a.fn ? BUSY_COPY[a.fn] : a.label}
              </button>
            ))}
          </div>
        )}

        {isHost && (
          <p className="text-xs text-base-content/50">
            Como anfitrión, estas llamadas se intentan solas una vez. Si falla, el botón queda acá.
          </p>
        )}
        {error && <div className="rounded-lg bg-error/15 ring-1 ring-error/40 px-3 py-2 text-sm">{error}</div>}
      </div>
    </div>
  );
};

/**
 * Per-action copy. startRace and rescueStalled share the TooEarly() selector, so
 * a generic decoder would tell someone waiting on a draw that the race has not
 * started yet, and vice versa. Never surface the raw error.
 */
const ERROR_COPY: Record<string, string> = {
  startRace:
    "Todavía no se puede largar: falta que se llene la parrilla o que cierre el plazo con el mínimo de bolitas. Puede que alguien ya la haya largado.",
  settle:
    "Todavía no se puede liquidar: el número aleatorio no llegó, o alguien ya liquidó esta carrera hace un momento.",
  rescueStalled:
    "Todavía no se puede liberar el pote: hay un día de gracia después del plazo antes de dar el sorteo por perdido.",
};

const BUSY_COPY: Record<string, string> = {
  startRace: "Largando…",
  settle: "Liquidando…",
  rescueStalled: "Liberando…",
};

export default Carrera;

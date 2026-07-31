"use client";

import { useMemo } from "react";
import { finishOrderMatches, recomputeFinishOrder } from "~~/utils/marble/fairness";

type Props = {
  entrants: readonly bigint[] | undefined;
  onChainOrder: readonly bigint[] | undefined;
  randomWord: bigint | undefined;
};

const Column = ({ title, ids, sub }: { title: string; ids: readonly bigint[]; sub: string }) => (
  <div className="flex-1 min-w-0">
    <div className="text-xs uppercase tracking-wide text-base-content/60">{title}</div>
    <div className="text-[11px] text-base-content/50 mb-2">{sub}</div>
    <ol className="flex flex-col gap-1">
      {ids.map((id, i) => (
        <li key={`${i}-${id}`} className="flex items-center gap-2 text-sm bg-base-200 rounded px-2 py-0.5">
          <span className="w-4 text-right tabular-nums text-base-content/50">{i + 1}</span>
          <span className="font-semibold tabular-nums">#{id.toString()}</span>
        </li>
      ))}
    </ol>
  </div>
);

/**
 * The pitch centrepiece: recompute the finish order in the browser from nothing
 * but the public VRF word and the entrant list, and show it next to what the
 * contract actually stored. Matching 8/8 is the "probadamente justa" claim made
 * checkable live, without trusting us or an indexer.
 */
export const FairnessPanel = ({ entrants, onChainOrder, randomWord }: Props) => {
  const recomputed = useMemo(
    () =>
      entrants && entrants.length > 0 && randomWord !== undefined ? recomputeFinishOrder(entrants, randomWord) : [],
    [entrants, randomWord],
  );

  const chain = onChainOrder ?? [];
  const matches = finishOrderMatches(recomputed, chain);
  const canCompare = recomputed.length > 0 && chain.length > 0;

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">Prueba de justicia</h2>

        {randomWord === undefined ? (
          <p className="text-sm text-base-content/60">
            Esperando el número aleatorio de Chainlink VRF. Se publica en el evento{" "}
            <code className="text-xs">RaceDrawn</code> y no existe ninguna función de lectura que lo exponga, así que
            hasta que el sorteo llegue no hay nada que verificar.
          </p>
        ) : (
          <>
            <div>
              <div className="text-xs uppercase tracking-wide text-base-content/60">Número aleatorio (VRF)</div>
              <code className="text-[11px] break-all text-base-content/80">
                0x{randomWord.toString(16).padStart(64, "0")}
              </code>
            </div>

            <div className="flex gap-4">
              <Column title="La cadena dice" sub="getFinishOrder()" ids={chain} />
              <Column title="Tu navegador calcula" sub="Fisher-Yates + keccak256" ids={recomputed} />
            </div>

            {canCompare ? (
              <div
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  matches ? "bg-success/20 text-success-content ring-1 ring-success" : "bg-error/20 ring-1 ring-error"
                }`}
              >
                {matches
                  ? `✓ Coinciden ${chain.length}/${chain.length}. Recalculado acá, en tu máquina, sin confiar en nosotros.`
                  : "✗ NO coinciden. Algo no cierra — no confíes en este resultado."}
              </div>
            ) : (
              <div className="rounded-lg px-3 py-2 text-sm bg-base-200 text-base-content/70">
                El orden ya está determinado y calculado acá arriba. La cadena lo va a guardar cuando se liquide la
                carrera — recién entonces se pueden comparar las dos columnas.
              </div>
            )}

            <p className="text-xs text-base-content/50">
              El contrato mezcla con <code>keccak256(abi.encode(seed, i)) % (i+1)</code> para <code>i = n-1 … 1</code>.
              Esta página corre exactamente ese mismo bucle en viem.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

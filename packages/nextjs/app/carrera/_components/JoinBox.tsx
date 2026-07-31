"use client";

import { useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Abi, Address, formatEther } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

/** Ids 1-16 are the specials, which cannot race. Public marbles start at 17. */
const FIRST_PUBLIC_ID = 17n;
/** MarbleNFT.MAX_SUPPLY — a hard on-chain constant, so the sweep range is fixed. */
const MAX_SUPPLY = 256n;

/**
 * Deliberately minimal — the showcase race is operator-run with burner wallets,
 * so this exists to prove the path works from a browser, not to carry a crowd.
 *
 * Two steps on purpose: `join` pulls the entry fee with safeTransferFrom, so the
 * allowance has to exist first. Approve and Join are never shown at the same
 * time and each owns its own pending state.
 */
export const JoinBox = ({
  raceId,
  entryFee,
  canJoin,
  alreadyIn,
  entrants,
}: {
  raceId: bigint | undefined;
  entryFee: bigint | undefined;
  canJoin: boolean;
  alreadyIn: boolean;
  /** Checked directly here too — the parent's own derivation lags by two round trips. */
  entrants: readonly bigint[] | undefined;
}) => {
  const { address: connectedAddress } = useAccount();
  const { data: nftContract } = useDeployedContractInfo({ contractName: "MarbleNFT" });
  const { data: raceContract } = useDeployedContractInfo({ contractName: "MarbleRace" });
  const [busy, setBusy] = useState<"approve" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  // No wallet->tokenId lookup exists on-chain: MarbleNFT is not enumerable and
  // publicHoldings only answers 0 or 1, never *which*. One multicall over the
  // public range answers it in a single round trip, with no archive-RPC
  // dependency (the Transfer-log route silently dies on a non-archive node).
  //
  // Swept over the FIXED supply range rather than up to a watched `nextId`:
  // keyed on nextId, every mint by anyone in the room changes the query key,
  // drops `owners` to undefined, and flashes "you have no marble" at people who
  // just minted one. ownerOf reverts for unminted ids and allowFailure absorbs it.
  const ids = useMemo(() => {
    const out: bigint[] = [];
    for (let id = FIRST_PUBLIC_ID; id <= MAX_SUPPLY; id++) out.push(id);
    return out;
  }, []);

  const sweepEnabled = Boolean(nftContract && connectedAddress && ids.length > 0 && canJoin && !alreadyIn);

  const { data: owners } = useReadContracts({
    allowFailure: true,
    contracts:
      nftContract && sweepEnabled
        ? ids.map(id => ({
            address: nftContract.address,
            abi: nftContract.abi as Abi,
            functionName: "ownerOf" as const,
            args: [id] as const,
          }))
        : [],
    // Hold the previous answer while refetching, so the panel never flashes
    // "no tenés bolita" at someone who does.
    query: { enabled: sweepEnabled, placeholderData: keepPreviousData },
  });

  const myMarbleId = useMemo(() => {
    if (!connectedAddress || !owners) return undefined;
    const i = owners.findIndex(
      r => r.status === "success" && (r.result as Address)?.toLowerCase() === connectedAddress.toLowerCase(),
    );
    return i >= 0 ? ids[i] : undefined;
  }, [owners, ids, connectedAddress]);

  const { data: allowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "MarbleToken",
    functionName: "allowance",
    args: [connectedAddress, raceContract?.address],
  });

  const { writeContractAsync: writeToken } = useScaffoldWriteContract({ contractName: "MarbleToken" });
  const { writeContractAsync: writeRace } = useScaffoldWriteContract({ contractName: "MarbleRace" });

  // The parent's `alreadyIn` needs three sequential round trips to catch up after
  // a successful join (Joined log -> batch refetch -> new entrants -> new owner
  // multicall). Checking the entrant list directly, plus a local flag set the
  // moment join succeeds, closes the window where the button stays live and a
  // second click reverts MarbleBusy on the projector.
  const inThisRace =
    joined || alreadyIn || (myMarbleId !== undefined && Boolean(entrants?.some(id => id === myMarbleId)));

  if (!canJoin || inThisRace || !connectedAddress) return null;

  const needsApproval = entryFee !== undefined && (allowance ?? 0n) < entryFee;

  const approve = async () => {
    if (!raceContract || entryFee === undefined) return;
    setBusy("approve");
    setError(null);
    try {
      await writeToken({ functionName: "approve", args: [raceContract.address, entryFee] });
      await refetchAllowance();
    } catch {
      setError("No se pudo autorizar el gasto de MRBL. Probá de nuevo.");
    } finally {
      // Always released: without this a rejected signature locks the button.
      setBusy(null);
    }
  };

  const join = async () => {
    if (myMarbleId === undefined || raceId === undefined) return;
    setBusy("join");
    setError(null);
    try {
      await writeRace({ functionName: "join", args: [raceId, myMarbleId] });
      setJoined(true);
    } catch {
      setError("No se pudo entrar a la carrera. Puede que ya esté llena o que tu bolita esté en otra carrera.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">Entrar a la carrera</h2>

        {myMarbleId === undefined ? (
          <p className="text-sm text-base-content/60">
            No encontramos una bolita pública en esta wallet. Minteá una gratis en la portada y volvé.
          </p>
        ) : (
          <>
            <p className="text-sm">
              Vas a correr con <span className="font-bold tabular-nums">#{myMarbleId.toString()}</span> por{" "}
              {entryFee !== undefined ? `${formatEther(entryFee)} MRBL` : "–"}.
            </p>
            {needsApproval ? (
              <button className="btn btn-primary btn-sm w-fit" disabled={busy !== null} onClick={approve}>
                {busy === "approve" && <span className="loading loading-spinner loading-xs" />}
                {busy === "approve" ? "Autorizando…" : "1. Autorizar MRBL"}
              </button>
            ) : (
              <button className="btn btn-primary btn-sm w-fit" disabled={busy !== null} onClick={join}>
                {busy === "join" && <span className="loading loading-spinner loading-xs" />}
                {busy === "join" ? "Entrando…" : "2. Entrar con esta bolita"}
              </button>
            )}
          </>
        )}

        {error && <div className="rounded-lg bg-error/15 ring-1 ring-error/40 px-3 py-2 text-sm">{error}</div>}
      </div>
    </div>
  );
};

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Abi, Address } from "viem";
import { useBlock, usePublicClient, useReadContracts, useWatchContractEvent } from "wagmi";
import { useDeployedContractInfo, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { RaceStatus, RaceView, deriveRaceView, potOf } from "~~/utils/marble/raceState";

/**
 * publicnode caps eth_getLogs at ~126 blocks and Alchemy's shared key at ~10k,
 * so a historic RaceDrawn cannot be fetched in one sweep from the deploy block
 * forever — the window grows by ~7200 blocks a day. Scan backwards from the head
 * in bounded chunks and stop at the first hit: a live race resolves in the first
 * chunk, and the cap keeps a missing event from turning into an RPC storm.
 */
const LOG_CHUNK = 9000n;
const MAX_CHUNKS = 8; // ~72k blocks ≈ 10 days of Sepolia

export type RaceData = {
  raceId: bigint | undefined;
  view: RaceView | undefined;
  status: RaceStatus | undefined;
  specialId: bigint | undefined;
  entryFee: bigint | undefined;
  deadline: bigint | undefined;
  entrantCount: bigint | undefined;
  pot: bigint | undefined;
  entrants: readonly bigint[] | undefined;
  /** What the contract stored. Empty until `settle` is mined. */
  onChainFinishOrder: readonly bigint[] | undefined;
  minPlayers: bigint | undefined;
  maxPlayers: bigint | undefined;
  /** Event-only: no view exposes it. Undefined until RaceDrawn is seen. */
  randomWord: bigint | undefined;
  hadDrawing: boolean;
  host: Address | undefined;
  raceAddress: Address | undefined;
  raceAbi: Abi | undefined;
  isLoading: boolean;
  /** allowFailure is false, so one bad call empties the whole batch. Surface it. */
  error: Error | null;
  refetch: () => void;
};

export const useRaceData = (raceId: bigint | undefined): RaceData => {
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const { data: raceContract } = useDeployedContractInfo({ contractName: "MarbleRace" });
  const { data: nftContract } = useDeployedContractInfo({ contractName: "MarbleNFT" });

  const address = raceContract?.address;
  const abi = raceContract?.abi as Abi | undefined;
  const enabled = Boolean(address && abi && raceId !== undefined);

  // One batch, so the "N/M" display and the status come from the same block.
  // minPlayers/maxPlayers are global and owner-mutable, never snapshotted per
  // race, so reading them separately could disagree with the entrant count.
  const { data, isLoading, error, refetch } = useReadContracts({
    allowFailure: false,
    contracts: enabled
      ? [
          { address, abi, functionName: "getRace", args: [raceId] },
          { address, abi, functionName: "getEntrants", args: [raceId] },
          { address, abi, functionName: "getFinishOrder", args: [raceId] },
          { address, abi, functionName: "minPlayers" },
          { address, abi, functionName: "maxPlayers" },
        ]
      : [],
    query: { enabled },
  });

  const [race, entrants, onChainFinishOrder, minPlayers, maxPlayers] = (data ?? []) as [
    readonly [bigint, bigint, bigint, number, bigint, bigint] | undefined,
    readonly bigint[] | undefined,
    readonly bigint[] | undefined,
    bigint | undefined,
    bigint | undefined,
  ];

  const specialId = race?.[0];
  const entryFee = race?.[1];
  const deadline = race?.[2] === undefined ? undefined : BigInt(race[2]);
  const status = race?.[3] as RaceStatus | undefined;
  const entrantCount = race?.[4];

  // The host is whoever owns the hosting special *now*; prizes and the host cut
  // follow ownerOf, not whoever created the race.
  const { data: hostData } = useReadContracts({
    allowFailure: false,
    contracts:
      nftContract && specialId !== undefined
        ? [{ address: nftContract.address, abi: nftContract.abi as Abi, functionName: "ownerOf", args: [specialId] }]
        : [],
    query: { enabled: Boolean(nftContract && specialId !== undefined) },
  });

  // Chain time, not the browser clock: every deadline guard in the contract
  // compares against block.timestamp, and a skewed laptop clock would show
  // actions as available a minute before or after the chain agrees.
  const { data: block } = useBlock({ watch: true, chainId: targetNetwork.id });

  const [randomWord, setRandomWord] = useState<bigint | undefined>();
  const [hadDrawing, setHadDrawing] = useState(false);
  const scannedFor = useRef<string>("");

  // Reset cached event state when the race being followed changes.
  useEffect(() => {
    setRandomWord(undefined);
    setHadDrawing(false);
    scannedFor.current = "";
  }, [raceId, address]);

  const scanBackFor = useCallback(
    async (eventName: "RaceDrawn" | "RaceDrawing") => {
      if (!publicClient || !address || !abi || raceId === undefined) return undefined;
      const event = (abi as any[]).find(x => x.type === "event" && x.name === eventName);
      if (!event) return undefined;
      let to = await publicClient.getBlockNumber();
      for (let n = 0; n < MAX_CHUNKS && to > 0n; n++) {
        const from = to > LOG_CHUNK ? to - LOG_CHUNK : 0n;
        const logs = await publicClient.getLogs({
          address,
          event,
          args: { raceId },
          fromBlock: from,
          toBlock: to,
        });
        if (logs.length > 0) return logs[logs.length - 1];
        if (from === 0n) break;
        to = from - 1n;
      }
      return undefined;
    },
    [publicClient, address, abi, raceId],
  );

  // Backfill for a race that was already drawn before the page opened.
  useEffect(() => {
    if (status === undefined || raceId === undefined) return;
    const wasDrawn = status >= RaceStatus.Drawn && status !== RaceStatus.Cancelled;
    const key = `${address}:${raceId}:${status}`;
    if (scannedFor.current === key) return;
    scannedFor.current = key;

    let cancelled = false;
    (async () => {
      try {
        if (wasDrawn && randomWord === undefined) {
          const log = await scanBackFor("RaceDrawn");
          const word = (log as any)?.args?.randomWord as bigint | undefined;
          if (!cancelled && word !== undefined) setRandomWord(word);
        }
        // Only needed to explain a cancel: from Open means nobody came, from
        // Drawing means the draw never landed. Same bare event either way.
        if (status === RaceStatus.Cancelled) {
          const log = await scanBackFor("RaceDrawing");
          if (!cancelled) setHadDrawing(Boolean(log));
        }
      } catch (e) {
        // Release the claim so a transient getLogs failure is retryable. Without
        // this, one 429 on the shared RPC key permanently blanks the fairness
        // panel for a settled race — its status never changes again, so the
        // guard above would never let the scan run a second time.
        scannedFor.current = "";
        console.error("marble: could not backfill race events", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, raceId, address, randomWord, scanBackFor]);

  // The live path. This is the primary signal during a race: it lands ~12s
  // before a polled getRace would show Drawn, and the finish order is
  // computable from the word alone — no need to wait for settle to be mined.
  useWatchContractEvent({
    address,
    abi,
    eventName: "RaceDrawn",
    chainId: targetNetwork.id,
    enabled,
    onLogs: logs => {
      for (const log of logs) {
        const args = (log as any).args;
        if (args?.raceId === raceId && args?.randomWord !== undefined) {
          setRandomWord(args.randomWord as bigint);
          refetch();
        }
      }
    },
  });

  useWatchContractEvent({
    address,
    abi,
    eventName: "RaceDrawing",
    chainId: targetNetwork.id,
    enabled,
    onLogs: logs => {
      if (logs.some(l => (l as any).args?.raceId === raceId)) {
        setHadDrawing(true);
        refetch();
      }
    },
  });

  // Joined and RaceSettled only need to invalidate the batch above.
  useWatchContractEvent({
    address,
    abi,
    eventName: "Joined",
    chainId: targetNetwork.id,
    enabled,
    onLogs: logs => {
      if (logs.some(l => (l as any).args?.raceId === raceId)) refetch();
    },
  });

  useWatchContractEvent({
    address,
    abi,
    eventName: "RaceSettled",
    chainId: targetNetwork.id,
    enabled,
    onLogs: logs => {
      if (logs.some(l => (l as any).args?.raceId === raceId)) refetch();
    },
  });

  // Both cancel() and rescueStalled() end a race with this event; without it the
  // UI would keep offering a "liberar el pote" button that now reverts.
  useWatchContractEvent({
    address,
    abi,
    eventName: "RaceCancelled",
    chainId: targetNetwork.id,
    enabled,
    onLogs: logs => {
      if (logs.some(l => (l as any).args?.raceId === raceId)) refetch();
    },
  });

  // useReadContracts does not poll on its own, so without this every watcher
  // above is load-bearing: one missed log (the transport is a fallback list and
  // viem's filters are node-specific, so a rotation invalidates them) would
  // strand the UI on "Pidiendo el número al azar" with no button and no
  // recovery short of a reload. Refetching per block demotes the watchers to a
  // latency optimisation. react-query's structural sharing keeps `data`
  // referentially stable when nothing changed, so this does not churn the
  // animation's entrant/order keys.
  useEffect(() => {
    if (enabled) refetch();
  }, [block?.number, enabled, refetch]);

  const chainNow = block?.timestamp;

  const view = useMemo(() => {
    if (
      status === undefined ||
      entrantCount === undefined ||
      deadline === undefined ||
      minPlayers === undefined ||
      maxPlayers === undefined ||
      chainNow === undefined
    ) {
      return undefined;
    }
    return deriveRaceView({
      status,
      entrantCount,
      deadline,
      minPlayers,
      maxPlayers,
      now: chainNow,
      hadDrawing,
    });
  }, [status, entrantCount, deadline, minPlayers, maxPlayers, chainNow, hadDrawing]);

  return {
    raceId,
    view,
    status,
    specialId,
    entryFee,
    deadline,
    entrantCount,
    pot: entryFee !== undefined && entrantCount !== undefined ? potOf(entryFee, entrantCount) : undefined,
    entrants,
    onChainFinishOrder,
    minPlayers,
    maxPlayers,
    randomWord,
    hadDrawing,
    host: (hostData?.[0] as Address | undefined) ?? undefined,
    raceAddress: address,
    raceAbi: abi,
    isLoading,
    error: (error as Error | null) ?? null,
    refetch,
  };
};

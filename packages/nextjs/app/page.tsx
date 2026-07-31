"use client";

import { useMemo } from "react";
import { useWatchBalance } from "@scaffold-ui/hooks";
import type { NextPage } from "next";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { ShareQR } from "~~/components/marble/ShareQR";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import {
  useScaffoldEventHistory,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
} from "~~/hooks/scaffold-eth";
import { contracts } from "~~/utils/scaffold-eth/contract";

const FIRST_PUBLIC_ID = 17n;
const MAX_SUPPLY = 256n;
const FAUCET_URL = "https://www.alchemy.com/faucets/ethereum-sepolia";

const fmt = (v?: bigint) => (v === undefined ? "—" : Number(formatEther(v)).toFixed(4));

/** base64 -> UTF-8 (plain atob is Latin-1 and mangles accented copy). */
const decodeJson = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));

type MarbleMeta = {
  name: string;
  image: string;
  attributes: { trait_type: string; value: string }[];
};

/**
 * Owned-marble + claim panel. Mounted with key={address} so every account
 * switch gets fresh hook state — useScaffoldEventHistory keeps its polling
 * state in useState and never resets it when the filter changes, which
 * otherwise shows the new wallet the previous wallet's marble.
 */
const MarblePanel = ({
  address,
  explorer,
  nftAddress,
}: {
  address: string;
  explorer?: string;
  nftAddress?: string;
}) => {
  // fromBlock omitted on purpose: the hook falls back to deployedOnBlock from
  // deployedContracts.ts, so this self-corrects on every redeploy.
  const { data: transfersIn, isLoading: loadingHistory } = useScaffoldEventHistory({
    contractName: "MarbleNFT",
    eventName: "Transfer",
    filters: { to: address },
    blocksBatchSize: 10000,
    watch: true,
  });

  // Specials (ids 1-16) are exempt from the wallet limit, so they can land in
  // this list too — they must not be mistaken for the wallet's racing marble.
  const myMarbleId = useMemo(() => {
    const publicIn = (transfersIn ?? []).filter(e => (e.args?.tokenId ?? 0n) >= FIRST_PUBLIC_ID);
    if (publicIn.length === 0) return undefined;
    const latest = publicIn.reduce((a, b) => {
      const [ab, bb] = [a.blockNumber ?? 0n, b.blockNumber ?? 0n];
      if (bb !== ab) return bb > ab ? b : a;
      return (b.logIndex ?? 0) > (a.logIndex ?? 0) ? b : a;
    });
    return latest.args?.tokenId;
  }, [transfersIn]);

  const { data: myTokenURI } = useScaffoldReadContract({
    contractName: "MarbleNFT",
    functionName: "tokenURI",
    args: [myMarbleId],
    watch: false, // immutable per id — no reason to refetch every block
  });

  const myMarble = useMemo(() => {
    if (!myTokenURI) return undefined;
    try {
      return JSON.parse(decodeJson(myTokenURI.split(",")[1])) as MarbleMeta;
    } catch {
      return undefined;
    }
  }, [myTokenURI]);

  const { data: claimable } = useScaffoldReadContract({
    contractName: "MarbleToken",
    functionName: "claimable",
    args: [myMarbleId],
    watch: true,
  });

  const { data: mrblBalance } = useScaffoldReadContract({
    contractName: "MarbleToken",
    functionName: "balanceOf",
    args: [address],
    watch: true,
  });

  const { writeContractAsync: writeMarbleToken, isMining: isClaiming } = useScaffoldWriteContract({
    contractName: "MarbleToken",
  });

  // SE-2 already toasts simulation/network/tx errors via useTransactor;
  // swallow the rejection so it doesn't surface as an unhandled promise.
  const handleClaim = () => {
    if (myMarbleId === undefined) return;
    writeMarbleToken({ functionName: "claim", args: [[myMarbleId]] }).catch(() => {});
  };

  if (!myMarble) {
    return (
      <div className="flex flex-col items-center gap-2">
        <span className="loading loading-spinner loading-lg" />
        <p className="text-sm opacity-70">{loadingHistory ? "Buscando tu bolita…" : "Cargando tu bolita…"}</p>
      </div>
    );
  }

  return (
    <>
      <h2 className="card-title">{myMarble.name}</h2>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={myMarble.image} alt={myMarble.name} className="w-48 h-48 rounded-xl" />
      <div className="flex gap-2 mt-2 flex-wrap justify-center">
        {myMarble.attributes.map(a => (
          <div key={a.trait_type} className="badge badge-outline">
            {a.trait_type}: {a.value}
          </div>
        ))}
      </div>
      {explorer && nftAddress && myMarbleId !== undefined && (
        <a
          href={`${explorer}/nft/${nftAddress}/${myMarbleId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="link link-primary text-sm"
        >
          Ver mi bolita en Etherscan ↗
        </a>
      )}
      <p className="text-sm opacity-70">
        Esta es tu bolita para las carreras. Una por wallet — para conseguir otra, primero transferí esta.
      </p>

      <div className="divider">Créditos MRBL</div>
      <div className="stats stats-vertical sm:stats-horizontal w-full">
        <div className="stat place-items-center py-2">
          <div className="stat-title text-xs">Sin reclamar</div>
          <div className="stat-value text-2xl text-primary">{fmt(claimable)}</div>
        </div>
        <div className="stat place-items-center py-2">
          <div className="stat-title text-xs">En tu wallet</div>
          <div className="stat-value text-2xl">{fmt(mrblBalance)}</div>
        </div>
      </div>
      <button className="btn btn-secondary" onClick={handleClaim} disabled={isClaiming || claimable === 0n}>
        {isClaiming ? <span className="loading loading-spinner" /> : "Reclamar MRBL"}
      </button>
      <p className="text-xs opacity-60">Tu bolita genera 10 MRBL por día, de forma continua desde que se minteó.</p>
    </>
  );
};

const Home: NextPage = () => {
  const { address: connectedAddress, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const explorer = targetNetwork.blockExplorers?.default.url;
  const wrongNetwork = Boolean(connectedAddress) && chain?.id !== targetNetwork.id;

  // Addresses come from build-time deployment data, not an async on-chain
  // probe, so explorer links are correct on first paint and can't vanish
  // if an RPC call fails.
  const chainContracts = contracts?.[targetNetwork.id];
  const nftAddress = chainContracts?.MarbleNFT?.address;
  const tokenAddress = chainContracts?.MarbleToken?.address;

  const { data: gasBalance } = useWatchBalance({ address: connectedAddress, chain: targetNetwork });
  const noGas = Boolean(connectedAddress) && !wrongNetwork && gasBalance?.value === 0n;

  const { data: nextId } = useScaffoldReadContract({
    contractName: "MarbleNFT",
    functionName: "nextId",
    watch: true,
  });

  const { data: holdings } = useScaffoldReadContract({
    contractName: "MarbleNFT",
    functionName: "publicHoldings",
    args: [connectedAddress],
    watch: true,
  });

  const hasMarble = (holdings ?? 0n) > 0n;

  const { writeContractAsync: writeMarbleNFT, isMining: isMinting } = useScaffoldWriteContract({
    contractName: "MarbleNFT",
  });

  const handleMint = () => {
    writeMarbleNFT({ functionName: "mint" }).catch(() => {});
  };

  // nextId is a sequential supply counter; revisit these when minting
  // becomes randomised.
  const minted = nextId === undefined ? undefined : Number(nextId - FIRST_PUBLIC_ID);
  const remaining = nextId === undefined ? undefined : Number(MAX_SUPPLY + 1n - nextId);
  const soldOut = nextId !== undefined && nextId > MAX_SUPPLY;

  return (
    <div className="flex items-center flex-col grow pt-10 px-5 pb-10">
      <h1 className="text-center">
        <span className="block text-4xl font-bold">🏁 Marble Race</span>
        <span className="block text-lg mt-2 opacity-80">256 bolitas 100% on-chain. Mint gratis, una por wallet.</span>
      </h1>

      <div className="stats stats-vertical sm:stats-horizontal shadow mt-8">
        <div className="stat place-items-center">
          <div className="stat-title">Minteadas</div>
          <div className="stat-value">{minted ?? "—"}</div>
          <div className="stat-desc">de 240 públicas</div>
        </div>
        <div className="stat place-items-center">
          <div className="stat-title">Disponibles</div>
          <div className="stat-value text-primary">{remaining ?? "—"}</div>
          <div className="stat-desc">ids 17 a 256</div>
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl mt-8 w-full max-w-md">
        <div className="card-body items-center text-center">
          {!connectedAddress ? (
            <>
              <p>Conectá tu wallet (red Sepolia) para mintear tu bolita.</p>
              <RainbowKitCustomConnectButton />
            </>
          ) : wrongNetwork ? (
            <>
              <div className="alert alert-warning">
                <span>Estás en la red equivocada. Cambiá a {targetNetwork.name} para mintear.</span>
              </div>
              <RainbowKitCustomConnectButton />
            </>
          ) : hasMarble ? (
            <MarblePanel
              key={connectedAddress}
              address={connectedAddress}
              explorer={explorer}
              nftAddress={nftAddress}
            />
          ) : soldOut ? (
            <p className="text-xl font-bold">Se agotaron las 240 🏁</p>
          ) : noGas ? (
            <>
              <div className="alert alert-warning">
                <span>Necesitás un poco de ETH de Sepolia para pagar el gas.</span>
              </div>
              <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                Conseguir ETH gratis ↗
              </a>
              <p className="text-xs opacity-60">Después de recibirlo, volvé y minteá tu bolita.</p>
            </>
          ) : (
            <>
              <p>Todavía no tenés bolita.</p>
              <button className="btn btn-primary btn-lg" onClick={handleMint} disabled={isMinting}>
                {isMinting ? <span className="loading loading-spinner" /> : "Mintear mi bolita"}
              </button>
              <p className="text-xs opacity-60">Gratis — solo pagás el gas de Sepolia.</p>
            </>
          )}
        </div>
      </div>

      <div className="mt-8 w-full max-w-md">
        <ShareQR
          path="/"
          title="Escaneá para mintear tu bolita"
          hint="Gratis. Necesitás una wallet con un poco de ETH de Sepolia para el gas."
        />
      </div>

      {explorer && nftAddress && tokenAddress && (
        <div className="mt-8 text-center text-sm">
          <p className="opacity-70 mb-2">Contratos verificados en Etherscan — código abierto y auditable:</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a
              href={`${explorer}/address/${nftAddress}#code`}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              MarbleNFT ↗
            </a>
            <a
              href={`${explorer}/address/${tokenAddress}#code`}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              MarbleToken ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;

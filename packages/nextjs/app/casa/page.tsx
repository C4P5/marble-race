"use client";

import { useMemo } from "react";
import type { NextPage } from "next";
import { formatEther } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { contracts } from "~~/utils/scaffold-eth/contract";

const SPECIAL_IDS = Array.from({ length: 16 }, (_, i) => BigInt(i + 1));

const fmt = (v?: bigint) => (v === undefined ? "—" : Number(formatEther(v)).toFixed(2));

/** base64 -> UTF-8 (plain atob is Latin-1 and mangles accented copy). */
const decodeJson = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));

const sum = (rows?: readonly { status: string; result?: unknown }[]) =>
  (rows ?? []).reduce<bigint>((t, r) => t + (r.status === "success" ? (r.result as bigint) : 0n), 0n);

const Casa: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const explorer = targetNetwork.blockExplorers?.default.url;

  // Build-time deployment data: correct on first paint, and can't vanish
  // because an RPC liveness probe failed.
  const chain = contracts?.[targetNetwork.id];
  const nft = chain?.MarbleNFT;
  const token = chain?.MarbleToken;
  const race = chain?.MarbleRace;
  const vaultAddress = chain?.MarbleVault?.address;

  const read = <T,>(c: typeof nft, fn: string, watch: boolean) =>
    ({
      contracts: SPECIAL_IDS.map(id => ({
        address: c?.address as `0x${string}`,
        abi: c?.abi as never,
        functionName: fn,
        args: [id],
      })),
      allowFailure: true as const,
      query: { enabled: Boolean(c?.address), ...(watch ? {} : { staleTime: Infinity }) },
    }) as T;

  // Immutable per id — fetched once.
  const { data: uris } = useReadContracts(read<never>(nft, "tokenURI", false));
  const { data: owners } = useReadContracts(read<never>(nft, "ownerOf", true));
  // Still inside the marble, not yet earmarked.
  const { data: unclaimed } = useReadContracts(read<never>(token, "claimable", true));
  // Earmarked to that marble inside MarbleRace, ready to seed a race.
  const { data: balances } = useReadContracts(read<never>(race, "specialBalance", true));
  const { data: hosted } = useReadContracts(read<never>(race, "racesHosted", true));

  const marbles = useMemo(
    () =>
      SPECIAL_IDS.map((id, i) => {
        let image: string | undefined;
        const uri = uris?.[i];
        if (uri?.status === "success") {
          try {
            image = (JSON.parse(decodeJson((uri.result as string).split(",")[1])) as { image: string }).image;
          } catch {
            image = undefined;
          }
        }
        const owner = owners?.[i]?.status === "success" ? (owners[i].result as string) : undefined;
        const pick = (rows?: readonly { status: string; result?: unknown }[]) =>
          rows?.[i]?.status === "success" ? (rows[i].result as bigint) : undefined;
        return {
          id,
          image,
          owner,
          inVault: Boolean(owner && vaultAddress && owner.toLowerCase() === vaultAddress.toLowerCase()),
          mine: Boolean(owner && connectedAddress && owner.toLowerCase() === connectedAddress.toLowerCase()),
          unclaimed: pick(unclaimed),
          balance: pick(balances),
          hosted: pick(hosted),
        };
      }),
    [uris, owners, unclaimed, balances, hosted, vaultAddress, connectedAddress],
  );

  const { writeContractAsync: writeRace, isMining } = useScaffoldWriteContract({ contractName: "MarbleRace" });

  // Per special on purpose: claiming all sixteen at once through the vault
  // would mint one undifferentiated lump and destroy the attribution.
  const fund = (specialId: bigint) => {
    writeRace({ functionName: "fundSpecialFromVault", args: [specialId] }).catch(() => {});
  };

  const totalHosted = (hosted ?? []).reduce<number>(
    (t, r) => t + (r.status === "success" ? Number(r.result as bigint) : 0),
    0,
  );

  return (
    <div className="flex items-center flex-col grow pt-10 px-5 pb-10">
      <h1 className="text-center">
        <span className="block text-4xl font-bold">🏛️ La Casa</span>
        <span className="block text-lg mt-2 opacity-80 max-w-xl">
          Las 16 especiales no corren: organizan. Cada una financia sus propias carreras con lo que ella misma genera —
          nunca de un pozo común.
        </span>
      </h1>

      <div className="stats stats-vertical sm:stats-horizontal shadow mt-8">
        <div className="stat place-items-center">
          <div className="stat-title">Listo para carreras</div>
          <div className="stat-value text-primary">{balances ? fmt(sum(balances)) : "—"}</div>
          <div className="stat-desc">MRBL asignado por bolita</div>
        </div>
        <div className="stat place-items-center">
          <div className="stat-title">Sin reclamar</div>
          <div className="stat-value">{unclaimed ? fmt(sum(unclaimed)) : "—"}</div>
          <div className="stat-desc">todavía dentro de las bolitas</div>
        </div>
        <div className="stat place-items-center">
          <div className="stat-title">Carreras organizadas</div>
          <div className="stat-value">{hosted ? totalHosted : "—"}</div>
          <div className="stat-desc">entre las 16</div>
        </div>
      </div>

      {!connectedAddress && <p className="text-sm opacity-60 mt-4">Conectá tu wallet para poder fondear una bolita.</p>}

      <div className="mt-8 w-full max-w-5xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {marbles.map(m => (
          <div key={m.id.toString()} className="card bg-base-100 shadow-md">
            <div className="card-body items-center text-center p-4 gap-2">
              {m.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt={`Bolita #${m.id}`} className="w-20 h-20 rounded-full" />
              ) : (
                <div className="w-20 h-20 rounded-full skeleton" />
              )}
              <div className="font-bold">
                Bolita #{m.id.toString()}
                {m.mine && <span className="badge badge-success badge-sm ml-2">tuya</span>}
              </div>
              <div className="text-xs opacity-70 leading-relaxed">
                <div>
                  Para carreras: <b className="text-primary">{fmt(m.balance)}</b> MRBL
                </div>
                <div>Sin reclamar: {fmt(m.unclaimed)} MRBL</div>
                <div>Organizó: {m.hosted === undefined ? "—" : m.hosted.toString()} carreras</div>
              </div>
              {m.inVault ? (
                <button
                  className="btn btn-xs btn-primary"
                  onClick={() => fund(m.id)}
                  disabled={isMining || !connectedAddress || !m.unclaimed || m.unclaimed === 0n}
                >
                  Fondear
                </button>
              ) : (
                <span className="badge badge-outline badge-sm">repartida</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="alert alert-info mt-8 max-w-2xl">
        <span className="text-sm">
          <b>Fondear</b> mueve lo que generó <i>esa</i> bolita a su propio saldo, de a una por vez. Una bolita repartida
          la fondea su dueño con <code>depositForSpecial</code>.
        </span>
      </div>

      {explorer && race?.address && (
        <a
          href={`${explorer}/address/${race.address}#code`}
          target="_blank"
          rel="noopener noreferrer"
          className="link text-sm mt-6"
        >
          Ver el contrato de carreras en Etherscan ↗
        </a>
      )}
    </div>
  );
};

export default Casa;

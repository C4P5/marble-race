import { encodeAbiParameters, keccak256 } from "viem";

/**
 * Off-chain twin of `MarbleRace._shuffled`. Given only the public VRF word and
 * the entrant list, this reproduces the on-chain finish order exactly — which is
 * the whole "probadamente justa" claim: anyone can check the race was not rigged
 * without trusting us.
 *
 * Must stay byte-for-byte faithful to the Solidity:
 *   for (uint256 i = n - 1; i > 0; i--) {
 *     uint256 j = uint256(keccak256(abi.encode(seed, i))) % (i + 1);
 *     (out[i], out[j]) = (out[j], out[i]);
 *   }
 */
export const recomputeFinishOrder = (entrants: readonly bigint[], seed: bigint): bigint[] => {
  const out = [...entrants];
  for (let i = BigInt(out.length - 1); i > 0n; i--) {
    const hash = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [seed, i]));
    const j = BigInt(hash) % (i + 1n);
    const ii = Number(i);
    const jj = Number(j);
    [out[ii], out[jj]] = [out[jj], out[ii]];
  }
  return out;
};

/** True when the recomputation matches the order the contract actually stored. */
export const finishOrderMatches = (recomputed: readonly bigint[], onChain: readonly bigint[]) =>
  recomputed.length > 0 && recomputed.length === onChain.length && recomputed.every((id, i) => id === onChain[i]);

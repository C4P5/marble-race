// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import { MarbleVault } from "../contracts/MarbleVault.sol";
import { MarbleNFT } from "../contracts/MarbleNFT.sol";
import { MarbleToken } from "../contracts/MarbleToken.sol";

/**
 * @notice Deploys the Stage 1 marble system in dependency order:
 *         Vault (no deps) -> NFT (specials minted to vault) -> Token (reads NFT).
 * Example:
 * yarn deploy --file DeployMarbles.s.sol
 */
contract DeployMarbles is ScaffoldETHDeploy {
    uint256 constant INITIAL_RATE_PER_DAY = 10e18; // 10 MRBL/day per marble, owner-tunable

    function run() external ScaffoldEthDeployerRunner {
        MarbleVault vault = new MarbleVault();
        MarbleNFT nft = new MarbleNFT(address(vault));
        new MarbleToken(nft, INITIAL_RATE_PER_DAY);
    }
}

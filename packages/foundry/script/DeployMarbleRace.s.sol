// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import { IVRFCoordinatorV2Plus } from "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import { MarbleNFT } from "../contracts/MarbleNFT.sol";
import { MarbleToken } from "../contracts/MarbleToken.sol";
import { MarbleVault } from "../contracts/MarbleVault.sol";
import { MarbleRace } from "../contracts/MarbleRace.sol";

/**
 * @notice Deploys MarbleRace against the already-live Stage 1 contracts and wires
 *         it as the vault's authorized manager, so it can pull each special's
 *         emissions into that special's own balance.
 *
 * Requires VRF_SUBSCRIPTION_ID in the environment — create the subscription at
 * https://vrf.chain.link (Sepolia) and fund it with native ETH first.
 *
 * Example:
 *   VRF_SUBSCRIPTION_ID=123... forge script script/DeployMarbleRace.s.sol \
 *     --rpc-url sepolia --broadcast --ffi
 */
contract DeployMarbleRace is ScaffoldETHDeploy {
    /// Chainlink VRF v2.5 on Sepolia. Verified on-chain 2026-07-28: LINK()
    /// returns Sepolia LINK and s_currentSubNonce() is live.
    address constant SEPOLIA_VRF_COORDINATOR = 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B;
    /// 750 gwei gas lane.
    bytes32 constant SEPOLIA_KEY_HASH = 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae;

    /// Stage 1, live and Etherscan-verified on Sepolia.
    address constant SEPOLIA_NFT = 0x8640F6ef179B85Ef8ac2Df69D703BA6c58FA33E1;
    address constant SEPOLIA_TOKEN = 0x2f1a5125A8cc35Ca0189863575fcED821E566FFD;
    address constant SEPOLIA_VAULT = 0x31E3C259A707e8b522Ecb988FA2523AC7480eE5c;

    function run() external ScaffoldEthDeployerRunner {
        uint256 subscriptionId = vm.envUint("VRF_SUBSCRIPTION_ID");
        address coordinator = vm.envOr("VRF_COORDINATOR", SEPOLIA_VRF_COORDINATOR);
        bytes32 keyHash = vm.envOr("VRF_KEY_HASH", SEPOLIA_KEY_HASH);

        MarbleNFT nft = MarbleNFT(vm.envOr("MARBLE_NFT", SEPOLIA_NFT));
        MarbleToken token = MarbleToken(vm.envOr("MARBLE_TOKEN", SEPOLIA_TOKEN));
        MarbleVault vault = MarbleVault(vm.envOr("MARBLE_VAULT", SEPOLIA_VAULT));

        MarbleRace race = new MarbleRace(nft, token, vault, coordinator, subscriptionId, keyHash);

        // Lets the race contract call claimEmissions/transferToken for one
        // special at a time. Requires the deployer to own the vault.
        vault.setManager(address(race));

        // Best effort: only the subscription owner may do this. If the
        // subscription lives in another wallet, add the consumer in the UI.
        try IVRFCoordinatorV2Plus(coordinator).addConsumer(subscriptionId, address(race)) {
            console.logString("VRF consumer registered automatically.");
        } catch {
            console.logString("ACTION REQUIRED: add this contract as a VRF consumer at https://vrf.chain.link");
        }

        console.logString(string.concat("MarbleRace deployed at ", vm.toString(address(race))));
        console.logString(string.concat("Vault manager set to ", vm.toString(vault.authorizedManager())));
    }
}

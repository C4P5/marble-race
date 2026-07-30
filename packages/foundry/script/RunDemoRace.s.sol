// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MarbleNFT } from "../contracts/MarbleNFT.sol";
import { MarbleToken } from "../contracts/MarbleToken.sol";
import { MarbleVault } from "../contracts/MarbleVault.sol";
import { MarbleRace } from "../contracts/MarbleRace.sol";

/**
 * @notice One-command end-to-end race on Sepolia: takes special #10 into the
 *         deployer's wallet, funds it, opens a race hosted by it, fills the
 *         8-player field (deployer + 7 derived burners), and starts the draw.
 *
 * Settlement is NOT part of this script — VRF needs 30-120s to call back. Once
 * `RaceDrawn` appears, settle with:
 *   cast send <RACE> "settle(uint256)" <raceId> --account marble-deployer --rpc-url sepolia
 *
 * Burner keys are derived from BURNER_SALT so the run is repeatable and the keys
 * are yours alone. Testnet only — never put value on them.
 *
 * Example:
 *   BURNER_SALT=whatever-you-like forge script script/RunDemoRace.s.sol \
 *     --rpc-url sepolia --broadcast --ffi
 */
contract RunDemoRace is Script {
    MarbleNFT constant NFT = MarbleNFT(0x8640F6ef179B85Ef8ac2Df69D703BA6c58FA33E1);
    MarbleToken constant TOKEN = MarbleToken(0x2f1a5125A8cc35Ca0189863575fcED821E566FFD);
    MarbleVault constant VAULT = MarbleVault(0x31E3C259A707e8b522Ecb988FA2523AC7480eE5c);
    MarbleRace constant RACE = MarbleRace(0x48C6f3607474A0bF013924987371eeaF3A252215);

    uint256 constant FIELD = 8; // players; the 8th join makes the race startable
    uint256 constant BURNERS = FIELD - 1; // the deployer takes the last slot

    function run() external {
        uint256 entryFee = vm.envOr("ENTRY_FEE", uint256(2e18));
        uint256 specialId = vm.envOr("SPECIAL_ID", uint256(10));
        uint256 gasStipend = vm.envOr("BURNER_ETH", uint256(0.004 ether));
        string memory salt = vm.envString("BURNER_SALT");

        address deployer = msg.sender;
        address[] memory burners = new address[](BURNERS);
        uint256[] memory keys = new uint256[](BURNERS);
        for (uint256 i = 0; i < BURNERS; i++) {
            keys[i] = uint256(keccak256(abi.encodePacked(salt, i))) % 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140;
            burners[i] = vm.addr(keys[i]);
        }

        // --- host side, all from the deployer -------------------------------
        vm.startBroadcast();

        // 8 players in and 8 max, so the field is "full" the moment it fills
        // and `startRace` needs no deadline wait.
        RACE.setPlayerBounds(FIELD, FIELD);

        // Take the special out of the vault and claim its emissions: this is
        // both the host marble and the MRBL that bankrolls the whole test.
        if (NFT.ownerOf(specialId) == address(VAULT)) {
            VAULT.rescueSpecial(NFT, specialId, deployer);
        }
        uint256[] memory one = new uint256[](1);
        one[0] = specialId;
        TOKEN.claim(one);

        IERC20(address(TOKEN)).approve(address(RACE), type(uint256).max);
        RACE.depositForSpecial(specialId, entryFee);
        uint256 raceId = RACE.createRace(specialId, entryFee);

        // The deployer takes one of the eight slots with its own public marble.
        uint256 myMarble = NFT.mint();
        RACE.join(raceId, myMarble);

        // Stake the burners: gas plus exactly one entry each.
        for (uint256 i = 0; i < BURNERS; i++) {
            payable(burners[i]).transfer(gasStipend);
            IERC20(address(TOKEN)).transfer(burners[i], entryFee);
        }
        vm.stopBroadcast();

        // --- each burner mints, approves and joins ---------------------------
        for (uint256 i = 0; i < BURNERS; i++) {
            vm.startBroadcast(keys[i]);
            uint256 id = NFT.mint();
            IERC20(address(TOKEN)).approve(address(RACE), entryFee);
            RACE.join(raceId, id);
            vm.stopBroadcast();
        }

        // --- field is full: request the randomness --------------------------
        vm.startBroadcast();
        uint256 requestId = RACE.startRace(raceId);
        vm.stopBroadcast();

        console.logString("--------------------------------------------------");
        console.logString(string.concat("raceId          : ", vm.toString(raceId)));
        console.logString(string.concat("host special    : #", vm.toString(specialId)));
        console.logString(string.concat("entry fee       : ", vm.toString(entryFee)));
        console.logString(string.concat("pot             : ", vm.toString(entryFee * (FIELD + 1))));
        console.logString(string.concat("VRF requestId   : ", vm.toString(requestId)));
        console.logString("Now wait for the RaceDrawn event (30-120s), then call settle(raceId).");
    }
}

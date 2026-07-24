// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { MarbleNFT } from "../contracts/MarbleNFT.sol";
import { MarbleToken } from "../contracts/MarbleToken.sol";
import { MarbleVault } from "../contracts/MarbleVault.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MarbleVaultTest is Test {
    uint256 constant RATE = 10e18;

    MarbleVault vault;
    MarbleNFT nft;
    MarbleToken token;
    address manager = makeAddr("raceManager");
    address pool = makeAddr("racePool");
    address rando = makeAddr("rando");

    function setUp() public {
        vault = new MarbleVault();
        nft = new MarbleNFT(address(vault));
        token = new MarbleToken(nft, RATE);
        vault.setManager(manager);
    }

    function _allSpecials() internal pure returns (uint256[] memory ids) {
        ids = new uint256[](16);
        for (uint256 i = 0; i < 16; i++) {
            ids[i] = i + 1;
        }
    }

    function test_AnyoneCanPokeEmissionClaims() public {
        skip(1 days);
        vm.prank(rando);
        uint256 got = vault.claimEmissions(token, _allSpecials());
        assertEq(got, 16 * RATE);
        // emissions land in the vault, never with the poker
        assertEq(token.balanceOf(address(vault)), 16 * RATE);
        assertEq(token.balanceOf(rando), 0);
    }

    function test_ManagerSeedsPoolFromEmissions() public {
        skip(1 days);
        vault.claimEmissions(token, _allSpecials());

        vm.prank(manager);
        vault.transferToken(IERC20(address(token)), pool, 5 * RATE);
        assertEq(token.balanceOf(pool), 5 * RATE);
        assertEq(token.balanceOf(address(vault)), 11 * RATE);
    }

    function test_NonManagerCannotMoveTokens() public {
        skip(1 days);
        vault.claimEmissions(token, _allSpecials());

        vm.prank(rando);
        vm.expectRevert(MarbleVault.NotManager.selector);
        vault.transferToken(IERC20(address(token)), rando, 1);

        // even the owner uses sweepTokens, not the manager path
        vm.expectRevert(MarbleVault.NotManager.selector);
        vault.transferToken(IERC20(address(token)), pool, 1);
    }

    function test_ManagerSwapIsOneTx() public {
        address newManager = makeAddr("raceManagerV2");
        vault.setManager(newManager);
        assertEq(vault.authorizedManager(), newManager);

        skip(1 days);
        vault.claimEmissions(token, _allSpecials());

        // old manager locked out, new one operative
        vm.prank(manager);
        vm.expectRevert(MarbleVault.NotManager.selector);
        vault.transferToken(IERC20(address(token)), pool, 1);

        vm.prank(newManager);
        vault.transferToken(IERC20(address(token)), pool, 1);
        assertEq(token.balanceOf(pool), 1);
    }

    function test_VaultReceivesSafeTransferredNft() public {
        // ERC721Holder: a rescued special can come back via safeTransferFrom
        vault.rescueSpecial(nft, 3, rando);
        vm.prank(rando);
        nft.safeTransferFrom(rando, address(vault), 3);
        assertEq(nft.ownerOf(3), address(vault));
    }
}

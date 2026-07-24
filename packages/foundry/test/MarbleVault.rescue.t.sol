// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { MarbleNFT } from "../contracts/MarbleNFT.sol";
import { MarbleToken } from "../contracts/MarbleToken.sol";
import { MarbleVault } from "../contracts/MarbleVault.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// Rescue suite is tested BEFORE the happy path (ratified priority 2026-07-04):
/// if the RaceManager or the vault wiring goes wrong, the owner must always be
/// able to extract the 16 specials and any tokens.
contract MarbleVaultRescueTest is Test {
    MarbleVault vault;
    MarbleNFT nft;
    MarbleToken token;
    address safeHarbor = makeAddr("safeHarbor");
    address mallory = makeAddr("mallory");

    function setUp() public {
        vault = new MarbleVault(); // deploys first: no wiring needed
        nft = new MarbleNFT(address(vault));
        token = new MarbleToken(nft, 10e18);
    }

    // --- rescueSpecial ---

    function test_OwnerRescuesOneSpecial() public {
        vault.rescueSpecial(IERC721(address(nft)), 7, safeHarbor);
        assertEq(nft.ownerOf(7), safeHarbor);
        assertEq(nft.balanceOf(address(vault)), 15);
    }

    function test_OwnerRescuesAllSixteenSpecials() public {
        for (uint256 id = 1; id <= 16; id++) {
            vault.rescueSpecial(IERC721(address(nft)), id, safeHarbor);
        }
        assertEq(nft.balanceOf(address(vault)), 0);
        assertEq(nft.balanceOf(safeHarbor), 16);
    }

    function test_RescueWorksEvenWithHostileManagerSet() public {
        vault.setManager(mallory); // wrong/compromised manager must not block rescue
        vault.rescueSpecial(IERC721(address(nft)), 1, safeHarbor);
        assertEq(nft.ownerOf(1), safeHarbor);
    }

    function test_NonOwnerCannotRescue() public {
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        vault.rescueSpecial(IERC721(address(nft)), 1, mallory);
    }

    function test_ManagerCannotRescue() public {
        vault.setManager(mallory);
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        vault.rescueSpecial(IERC721(address(nft)), 1, mallory);
    }

    // --- sweepTokens ---

    function test_OwnerSweepsFullTokenBalance() public {
        skip(2 days);
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        vault.claimEmissions(token, ids);
        uint256 held = token.balanceOf(address(vault));
        assertGt(held, 0);

        vault.sweepTokens(IERC20(address(token)), safeHarbor);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(token.balanceOf(safeHarbor), held);
    }

    function test_NonOwnerCannotSweep() public {
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        vault.sweepTokens(IERC20(address(token)), mallory);
    }

    // --- setManager gating ---

    function test_NonOwnerCannotSetManager() public {
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        vault.setManager(mallory);
    }
}

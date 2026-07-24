// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { MarbleNFT } from "../contracts/MarbleNFT.sol";
import { MarbleToken } from "../contracts/MarbleToken.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract MarbleTokenTest is Test {
    uint256 constant RATE = 10e18; // 10 MRBL / day

    MarbleNFT nft;
    MarbleToken token;
    address vault = makeAddr("vault");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        nft = new MarbleNFT(vault);
        token = new MarbleToken(nft, RATE);
    }

    function _ids(uint256 id) internal pure returns (uint256[] memory arr) {
        arr = new uint256[](1);
        arr[0] = id;
    }

    // --- claiming ---

    function test_AccruesRatePerDayFromNftMint() public {
        vm.prank(alice);
        uint256 id = nft.mint();
        skip(1 days);
        assertEq(token.claimable(id), RATE);
        vm.prank(alice);
        uint256 got = token.claim(_ids(id));
        assertEq(got, RATE);
        assertEq(token.balanceOf(alice), RATE);
    }

    function test_ClaimResetsAccrual() public {
        vm.startPrank(alice);
        uint256 id = nft.mint();
        skip(3 days);
        token.claim(_ids(id));
        // immediately re-claiming yields nothing
        uint256 got = token.claim(_ids(id));
        vm.stopPrank();
        assertEq(got, 0);
        assertEq(token.balanceOf(alice), 3 * RATE);
    }

    function test_OnlyCurrentNftHolderCanClaim() public {
        vm.prank(alice);
        uint256 id = nft.mint();
        skip(1 days);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(MarbleToken.NotMarbleHolder.selector, id));
        token.claim(_ids(id));
    }

    function test_UnmintedMarbleClaimsNothing() public view {
        assertEq(token.claimable(999), 0);
    }

    function test_VaultBatchClaimsAllSpecials() public {
        skip(1 days);
        uint256[] memory ids = new uint256[](16);
        for (uint256 i = 0; i < 16; i++) {
            ids[i] = i + 1;
        }
        vm.prank(vault);
        uint256 got = token.claim(ids);
        assertEq(got, 16 * RATE);
        assertEq(token.balanceOf(vault), 16 * RATE);
    }

    // --- supply control ---

    function test_NoMintPathBesidesClaim() public view {
        assertEq(token.totalSupply(), 0);
        // nothing to call: the ABI simply has no mint function — this test
        // documents the invariant that supply starts at zero.
    }

    function test_BurnReducesSupply() public {
        vm.startPrank(alice);
        uint256 id = nft.mint();
        skip(1 days);
        token.claim(_ids(id));
        token.burn(4e18);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), RATE - 4e18);
        assertEq(token.totalSupply(), RATE - 4e18);
    }

    // --- owner tuning ---

    function test_OwnerCanChangeRate() public {
        token.setRatePerDay(20e18);
        assertEq(token.ratePerDay(), 20e18);
    }

    function test_NonOwnerCannotChangeRate() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        token.setRatePerDay(20e18);
    }
}

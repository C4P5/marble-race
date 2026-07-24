// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { MarbleNFT } from "../contracts/MarbleNFT.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract ReentrantMinter is IERC721Receiver {
    MarbleNFT immutable nft;

    constructor(MarbleNFT _nft) {
        nft = _nft;
    }

    function attack() external {
        nft.mint();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        nft.mint(); // try to grab a second public marble mid-mint
        return this.onERC721Received.selector;
    }
}

contract MarbleNFTTest is Test {
    MarbleNFT nft;
    address vault = makeAddr("vault");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        nft = new MarbleNFT(vault);
    }

    // --- specials at deploy ---

    function test_DeployMintsAllSpecialsToVault() public view {
        assertEq(nft.balanceOf(vault), 16);
        for (uint256 id = 1; id <= 16; id++) {
            assertEq(nft.ownerOf(id), vault);
            assertTrue(nft.isSpecial(id));
            assertEq(nft.mintedAt(id), block.timestamp);
        }
        assertFalse(nft.isSpecial(17));
        assertEq(nft.publicHoldings(vault), 0);
    }

    // --- public mint ---

    function test_FreeMintAssignsSequentialIdsFrom17() public {
        vm.prank(alice);
        uint256 id = nft.mint();
        assertEq(id, 17);
        assertEq(nft.ownerOf(17), alice);
        assertEq(nft.mintedAt(17), block.timestamp);

        vm.prank(bob);
        assertEq(nft.mint(), 18);
    }

    function test_SecondMintSameWalletReverts() public {
        vm.startPrank(alice);
        nft.mint();
        vm.expectRevert(MarbleNFT.OnePublicMarblePerWallet.selector);
        nft.mint();
        vm.stopPrank();
    }

    function test_ReentrantMintBlocked() public {
        ReentrantMinter attacker = new ReentrantMinter(nft);
        vm.expectRevert(MarbleNFT.OnePublicMarblePerWallet.selector);
        attacker.attack();
        assertEq(nft.balanceOf(address(attacker)), 0);
    }

    function test_MintingAll240PublicThenSoldOut() public {
        for (uint256 i = 0; i < 240; i++) {
            vm.prank(address(uint160(0x10000 + i)));
            nft.mint();
        }
        vm.prank(alice);
        vm.expectRevert(MarbleNFT.SoldOut.selector);
        nft.mint();
    }

    // --- one-per-wallet on transfer ---

    function test_TransferToWalletWithPublicMarbleReverts() public {
        vm.prank(alice);
        nft.mint(); // 17
        vm.prank(bob);
        nft.mint(); // 18
        vm.prank(alice);
        vm.expectRevert(MarbleNFT.OnePublicMarblePerWallet.selector);
        nft.transferFrom(alice, bob, 17);
    }

    function test_TransferToFreshWalletWorksAndFreesSender() public {
        vm.startPrank(alice);
        nft.mint(); // 17
        nft.transferFrom(alice, bob, 17);
        // alice's slot is free again: she can mint a new one
        uint256 id = nft.mint();
        vm.stopPrank();
        assertEq(id, 18);
        assertEq(nft.ownerOf(17), bob);
        assertEq(nft.publicHoldings(alice), 1);
        assertEq(nft.publicHoldings(bob), 1);
    }

    // --- specials exemption ---

    function test_SpecialsExemptFromWalletLimit() public {
        vm.prank(alice);
        nft.mint(); // alice holds public 17
        // vault sends a special to alice: allowed even though she holds a public marble
        vm.prank(vault);
        nft.transferFrom(vault, alice, 1);
        assertEq(nft.ownerOf(1), alice);
        // and a second special too: specials never count
        vm.prank(vault);
        nft.transferFrom(vault, alice, 2);
        assertEq(nft.balanceOf(alice), 3);
        assertEq(nft.publicHoldings(alice), 1);
    }

    function test_WalletHoldingSpecialCanStillMintPublic() public {
        vm.prank(vault);
        nft.transferFrom(vault, alice, 1);
        vm.prank(alice);
        uint256 id = nft.mint();
        assertEq(nft.ownerOf(id), alice);
    }
}

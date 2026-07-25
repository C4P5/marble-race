// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { MarbleNFT } from "../contracts/MarbleNFT.sol";

contract MarbleNFTArtTest is Test {
    MarbleNFT internal nft;
    address internal vault = address(0x5EED);

    function setUp() public {
        nft = new MarbleNFT(vault);
    }

    function _startsWith(string memory s, string memory prefix) internal pure returns (bool) {
        bytes memory sb = bytes(s);
        bytes memory pb = bytes(prefix);
        if (sb.length < pb.length) return false;
        for (uint256 i = 0; i < pb.length; i++) {
            if (sb[i] != pb[i]) return false;
        }
        return true;
    }

    function test_SpecialTokenURIIsDataJson() public view {
        // specials 1-16 are minted to the vault at construction
        assertTrue(_startsWith(nft.tokenURI(1), "data:application/json;base64,"));
    }

    function test_TokenURIRevertsForUnminted() public {
        vm.expectRevert(); // ERC721NonexistentToken via _requireOwned
        nft.tokenURI(17);
    }

    function test_PublicTokenURIAfterMint() public {
        vm.prank(address(0xA11CE));
        uint256 id = nft.mint();
        assertEq(id, 17);
        assertTrue(_startsWith(nft.tokenURI(17), "data:application/json;base64,"));
    }

    function test_ColorFamiliesByRange() public view {
        assertEq(nft.colorName(1), "Especial");
        assertEq(nft.colorName(17), "Roja");
        assertEq(nft.colorName(96), "Roja");
        assertEq(nft.colorName(97), "Azul");
        assertEq(nft.colorName(176), "Azul");
        assertEq(nft.colorName(177), "Amarilla");
        assertEq(nft.colorName(256), "Amarilla");
    }

    function test_SpecialsAreUnique() public view {
        assertTrue(keccak256(bytes(nft.tokenURI(1))) != keccak256(bytes(nft.tokenURI(2))));
        assertTrue(keccak256(bytes(nft.tokenURI(8))) != keccak256(bytes(nft.tokenURI(9))));
    }

    function test_PublicGradientsAreUnique() public {
        vm.prank(address(0x1));
        nft.mint(); // 17
        vm.prank(address(0x2));
        nft.mint(); // 18
        assertTrue(keccak256(bytes(nft.tokenURI(17))) != keccak256(bytes(nft.tokenURI(18))));
    }
}

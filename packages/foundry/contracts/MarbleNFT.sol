// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice 256 marbles total. Ids 1-16 are the "special" marbles mirroring the
/// physical set: minted to the vault at deploy and exempt from the wallet limit.
/// Ids 17-256 are public marbles: free mint, hard limit of one public marble per
/// wallet enforced on mint and on every transfer.
contract MarbleNFT is ERC721 {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 256;
    uint256 public constant SPECIAL_COUNT = 16;

    uint256 public nextId = SPECIAL_COUNT + 1;
    mapping(uint256 tokenId => uint256 timestamp) public mintedAt;
    mapping(address holder => uint256 count) public publicHoldings;

    error OnePublicMarblePerWallet();
    error SoldOut();

    constructor(address specialsRecipient) ERC721("Marble Race", "MARBLE") {
        for (uint256 id = 1; id <= SPECIAL_COUNT; id++) {
            mintedAt[id] = block.timestamp;
            _mint(specialsRecipient, id);
        }
    }

    function mint() external returns (uint256 id) {
        if (nextId > MAX_SUPPLY) revert SoldOut();
        id = nextId++;
        mintedAt[id] = block.timestamp;
        _safeMint(msg.sender, id);
    }

    function isSpecial(uint256 tokenId) public pure returns (bool) {
        return tokenId >= 1 && tokenId <= SPECIAL_COUNT;
    }

    /// @dev Wallet limit lives here so it covers mints and transfers alike.
    /// Only public marbles count toward the limit; specials move freely.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (!isSpecial(tokenId)) {
            if (from != address(0)) {
                publicHoldings[from]--;
            }
            if (to != address(0)) {
                if (publicHoldings[to] != 0) revert OnePublicMarblePerWallet();
                publicHoldings[to]++;
            }
        }
    }

    // --- On-chain art -------------------------------------------------------
    // Every marble's image is a gradient SVG generated here, 100% on-chain
    // (no IPFS, no files). Same math as the docs/ preview, so the NFT and the
    // race sprite can share one look.

    /// @notice Human-readable colour family. Lets the frontend match the race
    /// sprite to the NFT (see docs/graphics-integration.es.md).
    function colorName(uint256 tokenId) public pure returns (string memory) {
        if (isSpecial(tokenId)) return "Especial";
        uint256 fam = (tokenId - 17) / 80;
        if (fam == 0) return "Roja";
        if (fam == 1) return "Azul";
        return "Amarilla";
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory json = string.concat(
            '{"name":"Bolita #', tokenId.toString(),
            '","description":"Marble Race - carrera de bolitas probadamente justa sobre Ethereum.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(_svg(tokenId))),
            '","attributes":[{"trait_type":"Tipo","value":"', _tipo(tokenId),
            '"},{"trait_type":"Color","value":"', colorName(tokenId), '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _tipo(uint256 tokenId) internal pure returns (string memory) {
        if (isSpecial(tokenId)) return "Especial";
        return "Publica";
    }

    function _svg(uint256 tokenId) internal pure returns (string memory) {
        (string memory inner, string memory outer) = _gradient(tokenId);
        string memory ring = "";
        if (isSpecial(tokenId)) {
            ring = '<circle cx="50" cy="50" r="41" fill="none" stroke="#ffd24a" stroke-width="3"/>';
        }
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
            '<defs><radialGradient id="g" cx="35%" cy="30%" r="75%">',
            '<stop offset="0%" stop-color="', inner, '"/>',
            '<stop offset="100%" stop-color="', outer, '"/></radialGradient></defs>',
            '<rect width="100" height="100" fill="#0d1116"/>',
            '<circle cx="50" cy="50" r="42" fill="url(#g)"/>', ring, '</svg>'
        );
    }

    /// @dev Inner (highlight) + outer (edge) gradient stops as hsl() strings.
    /// Specials: unique hue per id. Public: 80 reds / 80 blues / 80 yellows,
    /// each a unique gradient by (id-17)%80.
    function _gradient(uint256 tokenId) internal pure returns (string memory inner, string memory outer) {
        if (isSpecial(tokenId)) {
            uint256 shue = (tokenId - 1) * 360 / SPECIAL_COUNT;
            return (_hsl(shue, 85, 68), _hsl(shue, 80, 30));
        }
        uint256 t = tokenId - 17;
        uint256 k = t % 80;
        uint256[3] memory bases = [uint256(0), 220, 48];
        uint256 baseHue = bases[t / 80];
        uint256 innerL = 55 + (k * 25) / 79;
        uint256 outerL = 22 + (k * 28) / 79;
        uint256 outHue = uint256(int256(baseHue) + int256((k * 24) / 79) - 12 + 360) % 360;
        return (_hsl(baseHue, 90, innerL), _hsl(outHue, 80, outerL));
    }

    function _hsl(uint256 h, uint256 s, uint256 l) internal pure returns (string memory) {
        return string.concat("hsl(", h.toString(), ",", s.toString(), "%,", l.toString(), "%)");
    }
}

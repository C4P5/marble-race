// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice 256 marbles total. Ids 1-16 are the "special" marbles mirroring the
/// physical set: minted to the vault at deploy and exempt from the wallet limit.
/// Ids 17-256 are public marbles: free mint, hard limit of one public marble per
/// wallet enforced on mint and on every transfer.
contract MarbleNFT is ERC721 {
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
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Burnable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { MarbleNFT } from "./MarbleNFT.sol";

/// @notice Closed-loop arcade credit. The ONLY mint path is claiming emissions:
/// every marble NFT accrues credit continuously at the same rate from its mint
/// timestamp, claimable by whoever holds the NFT (pull payments). Burnable.
contract MarbleToken is ERC20, ERC20Burnable, Ownable {
    MarbleNFT public immutable nft;

    /// @dev Rate changes apply to time not yet claimed — acceptable for the
    /// closed-loop testnet economy, so claim before tuning if that matters.
    uint256 public ratePerDay;

    mapping(uint256 tokenId => uint256 timestamp) public lastClaim;

    event Claimed(address indexed holder, uint256 indexed tokenId, uint256 amount);
    event RateChanged(uint256 ratePerDay);

    error NotMarbleHolder(uint256 tokenId);

    constructor(MarbleNFT _nft, uint256 _ratePerDay) ERC20("Marble Credit", "MRBL") Ownable(msg.sender) {
        nft = _nft;
        ratePerDay = _ratePerDay;
    }

    function claimable(uint256 tokenId) public view returns (uint256) {
        uint256 from = lastClaim[tokenId];
        if (from == 0) from = nft.mintedAt(tokenId);
        if (from == 0) return 0; // marble not minted yet
        return ((block.timestamp - from) * ratePerDay) / 1 days;
    }

    function claim(uint256[] calldata tokenIds) external returns (uint256 total) {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 id = tokenIds[i];
            if (nft.ownerOf(id) != msg.sender) revert NotMarbleHolder(id);
            uint256 amount = claimable(id);
            lastClaim[id] = block.timestamp;
            emit Claimed(msg.sender, id, amount);
            total += amount;
        }
        _mint(msg.sender, total);
    }

    function setRatePerDay(uint256 _ratePerDay) external onlyOwner {
        ratePerDay = _ratePerDay;
        emit RateChanged(_ratePerDay);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC721Holder } from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MarbleToken } from "./MarbleToken.sol";

/// @notice The house is a contract that owns its own marbles. Deploy-once vault
/// holding the 16 special marbles and their emissions. Asset addresses are call
/// parameters, not storage: the vault deploys before the NFT/token, so nothing
/// needs wiring and a RaceManager redeploy is a single setManager tx.
contract MarbleVault is Ownable, ERC721Holder {
    using SafeERC20 for IERC20;

    address public authorizedManager;

    event ManagerChanged(address indexed manager);
    event SpecialRescued(address indexed nft, uint256 indexed tokenId, address to);
    event TokensSwept(address indexed token, address to, uint256 amount);

    error NotManager();

    constructor() Ownable(msg.sender) {}

    // --- owner-only rescue suite ---

    function rescueSpecial(IERC721 nft, uint256 tokenId, address to) external onlyOwner {
        nft.transferFrom(address(this), to, tokenId);
        emit SpecialRescued(address(nft), tokenId, to);
    }

    function sweepTokens(IERC20 token, address to) external onlyOwner {
        uint256 amount = token.balanceOf(address(this));
        token.safeTransfer(to, amount);
        emit TokensSwept(address(token), to, amount);
    }

    function setManager(address manager) external onlyOwner {
        authorizedManager = manager;
        emit ManagerChanged(manager);
    }

    // --- manager path: seed race pools from vault-held emissions ---

    function transferToken(IERC20 token, address to, uint256 amount) external {
        if (msg.sender != authorizedManager) revert NotManager();
        token.safeTransfer(to, amount);
    }

    // --- permissionless poke: anyone may pay gas to pull emissions into the vault ---

    function claimEmissions(MarbleToken token, uint256[] calldata tokenIds) external returns (uint256) {
        return token.claim(tokenIds);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { VRFConsumerBaseV2Plus } from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import { VRFV2PlusClient } from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MarbleNFT } from "./MarbleNFT.sol";
import { MarbleToken } from "./MarbleToken.sol";
import { MarbleVault } from "./MarbleVault.sol";

/// @notice Special marbles (ids 1-16) HOST races; they never race. Public marbles
/// (17-256) race, one at a time. Every special funds its own races out of its own
/// emissions — `specialBalance` is per marble, never a shared pot, so a special
/// can be sold or gifted to a streamer who then hosts off their own stream.
/// The finishing order comes from Chainlink VRF v2.5; the frontend animation is
/// choreography that arrives at that order.
contract MarbleRace is VRFConsumerBaseV2Plus {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open,
        Drawing,
        Drawn,
        Settled,
        Cancelled
    }

    struct Race {
        uint256 specialId; // host marble, 1-16
        uint256 entryFee; // also the seed the host put up ("1X pot")
        uint256 randomWord;
        uint64 deadline;
        Status status;
        uint256[] entrants;
    }

    /// @dev Pot split in basis points. Winner takes the remainder so nothing is
    /// left as dust: 5000 + 2500 + 1250 + 1000 + 250 = 10000.
    uint256 public constant SECOND_BPS = 2500;
    uint256 public constant THIRD_BPS = 1250;
    uint256 public constant BURN_BPS = 1000;
    uint256 public constant HOST_BPS = 250;
    uint256 private constant BPS = 10_000;

    /// @dev Paid places in `settle`; `minPlayers` can never drop below it.
    uint256 private constant PODIUM = 3;
    /// @dev Grace period after the deadline before a race whose randomness never
    /// arrived can be refunded.
    uint64 public constant RESCUE_DELAY = 1 days;

    MarbleNFT public immutable nft;
    MarbleToken public immutable token;
    MarbleVault public immutable vault;

    bytes32 public keyHash;
    uint256 public subscriptionId;
    uint32 public callbackGasLimit = 200_000;
    uint16 public requestConfirmations = 3;

    uint256 public minPlayers = 3; // podium needs three finishers
    uint256 public maxPlayers = 16;
    uint64 public joinWindow = 1 days;

    uint256 public nextRaceId = 1;

    mapping(uint256 raceId => Race) private _races;
    mapping(uint256 raceId => uint256[]) private _finishOrder;
    mapping(uint256 requestId => uint256 raceId) public raceByRequest;
    /// @notice 0 when the marble is free to enter a race.
    mapping(uint256 tokenId => uint256 raceId) public activeRace;
    mapping(uint256 specialId => uint256) public racesHosted;
    /// @notice MRBL earmarked to one special. Never pooled across marbles.
    mapping(uint256 specialId => uint256) public specialBalance;

    event SpecialFunded(uint256 indexed specialId, uint256 amount, address indexed from);
    event SpecialWithdrawn(uint256 indexed specialId, uint256 amount, address indexed to);
    event RaceCreated(uint256 indexed raceId, uint256 indexed specialId, uint256 entryFee, uint64 deadline);
    event Joined(uint256 indexed raceId, uint256 indexed tokenId, address indexed player);
    event RaceDrawing(uint256 indexed raceId, uint256 indexed requestId);
    event RaceDrawn(uint256 indexed raceId, uint256 randomWord);
    event RaceSettled(uint256 indexed raceId, uint256[] finishOrder, uint256 pot);
    event RaceCancelled(uint256 indexed raceId);

    error NotSpecial();
    error SpecialsCannotRace();
    error NotHost();
    error NotMarbleHolder();
    error MarbleBusy();
    error RaceNotOpen();
    error RaceNotDrawn();
    error JoinClosed();
    error RaceFull();
    error TooEarly();
    error NotEnoughPlayers();
    error EnoughPlayers();
    error ZeroEntry();
    error InsufficientSpecialBalance();
    error MinPlayersTooLow();
    error NotVaultHeld();
    error InvalidBounds();
    error NotStalled();
    error InvalidVrfConfig();

    constructor(
        MarbleNFT _nft,
        MarbleToken _token,
        MarbleVault _vault,
        address _coordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash
    ) VRFConsumerBaseV2Plus(_coordinator) {
        nft = _nft;
        token = _token;
        vault = _vault;
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
    }

    // --- funding: strictly per special ---

    /// @notice Pull one vault-held special's emissions into that special's own
    /// balance. Permissionless: anyone may pay the gas. Requires this contract
    /// to be the vault's `authorizedManager`.
    function fundSpecialFromVault(uint256 specialId) external returns (uint256 amount) {
        if (!nft.isSpecial(specialId)) revert NotSpecial();
        if (nft.ownerOf(specialId) != address(vault)) revert NotVaultHeld();
        uint256[] memory ids = new uint256[](1);
        ids[0] = specialId;
        amount = vault.claimEmissions(token, ids);
        vault.transferToken(IERC20(address(token)), address(this), amount);
        specialBalance[specialId] += amount;
        emit SpecialFunded(specialId, amount, address(vault));
    }

    /// @notice Top up a special's balance from your own wallet. Anyone may fund
    /// any special — useful once specials live with individual holders.
    function depositForSpecial(uint256 specialId, uint256 amount) external {
        if (!nft.isSpecial(specialId)) revert NotSpecial();
        IERC20(address(token)).safeTransferFrom(msg.sender, address(this), amount);
        specialBalance[specialId] += amount;
        emit SpecialFunded(specialId, amount, msg.sender);
    }

    function withdrawFromSpecial(uint256 specialId, uint256 amount, address to) external {
        _requireHostAuth(specialId);
        specialBalance[specialId] -= amount; // underflow reverts
        IERC20(address(token)).safeTransfer(to, amount);
        emit SpecialWithdrawn(specialId, amount, to);
    }

    // --- hosting ---

    /// @notice Open a pool hosted by `specialId`, seeded with one entry's worth
    /// out of that special's own balance.
    function createRace(uint256 specialId, uint256 entryFee) external returns (uint256 raceId) {
        if (!nft.isSpecial(specialId)) revert NotSpecial();
        if (entryFee == 0) revert ZeroEntry();
        _requireHostAuth(specialId);
        if (specialBalance[specialId] < entryFee) revert InsufficientSpecialBalance();
        specialBalance[specialId] -= entryFee;

        raceId = nextRaceId++;
        Race storage r = _races[raceId];
        r.specialId = specialId;
        r.entryFee = entryFee;
        r.deadline = uint64(block.timestamp) + joinWindow;
        r.status = Status.Open;
        emit RaceCreated(raceId, specialId, entryFee, r.deadline);
    }

    /// @dev A vault-held special is hosted by the project (the vault's owner);
    /// once distributed, by whoever holds it.
    function _requireHostAuth(uint256 specialId) private view {
        address holder = nft.ownerOf(specialId);
        if (holder == address(vault)) {
            if (msg.sender != vault.owner()) revert NotHost();
        } else if (msg.sender != holder) {
            revert NotHost();
        }
    }

    // --- racing ---

    function join(uint256 raceId, uint256 tokenId) external {
        Race storage r = _races[raceId];
        if (r.status != Status.Open) revert RaceNotOpen();
        if (block.timestamp > r.deadline) revert JoinClosed();
        if (r.entrants.length >= maxPlayers) revert RaceFull();
        if (nft.isSpecial(tokenId)) revert SpecialsCannotRace();
        if (nft.ownerOf(tokenId) != msg.sender) revert NotMarbleHolder();
        if (activeRace[tokenId] != 0) revert MarbleBusy();

        activeRace[tokenId] = raceId;
        r.entrants.push(tokenId);
        IERC20(address(token)).safeTransferFrom(msg.sender, address(this), r.entryFee);
        emit Joined(raceId, tokenId, msg.sender);
    }

    /// @notice Permissionless poke: request randomness once the pool is full, or
    /// after the deadline if it reached `minPlayers`.
    function startRace(uint256 raceId) external returns (uint256 requestId) {
        Race storage r = _races[raceId];
        if (r.status != Status.Open) revert RaceNotOpen();
        if (r.entrants.length < maxPlayers) {
            if (block.timestamp <= r.deadline) revert TooEarly();
            if (r.entrants.length < minPlayers) revert NotEnoughPlayers();
        }

        r.status = Status.Drawing;
        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: subscriptionId,
                requestConfirmations: requestConfirmations,
                callbackGasLimit: callbackGasLimit,
                numWords: 1,
                // Paid in native Sepolia ETH, so no LINK is needed.
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({ nativePayment: true }))
            })
        );
        raceByRequest[requestId] = raceId;
        emit RaceDrawing(raceId, requestId);
    }

    /// @dev Kept deliberately tiny — payouts happen in `settle` so a gas spike
    /// or a failing transfer can never strand the randomness.
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        uint256 raceId = raceByRequest[requestId];
        Race storage r = _races[raceId];
        // Ignore anything that is not a race still awaiting its draw: an unknown
        // requestId (which would otherwise write to race 0), or a late callback
        // for a race already refunded by `rescueStalled` — accepting that would
        // let `settle` pay out a pot that was returned, spending other races'
        // committed funds. Must return rather than revert: the coordinator
        // deletes the request commitment before calling us, so a reverting
        // callback destroys the randomness permanently.
        if (r.status != Status.Drawing) return;
        r.randomWord = randomWords[0];
        r.status = Status.Drawn;
        emit RaceDrawn(raceId, randomWords[0]);
    }

    /// @notice Permissionless: shuffle by the VRF word, pay the podium, burn the
    /// house cut, credit the host's share back to its special.
    function settle(uint256 raceId) external {
        Race storage r = _races[raceId];
        if (r.status != Status.Drawn) revert RaceNotDrawn();

        uint256 n = r.entrants.length;
        uint256[] memory order = _shuffled(r.entrants, r.randomWord);
        uint256 pot = r.entryFee * (n + 1); // entries + the host's seed

        r.status = Status.Settled;
        _finishOrder[raceId] = order;
        racesHosted[r.specialId] += 1;
        for (uint256 i = 0; i < n; i++) {
            activeRace[order[i]] = 0;
        }

        uint256 second = (pot * SECOND_BPS) / BPS;
        uint256 third = (pot * THIRD_BPS) / BPS;
        uint256 burned = (pot * BURN_BPS) / BPS;
        uint256 hostCut = (pot * HOST_BPS) / BPS;
        uint256 first = pot - second - third - burned - hostCut; // absorbs rounding

        IERC20 t = IERC20(address(token));
        t.safeTransfer(nft.ownerOf(order[0]), first);
        t.safeTransfer(nft.ownerOf(order[1]), second);
        t.safeTransfer(nft.ownerOf(order[2]), third);
        token.burn(burned);
        specialBalance[r.specialId] += hostCut;

        emit RaceSettled(raceId, order, pot);
    }

    /// @notice Refund everyone if the pool never reached `minPlayers`.
    function cancel(uint256 raceId) external {
        Race storage r = _races[raceId];
        if (r.status != Status.Open) revert RaceNotOpen();
        if (block.timestamp <= r.deadline) revert TooEarly();
        if (r.entrants.length >= minPlayers) revert EnoughPlayers();

        r.status = Status.Cancelled;
        _refundAll(raceId, r);
    }

    /// @notice Escape hatch for a race whose randomness never arrived — an
    /// underfunded VRF subscription is the common cause, and the coordinator
    /// accepts requests without checking the balance. Without this, entrants'
    /// MRBL and their marbles would be locked forever. Permissionless so no
    /// admin key has to be alive, delayed so a merely slow VRF is never cut off.
    /// @dev Deliberately does NOT cover `Drawn`: the winning word is public from
    /// the `RaceDrawn` event onward, so a refund available at that point would
    /// let losers escape before anyone could call `settle`.
    function rescueStalled(uint256 raceId) external {
        Race storage r = _races[raceId];
        if (r.status != Status.Drawing) revert NotStalled();
        if (block.timestamp <= uint256(r.deadline) + RESCUE_DELAY) revert TooEarly();
        r.status = Status.Cancelled;
        _refundAll(raceId, r);
    }

    function _refundAll(uint256 raceId, Race storage r) private {
        IERC20 t = IERC20(address(token));
        uint256 n = r.entrants.length;
        for (uint256 i = 0; i < n; i++) {
            uint256 id = r.entrants[i];
            activeRace[id] = 0;
            t.safeTransfer(nft.ownerOf(id), r.entryFee);
        }
        specialBalance[r.specialId] += r.entryFee; // seed goes back to the host
        emit RaceCancelled(raceId);
    }

    /// @dev Fisher-Yates over a copy, driven by the VRF word.
    function _shuffled(uint256[] storage src, uint256 seed) private view returns (uint256[] memory out) {
        uint256 n = src.length;
        out = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            out[i] = src[i];
        }
        for (uint256 i = n - 1; i > 0; i--) {
            uint256 j = uint256(keccak256(abi.encode(seed, i))) % (i + 1);
            (out[i], out[j]) = (out[j], out[i]);
        }
    }

    // --- views ---

    function getRace(uint256 raceId)
        external
        view
        returns (
            uint256 specialId,
            uint256 entryFee,
            uint64 deadline,
            Status status,
            uint256 entrantCount,
            uint256 pot
        )
    {
        Race storage r = _races[raceId];
        return (
            r.specialId,
            r.entryFee,
            r.deadline,
            r.status,
            r.entrants.length,
            r.entryFee * (r.entrants.length + 1)
        );
    }

    function getEntrants(uint256 raceId) external view returns (uint256[] memory) {
        return _races[raceId].entrants;
    }

    function getFinishOrder(uint256 raceId) external view returns (uint256[] memory) {
        return _finishOrder[raceId];
    }

    // --- owner-tunable economics ---

    /// @dev `_max >= _min >= PODIUM` is what guarantees every drawn race has at
    /// least three finishers: `startRace` only proceeds when the field reached
    /// `maxPlayers` or `minPlayers`, and entrants never leave a race.
    function setPlayerBounds(uint256 _min, uint256 _max) external onlyOwner {
        if (_min < PODIUM) revert MinPlayersTooLow();
        if (_max < _min) revert InvalidBounds();
        minPlayers = _min;
        maxPlayers = _max;
    }

    function setJoinWindow(uint64 _window) external onlyOwner {
        joinWindow = _window;
    }

    /// @dev Validated because a race that reached `minPlayers` can no longer be
    /// cancelled — its only exit is a successful `startRace`. A config the live
    /// coordinator rejects (Sepolia enforces a 3-confirmation minimum) would
    /// otherwise strand a well-attended race until an admin noticed.
    function setVrfConfig(bytes32 _keyHash, uint256 _subscriptionId, uint32 _callbackGasLimit, uint16 _confirmations)
        external
        onlyOwner
    {
        if (_keyHash == bytes32(0) || _subscriptionId == 0 || _confirmations < 3 || _callbackGasLimit < 50_000) {
            revert InvalidVrfConfig();
        }
        keyHash = _keyHash;
        subscriptionId = _subscriptionId;
        callbackGasLimit = _callbackGasLimit;
        requestConfirmations = _confirmations;
    }
}

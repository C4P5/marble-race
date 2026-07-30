// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { VRFCoordinatorV2_5Mock } from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
import { MarbleNFT } from "../contracts/MarbleNFT.sol";
import { MarbleToken } from "../contracts/MarbleToken.sol";
import { MarbleVault } from "../contracts/MarbleVault.sol";
import { MarbleRace } from "../contracts/MarbleRace.sol";

contract MarbleRaceTest is Test {
    MarbleVault vault;
    MarbleNFT nft;
    MarbleToken token;
    MarbleRace race;
    VRFCoordinatorV2_5Mock coordinator;

    uint256 subId;
    uint256 constant RATE = 10e18; // MRBL per day per marble
    uint256 constant ENTRY = 5e18;

    function setUp() public {
        vault = new MarbleVault();
        nft = new MarbleNFT(address(vault));
        token = new MarbleToken(nft, RATE);

        coordinator = new VRFCoordinatorV2_5Mock(0.0001 ether, 1e9, 4e15);
        subId = coordinator.createSubscription();
        vm.deal(address(this), 100 ether);
        coordinator.fundSubscriptionWithNative{ value: 50 ether }(subId);

        race = new MarbleRace(nft, token, vault, address(coordinator), subId, keccak256("keyHash"));
        coordinator.addConsumer(subId, address(race));
        vault.setManager(address(race));

        vm.warp(block.timestamp + 1 days); // let a day of emissions accrue
    }

    // --- helpers ---

    /// @dev Fresh wallet holding one public marble with MRBL to spend. Balances
    /// are dealt rather than accrued: warping per player would push past the
    /// race's join deadline and is orthogonal to what these tests check.
    function _player(uint256 i) internal returns (address who, uint256 tokenId) {
        who = address(uint160(0x1000 + i));
        vm.prank(who);
        tokenId = nft.mint();
        deal(address(token), who, ENTRY * 4, true); // true = keep totalSupply consistent
        vm.prank(who);
        token.approve(address(race), type(uint256).max);
    }

    function _fundSpecial(uint256 specialId) internal returns (uint256) {
        return race.fundSpecialFromVault(specialId);
    }

    function _openRace(uint256 specialId) internal returns (uint256 raceId) {
        _fundSpecial(specialId);
        raceId = race.createRace(specialId, ENTRY);
    }

    /// @dev Drive a race to Drawn with a controlled random word.
    function _drawWith(uint256 raceId, uint256 word) internal {
        uint256 requestId = race.startRace(raceId);
        uint256[] memory words = new uint256[](1);
        words[0] = word;
        coordinator.fulfillRandomWordsWithOverride(requestId, address(race), words);
    }

    // --- per-special funding: never a shared pot ---

    function test_FundSpecialCreditsOnlyThatSpecial() public {
        uint256 amount = _fundSpecial(1);
        assertGt(amount, 0);
        assertEq(race.specialBalance(1), amount);
        for (uint256 id = 2; id <= 16; id++) {
            assertEq(race.specialBalance(id), 0, "other specials must stay untouched");
        }
    }

    function test_EachSpecialFundsIndependently() public {
        _fundSpecial(1);
        vm.warp(block.timestamp + 2 days);
        _fundSpecial(2);
        // #2 accrued for longer, so it must hold strictly more
        assertGt(race.specialBalance(2), race.specialBalance(1));
    }

    function test_FundSpecialRevertsForPublicId() public {
        vm.expectRevert(MarbleRace.NotSpecial.selector);
        race.fundSpecialFromVault(17);
    }

    function test_FundSpecialRevertsOnceDistributed() public {
        vault.rescueSpecial(nft, 3, address(0xA11CE));
        vm.expectRevert(MarbleRace.NotVaultHeld.selector);
        race.fundSpecialFromVault(3);
    }

    function test_DepositForSpecialFromOwnWallet() public {
        (address alice,) = _player(1);
        uint256 amount = 3e18;
        vm.prank(alice);
        race.depositForSpecial(7, amount);
        assertEq(race.specialBalance(7), amount);
    }

    function test_WithdrawFromSpecialOnlyHost() public {
        _fundSpecial(1);
        uint256 bal = race.specialBalance(1);

        vm.prank(address(0xBAD));
        vm.expectRevert(MarbleRace.NotHost.selector);
        race.withdrawFromSpecial(1, bal, address(0xBAD));

        // vault-held special: the vault's owner (this contract) is the host
        race.withdrawFromSpecial(1, bal, address(this));
        assertEq(race.specialBalance(1), 0);
        assertEq(token.balanceOf(address(this)), bal);
    }

    // --- hosting ---

    function test_CreateRaceDeductsSeedFromItsOwnSpecial() public {
        uint256 funded = _fundSpecial(1);
        uint256 raceId = race.createRace(1, ENTRY);
        assertEq(race.specialBalance(1), funded - ENTRY);
        (uint256 specialId, uint256 entryFee,, MarbleRace.Status status, uint256 count, uint256 pot) =
            race.getRace(raceId);
        assertEq(specialId, 1);
        assertEq(entryFee, ENTRY);
        assertEq(uint8(status), uint8(MarbleRace.Status.Open));
        assertEq(count, 0);
        assertEq(pot, ENTRY, "empty pool still holds the host's seed");
    }

    function test_CreateRaceRevertsWithoutEnoughBalance() public {
        vm.expectRevert(MarbleRace.InsufficientSpecialBalance.selector);
        race.createRace(1, ENTRY);
    }

    function test_NonHostCannotCreateRace() public {
        _fundSpecial(1);
        vm.prank(address(0xBAD));
        vm.expectRevert(MarbleRace.NotHost.selector);
        race.createRace(1, ENTRY);
    }

    function test_CreateRaceRevertsForPublicId() public {
        vm.expectRevert(MarbleRace.NotSpecial.selector);
        race.createRace(17, ENTRY);
    }

    /// The streamer case: once a special is distributed, its holder hosts.
    function test_DistributedSpecialHolderHostsOwnRaces() public {
        (address alice,) = _player(1);
        vault.rescueSpecial(nft, 3, alice);

        vm.startPrank(alice);
        race.depositForSpecial(3, ENTRY);
        uint256 raceId = race.createRace(3, ENTRY);
        vm.stopPrank();

        (uint256 specialId,,,,,) = race.getRace(raceId);
        assertEq(specialId, 3);
        // and the project can no longer host with it
        vm.expectRevert(MarbleRace.NotHost.selector);
        race.createRace(3, ENTRY);
    }

    // --- racing rules ---

    function test_SpecialsCannotRace() public {
        uint256 raceId = _openRace(1);
        vault.rescueSpecial(nft, 5, address(0xA11CE));
        vm.prank(address(0xA11CE));
        vm.expectRevert(MarbleRace.SpecialsCannotRace.selector);
        race.join(raceId, 5);
    }

    function test_OnlyMarbleHolderCanJoin() public {
        uint256 raceId = _openRace(1);
        (, uint256 id) = _player(1);
        vm.prank(address(0xBAD));
        vm.expectRevert(MarbleRace.NotMarbleHolder.selector);
        race.join(raceId, id);
    }

    function test_MarbleCannotEnterTwoRacesAtOnce() public {
        uint256 first = _openRace(1);
        uint256 second = _openRace(2);
        (address alice, uint256 id) = _player(1);

        vm.startPrank(alice);
        race.join(first, id);
        vm.expectRevert(MarbleRace.MarbleBusy.selector);
        race.join(second, id);
        vm.stopPrank();
        assertEq(race.activeRace(id), first);
    }

    function test_JoinCollectsEntryFee() public {
        uint256 raceId = _openRace(1);
        (address alice, uint256 id) = _player(1);
        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        race.join(raceId, id);
        assertEq(token.balanceOf(alice), before - ENTRY);
        (,,,, uint256 count, uint256 pot) = race.getRace(raceId);
        assertEq(count, 1);
        assertEq(pot, ENTRY * 2, "one entry plus the seed");
    }

    function test_RaceFullRejectsExtraJoin() public {
        race.setPlayerBounds(3, 3);
        uint256 raceId = _openRace(1);
        for (uint256 i = 1; i <= 3; i++) {
            (address p, uint256 id) = _player(i);
            vm.prank(p);
            race.join(raceId, id);
        }
        (address late, uint256 lateId) = _player(9);
        vm.prank(late);
        vm.expectRevert(MarbleRace.RaceFull.selector);
        race.join(raceId, lateId);
    }

    // --- settlement ---

    /// @param offset distinct player indices per call — a wallet may only ever
    /// hold one public marble, so reused addresses cannot mint a second.
    function _threePlayerRaceReadyToSettle(uint256 word, uint256 specialId, uint256 offset)
        internal
        returns (uint256 raceId, address[3] memory who, uint256[3] memory ids)
    {
        race.setPlayerBounds(3, 3);
        raceId = _openRace(specialId);
        for (uint256 i = 0; i < 3; i++) {
            (address p, uint256 id) = _player(offset + i);
            who[i] = p;
            ids[i] = id;
            vm.prank(p);
            race.join(raceId, id);
        }
        _drawWith(raceId, word);
    }

    function _threePlayerRaceReadyToSettle(uint256 word)
        internal
        returns (uint256 raceId, address[3] memory who, uint256[3] memory ids)
    {
        return _threePlayerRaceReadyToSettle(word, 1, 1);
    }

    function test_SettlePaysPodiumBurnsAndCreditsHostWithNoDust() public {
        (uint256 raceId, address[3] memory who,) = _threePlayerRaceReadyToSettle(12345);
        uint256 hostBefore = race.specialBalance(1);
        uint256 supplyBefore = token.totalSupply();
        uint256[3] memory before = [token.balanceOf(who[0]), token.balanceOf(who[1]), token.balanceOf(who[2])];

        race.settle(raceId);

        uint256[] memory order = race.getFinishOrder(raceId);
        assertEq(order.length, 3);

        // pot = 3 entries + the host's seed = 20e18
        uint256[3] memory expected = [uint256(10e18), 5e18, 2.5e18]; // 50% / 25% / 12.5%
        for (uint256 place = 0; place < 3; place++) {
            address winner = nft.ownerOf(order[place]);
            uint256 idx = winner == who[0] ? 0 : (winner == who[1] ? 1 : 2);
            assertEq(token.balanceOf(winner) - before[idx], expected[place], "podium payout");
        }
        assertEq(supplyBefore - token.totalSupply(), 2e18, "10% burned");
        assertEq(race.specialBalance(1) - hostBefore, 0.5e18, "2.5% back to the host special");
        // Nothing is stranded: with no race left open, everything the contract
        // holds is exactly the sum of the per-special earmarks.
        uint256 earmarked;
        for (uint256 id = 1; id <= 16; id++) {
            earmarked += race.specialBalance(id);
        }
        assertEq(token.balanceOf(address(race)), earmarked, "no unaccounted tokens");
    }

    function test_SettleFreesMarblesToRaceAgain() public {
        (uint256 raceId,, uint256[3] memory ids) = _threePlayerRaceReadyToSettle(999);
        race.settle(raceId);
        for (uint256 i = 0; i < 3; i++) {
            assertEq(race.activeRace(ids[i]), 0, "marble must be free after settlement");
        }
        // the winner immediately enters the next race with its winnings
        uint256 next = _openRace(2);
        address winner = nft.ownerOf(race.getFinishOrder(raceId)[0]);
        uint256 winnerId = race.getFinishOrder(raceId)[0];
        vm.prank(winner);
        race.join(next, winnerId);
        assertEq(race.activeRace(winnerId), next);
    }

    function test_RacesHostedIsTrackedPerSpecial() public {
        (uint256 raceId,,) = _threePlayerRaceReadyToSettle(7);
        race.settle(raceId);
        assertEq(race.racesHosted(1), 1);
        assertEq(race.racesHosted(2), 0, "another special hosted nothing");
    }

    function test_SettleRevertsBeforeRandomnessArrives() public {
        race.setPlayerBounds(3, 3);
        uint256 raceId = _openRace(1);
        for (uint256 i = 1; i <= 3; i++) {
            (address p, uint256 id) = _player(i);
            vm.prank(p);
            race.join(raceId, id);
        }
        vm.expectRevert(MarbleRace.RaceNotDrawn.selector);
        race.settle(raceId);
    }

    /// @dev Fuzzing the VRF word is the one property here worth fuzzing: whatever
    /// randomness arrives, the finish order must be a true permutation. XOR
    /// catches duplicates, which a naive match-count does not.
    function testFuzz_FinishOrderIsAPermutation(uint256 word) public {
        (uint256 raceId,, uint256[3] memory ids) = _threePlayerRaceReadyToSettle(word);
        race.settle(raceId);
        uint256[] memory order = race.getFinishOrder(raceId);
        assertEq(order.length, 3);
        assertEq(order[0] ^ order[1] ^ order[2], ids[0] ^ ids[1] ^ ids[2], "must be a permutation, no duplicates");
        assertTrue(order[0] != order[1] && order[1] != order[2] && order[0] != order[2], "all distinct");
    }

    /// Two races, different VRF words, disjoint entrant sets: both settle to a
    /// valid public-marble winner and each host is credited on its own special.
    function test_TwoConcurrentHostsSettleIndependently() public {
        (uint256 raceA,,) = _threePlayerRaceReadyToSettle(1, 1, 1);
        (uint256 raceB,,) = _threePlayerRaceReadyToSettle(2, 2, 10);
        race.settle(raceA);
        race.settle(raceB);

        assertGt(race.getFinishOrder(raceA)[0], 16, "winner must be a public marble");
        assertGt(race.getFinishOrder(raceB)[0], 16, "winner must be a public marble");
        assertEq(race.racesHosted(1), 1);
        assertEq(race.racesHosted(2), 1);
    }

    // --- cancel ---

    function test_CancelRefundsEntriesAndReturnsSeed() public {
        uint256 raceId = _openRace(1);
        uint256 hostAfterSeed = race.specialBalance(1);
        (address alice, uint256 id) = _player(1);
        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        race.join(raceId, id);

        vm.warp(block.timestamp + 2 days);
        race.cancel(raceId);

        assertEq(token.balanceOf(alice), aliceBefore, "entry refunded in full");
        assertEq(race.specialBalance(1), hostAfterSeed + ENTRY, "seed returned to the special");
        assertEq(race.activeRace(id), 0, "marble freed");
    }

    function test_CancelRevertsWhenEnoughPlayers() public {
        race.setPlayerBounds(3, 8);
        uint256 raceId = _openRace(1);
        for (uint256 i = 1; i <= 3; i++) {
            (address p, uint256 id) = _player(i);
            vm.prank(p);
            race.join(raceId, id);
        }
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(MarbleRace.EnoughPlayers.selector);
        race.cancel(raceId);
    }

    // --- start conditions ---

    function test_StartRevertsBeforeDeadlineWhenNotFull() public {
        uint256 raceId = _openRace(1);
        (address alice, uint256 id) = _player(1);
        vm.prank(alice);
        race.join(raceId, id);
        vm.expectRevert(MarbleRace.TooEarly.selector);
        race.startRace(raceId);
    }

    function test_StartRevertsAfterDeadlineWithTooFewPlayers() public {
        uint256 raceId = _openRace(1);
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(MarbleRace.NotEnoughPlayers.selector);
        race.startRace(raceId);
    }

    function test_StartWorksImmediatelyWhenFull() public {
        race.setPlayerBounds(3, 3);
        uint256 raceId = _openRace(1);
        for (uint256 i = 1; i <= 3; i++) {
            (address p, uint256 id) = _player(i);
            vm.prank(p);
            race.join(raceId, id);
        }
        uint256 requestId = race.startRace(raceId); // no deadline wait
        assertGt(requestId, 0);
        (,,, MarbleRace.Status status,,) = race.getRace(raceId);
        assertEq(uint8(status), uint8(MarbleRace.Status.Drawing));
    }

    function test_OnlyCoordinatorCanFulfill() public {
        race.setPlayerBounds(3, 3);
        uint256 raceId = _openRace(1);
        for (uint256 i = 1; i <= 3; i++) {
            (address p, uint256 id) = _player(i);
            vm.prank(p);
            race.join(raceId, id);
        }
        uint256 requestId = race.startRace(raceId);
        uint256[] memory words = new uint256[](1);
        words[0] = 42;
        vm.prank(address(0xBAD));
        vm.expectRevert();
        race.rawFulfillRandomWords(requestId, words);
    }

    function test_MinPlayersCannotDropBelowPodium() public {
        vm.expectRevert(MarbleRace.MinPlayersTooLow.selector);
        race.setPlayerBounds(2, 8);
    }

    /// Guards the panic path: with max < min a race could be drawn with fewer
    /// than three finishers, then `settle` reverts forever with no way out.
    function test_MaxPlayersCannotBeBelowMin() public {
        vm.expectRevert(MarbleRace.InvalidBounds.selector);
        race.setPlayerBounds(3, 2);
        vm.expectRevert(MarbleRace.InvalidBounds.selector);
        race.setPlayerBounds(3, 0);
    }

    function test_VrfConfigRejectsValuesTheCoordinatorWouldReject() public {
        bytes32 kh = keccak256("k");
        vm.expectRevert(MarbleRace.InvalidVrfConfig.selector);
        race.setVrfConfig(kh, 1, 200_000, 1); // Sepolia demands >= 3 confirmations
        vm.expectRevert(MarbleRace.InvalidVrfConfig.selector);
        race.setVrfConfig(bytes32(0), 1, 200_000, 3);
        vm.expectRevert(MarbleRace.InvalidVrfConfig.selector);
        race.setVrfConfig(kh, 0, 200_000, 3);
        vm.expectRevert(MarbleRace.InvalidVrfConfig.selector);
        race.setVrfConfig(kh, 1, 10_000, 3); // below the callback's real cost
        race.setVrfConfig(kh, 1, 200_000, 3); // valid
        assertEq(race.requestConfirmations(), 3);
    }

    // --- stalled VRF: the race must have an exit ---

    function _stalledRace() internal returns (uint256 raceId, address[3] memory who, uint256[3] memory ids) {
        race.setPlayerBounds(3, 3);
        raceId = _openRace(1);
        for (uint256 i = 0; i < 3; i++) {
            (address p, uint256 id) = _player(i + 1);
            who[i] = p;
            ids[i] = id;
            vm.prank(p);
            race.join(raceId, id);
        }
        race.startRace(raceId); // requested, never fulfilled
    }

    function test_StalledRaceCannotBeRescuedTooEarly() public {
        (uint256 raceId,,) = _stalledRace();
        vm.expectRevert(MarbleRace.TooEarly.selector);
        race.rescueStalled(raceId);
    }

    function test_StalledRaceRefundsEveryoneAfterDelay() public {
        (uint256 raceId, address[3] memory who, uint256[3] memory ids) = _stalledRace();
        uint256[3] memory before = [token.balanceOf(who[0]), token.balanceOf(who[1]), token.balanceOf(who[2])];
        uint256 hostBefore = race.specialBalance(1);

        vm.warp(block.timestamp + 1 days + race.RESCUE_DELAY() + 1);
        race.rescueStalled(raceId);

        for (uint256 i = 0; i < 3; i++) {
            assertEq(token.balanceOf(who[i]), before[i] + ENTRY, "entry refunded");
            assertEq(race.activeRace(ids[i]), 0, "marble freed to race again");
        }
        assertEq(race.specialBalance(1), hostBefore + ENTRY, "seed returned to the host special");
    }

    /// A late VRF callback must not resurrect a refunded race — otherwise
    /// `settle` would pay a pot that was already returned, spending funds
    /// committed to other races.
    function test_LateCallbackCannotResurrectARescuedRace() public {
        (uint256 raceId,,) = _stalledRace();
        vm.warp(block.timestamp + 1 days + race.RESCUE_DELAY() + 1);
        race.rescueStalled(raceId);

        uint256[] memory words = new uint256[](1);
        words[0] = 12345;
        // The coordinator still holds the request; fulfilling must be inert.
        coordinator.fulfillRandomWordsWithOverride(1, address(race), words);

        (,,, MarbleRace.Status status,,) = race.getRace(raceId);
        assertEq(uint8(status), uint8(MarbleRace.Status.Cancelled), "must stay cancelled");
        vm.expectRevert(MarbleRace.RaceNotDrawn.selector);
        race.settle(raceId);
    }

    function test_RescueRejectsRacesThatAreNotDrawing() public {
        uint256 raceId = _openRace(1);
        vm.expectRevert(MarbleRace.NotStalled.selector);
        race.rescueStalled(raceId);
    }

    // --- real-economy paths that `deal` would hide ---

    function test_JoinRevertsWithoutApproval() public {
        uint256 raceId = _openRace(1);
        address who = address(0xBEEF01);
        vm.prank(who);
        uint256 id = nft.mint();
        deal(address(token), who, ENTRY * 2, true);
        // no approve() — this is the flow that breaks on demo day
        vm.prank(who);
        vm.expectRevert();
        race.join(raceId, id);
    }

    function test_JoinRevertsWithInsufficientBalance() public {
        uint256 raceId = _openRace(1);
        address who = address(0xBEEF02);
        vm.prank(who);
        uint256 id = nft.mint();
        deal(address(token), who, ENTRY - 1, true);
        vm.prank(who);
        token.approve(address(race), type(uint256).max);
        vm.prank(who);
        vm.expectRevert();
        race.join(raceId, id);
    }

    /// A marble that just minted has earned nothing yet — it must wait for
    /// emissions before it can pay an entry.
    function test_FreshMarbleCannotAffordEntryUntilItAccrues() public {
        uint256 raceId = _openRace(1);
        address who = address(0xBEEF03);
        vm.prank(who);
        uint256 id = nft.mint();
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        vm.prank(who);
        token.claim(ids);
        assertEq(token.balanceOf(who), 0, "nothing accrued yet");

        vm.warp(block.timestamp + 12 hours); // 10 MRBL/day -> 5 MRBL == ENTRY
        vm.startPrank(who);
        token.claim(ids);
        token.approve(address(race), type(uint256).max);
        race.join(raceId, id);
        vm.stopPrank();
        assertEq(race.activeRace(id), raceId);
    }
}

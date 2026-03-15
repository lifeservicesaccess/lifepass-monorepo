// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../LifePassTrustRegistry.sol";

contract LifePassTrustRegistryTest is Test {
    LifePassTrustRegistry private registry;
    address private admin = address(0x1);
    address private updater = address(0x2);
    address private user = address(0x3);
    bytes32 private actionHash = keccak256("milestone-anchor");

    function setUp() public {
        vm.prank(admin);
        registry = new LifePassTrustRegistry(admin);
    }

    function testOnlyUpdaterCanSetScore() public {
        vm.prank(admin);
        registry.setScoreUpdater(updater, true);

        vm.prank(updater);
        registry.updateTrustScore(user, 72, "verified onboarding");

        LifePassTrustRegistry.TrustRecord memory rec = registry.getTrustScore(user);
        assertEq(rec.score, 72);
        assertEq(rec.reason, "verified onboarding");
    }

    function testRejectsUnauthorizedUpdates() public {
        vm.prank(user);
        vm.expectRevert("TrustRegistry: updater only");
        registry.updateTrustScore(user, 50, "attempt");
    }

    function testRejectsOutOfRangeScore() public {
        vm.prank(admin);
        vm.expectRevert("TrustRegistry: score must be <= 100");
        registry.updateTrustScore(user, 101, "invalid");
    }

    function testUpdaterCanAnchorAction() public {
        vm.prank(admin);
        registry.setScoreUpdater(updater, true);

        vm.prank(updater);
        registry.anchorAction(user, actionHash, "milestone_completed", "ipfs://milestone-1");

        LifePassTrustRegistry.ActionAnchor memory anchor = registry.getActionAnchor(actionHash);
        assertEq(anchor.holder, user);
        assertEq(anchor.actionHash, actionHash);
        assertEq(anchor.actionType, "milestone_completed");
        assertEq(anchor.metadataUri, "ipfs://milestone-1");
        assertEq(anchor.anchoredBy, updater);

        bytes32[] memory hashes = registry.getActionHashes(user);
        assertEq(hashes.length, 1);
        assertEq(hashes[0], actionHash);
    }

    function testRejectsDuplicateActionAnchor() public {
        vm.prank(admin);
        registry.setScoreUpdater(updater, true);

        vm.startPrank(updater);
        registry.anchorAction(user, actionHash, "milestone_completed", "ipfs://milestone-1");
        vm.expectRevert("TrustRegistry: action already anchored");
        registry.anchorAction(user, actionHash, "milestone_completed", "ipfs://milestone-1");
        vm.stopPrank();
    }

    function testRejectsUnauthorizedActionAnchor() public {
        vm.prank(user);
        vm.expectRevert("TrustRegistry: updater only");
        registry.anchorAction(user, actionHash, "milestone_completed", "ipfs://milestone-1");
    }
}

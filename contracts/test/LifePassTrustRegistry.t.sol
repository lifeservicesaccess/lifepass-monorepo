// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../LifePassTrustRegistry.sol";

contract LifePassTrustRegistryTest is Test {
    LifePassTrustRegistry private registry;
    address private admin = address(0x1);
    address private updater = address(0x2);
    address private user = address(0x3);

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
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../LifePassSBT.sol";

/// @title LifePassSBT Contract Tests
/// @notice Uses Foundry’s forge-std library to test minting, updating and soulbound behaviour of
/// the LifePassSBT contract.  These tests can be executed with `forge test` once Foundry is
/// installed and configured.
contract LifePassSBTTest is Test {
    LifePassSBT private sbt;
    address private admin = address(0x1);
    address private user  = address(0x2);
    uint256 private tokenId = 1;

    function setUp() public {
        sbt = new LifePassSBT();
        sbt.initialize(admin);
    }

    function testMintOnlyVerifier() public {
        // Attempt mint from non‑verifier should revert
        LifePassSBT.Metadata memory meta = LifePassSBT.Metadata({
            purpose: "Test",
            trustScore: 0,
            verificationLevel: "Silver",
            didUri: ""
        });
        vm.prank(user);
        vm.expectRevert();
        sbt.mint(user, tokenId, meta);
        // Grant VERIFIER_ROLE to user and mint
        vm.startPrank(admin);
        sbt.grantRole(sbt.VERIFIER_ROLE(), user);
        vm.stopPrank();
        vm.prank(user);
        sbt.mint(user, tokenId, meta);
        assertEq(sbt.ownerOf(tokenId), user);
    }

    function testSoulboundCannotTransfer() public {
        LifePassSBT.Metadata memory meta = LifePassSBT.Metadata({
            purpose: "Test",
            trustScore: 0,
            verificationLevel: "Silver",
            didUri: ""
        });
        // Grant VERIFIER_ROLE and mint to user
        vm.startPrank(admin);
        sbt.grantRole(sbt.VERIFIER_ROLE(), admin);
        sbt.mint(user, tokenId, meta);
        vm.stopPrank();
        // Attempt to transfer should revert
        vm.prank(user);
        vm.expectRevert("LifePassSBT: token is soulbound");
        sbt.transferFrom(user, address(0x3), tokenId);
    }
}
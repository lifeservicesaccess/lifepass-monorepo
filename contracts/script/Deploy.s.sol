// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {LifePassSBT} from "../src/LifePassSBT.sol";

/// @title LifePassSBT Deployment Script
/// @notice Deploys LifePassSBT behind a UUPS proxy to the configured network.
/// @dev Set the following environment variables before running:
///      DEPLOYER_ADDRESS  - 0x8644010A2B94441c1e4e524e8a3b20395d1A84b6
///      DEPLOYER_PRIVATE_KEY - private key corresponding to DEPLOYER_ADDRESS
///      AMOY_RPC_URL       - Polygon Amoy RPC endpoint
///      POLYGONSCAN_API_KEY - for contract verification (optional)
///
///      Run with:
///        forge script script/Deploy.s.sol --rpc-url amoy --broadcast --verify -vvvv
contract DeployLifePassSBT is Script {
    /// @dev Deployer / initial admin wallet.
    address public constant DEPLOYER_ADDRESS = 0x8644010A2B94441c1e4e524e8a3b20395d1A84b6;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        require(deployer == DEPLOYER_ADDRESS, "Deploy: signer mismatch with DEPLOYER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy the implementation contract.
        LifePassSBT implementation = new LifePassSBT();

        // 2. Encode the initializer call – grants all roles to the deployer.
        bytes memory initData = abi.encodeWithSelector(
            LifePassSBT.initialize.selector,
            DEPLOYER_ADDRESS
        );

        // 3. Deploy a UUPS proxy pointing at the implementation.
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);

        vm.stopBroadcast();

        console2.log("LifePassSBT implementation :", address(implementation));
        console2.log("LifePassSBT proxy          :", address(proxy));
        console2.log("Admin / deployer           :", DEPLOYER_ADDRESS);
    }
}

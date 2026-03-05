# Smart Contract Documentation

This guide explains the LifePassSBT smart contract, its functions, roles and deployment process.

## Overview

`LifePassSBT` is an upgradeable ERC721 soulbound token contract.  Each token is bound to a user and cannot be transferred to another address.  The contract supports pausing, role‑based access control, upgradeability via the UUPS pattern and storage of arbitrary metadata.

## Roles

| Role      | Description                                              |
|-----------|----------------------------------------------------------|
| `ADMIN`   | Can grant and revoke roles, upgrade the contract and revoke tokens. |
| `VERIFIER`| Authorised to mint new tokens and update metadata.       |
| `MINTER`  | Reserved for future use if minting rights are separated from verification. |
| `PAUSER`  | Can pause and unpause the contract.                      |

## Key Functions

- `initialize(address admin)`: Initialises the proxy and grants all roles to the admin.
- `mint(address to, uint256 tokenId, Metadata meta)`: Mints a new token to `to`.  Only a verifier may call this.
- `update(uint256 tokenId, Metadata meta)`: Updates metadata for an existing token.  Callable by the owner or a verifier.
- `revoke(uint256 tokenId)`: Burns the token and deletes its metadata.  Only an admin may call.
- `getMetadata(uint256 tokenId)`: Returns the `Metadata` struct for the token.
- `pause()` / `unpause()`: Pauses or unpauses contract functions.
- `_authorizeUpgrade(address newImplementation)`: Internal hook used by UUPS to authorise upgrades; restricted to admin.

## Upgradeability

The contract uses OpenZeppelin’s UUPSUpgradeable mechanism.  To upgrade:
1. Deploy a new implementation contract.
2. From an account with the `ADMIN` role, call `upgradeTo(newImplementationAddress)` on the proxy contract.
3. Verify that storage layout is compatible and that the new contract has initialiser protection.

## Deployment

Deploy the `LifePassSBT` contract using OpenZeppelin’s proxy tools or Foundry’s `forge create --deploy-with-proxy`.  Pass your admin address to the `initialize` function after deployment.  Ensure that the proxy admin has sufficient privileges to manage roles and upgrades.
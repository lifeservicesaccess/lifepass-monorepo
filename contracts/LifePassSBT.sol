// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {ERC721BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title LifePass Soulbound Token (Upgradeable)
/// @notice Implements a non‑transferable ERC721 token (SBT) with role‑based access control,
/// pause functionality, upgradeability (UUPS), and metadata storage.  Tokens cannot be
/// transferred once minted (soulbound), but they can be revoked by an administrator.  The
/// contract is upgradeable via UUPS and uses the OpenZeppelin upgradeable libraries.
contract LifePassSBT is Initializable, ERC721Upgradeable, ERC721BurnableUpgradeable, AccessControlUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    /// @dev Role identifiers computed via keccak256.  External systems must use the same values.
    bytes32 public constant ADMIN_ROLE    = keccak256("ADMIN_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant MINTER_ROLE   = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");

    /// @dev Metadata stored per token.  `trustScore` is a 0‑255 value representing confidence,
    /// `verificationLevel` may be "Silver", "Gold", etc., and `didUri` points to a DID document.
    struct Metadata {
        string purpose;
        uint8 trustScore;
        string verificationLevel;
        string didUri;
    }

    /// @dev Mapping from token ID to its metadata.
    mapping(uint256 => Metadata) private _tokenMetadata;

    /// @notice Emitted when a token is minted.
    event Minted(address indexed to, uint256 indexed tokenId);
    /// @notice Emitted when a token is revoked (burned).
    event Revoked(uint256 indexed tokenId);
    /// @notice Emitted when metadata for a token is updated.
    event Updated(uint256 indexed tokenId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    // This repo deploys the contract directly and then calls initialize(admin).
    // Keep constructor empty so initialize can be called exactly once post-deploy.
    constructor() {}

    /// @notice Contract initializer.  Must be called exactly once after deployment.
    /// @param admin The initial admin who will receive all roles.
    function initialize(address admin) public initializer {
        __ERC721_init("LifePassSBT", "LPSBT");
        __ERC721Burnable_init();
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        // Grant all roles to the admin.  They can subsequently grant/revoke as needed.
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /// @notice Mint a new soulbound token to `to` with a given `tokenId` and metadata.  Only
    /// addresses with the `VERIFIER_ROLE` may mint.  Tokens are non‑transferable once minted.
    /// @param to The recipient of the token.
    /// @param tokenId The unique identifier for the new token.
    /// @param meta The metadata associated with the token.
    function mint(address to, uint256 tokenId, Metadata calldata meta) external whenNotPaused onlyRole(VERIFIER_ROLE) {
        require(!_exists(tokenId), "LifePassSBT: token already exists");
        _safeMint(to, tokenId);
        _tokenMetadata[tokenId] = meta;
        emit Minted(to, tokenId);
    }

    /// @notice Update the metadata of an existing token.  The owner of the token or a verifier
    /// may perform this action.  Emits `Updated` on success.
    /// @param tokenId The token to update.
    /// @param meta The new metadata.
    function update(uint256 tokenId, Metadata calldata meta) external whenNotPaused {
        require(_exists(tokenId), "LifePassSBT: nonexistent token");
        address owner = ownerOf(tokenId);
        require(msg.sender == owner || hasRole(VERIFIER_ROLE, msg.sender), "LifePassSBT: no permission");
        _tokenMetadata[tokenId] = meta;
        emit Updated(tokenId);
    }

    /// @notice Revoke (burn) a token permanently.  Only an address with the `ADMIN_ROLE` may
    /// revoke tokens.  Once revoked, metadata is deleted and cannot be recovered.  Emits
    /// `Revoked` on success.
    /// @param tokenId The token to revoke.
    function revoke(uint256 tokenId) external whenNotPaused onlyRole(ADMIN_ROLE) {
        _burn(tokenId);
        delete _tokenMetadata[tokenId];
        emit Revoked(tokenId);
    }

    /// @notice Retrieve the metadata associated with a token.  Reverts if the token does not exist.
    /// @param tokenId The token ID to query.
    function getMetadata(uint256 tokenId) external view returns (Metadata memory) {
        require(_exists(tokenId), "LifePassSBT: nonexistent token");
        return _tokenMetadata[tokenId];
    }

    /// @dev Prevent transfers after minting.  Only allow minting (from=0) and burning (to=0).
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize) internal override(ERC721Upgradeable) {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        if (from != address(0) && to != address(0)) {
            revert("LifePassSBT: token is soulbound");
        }
    }

    /// @notice Pause the contract.  Only addresses with the `PAUSER_ROLE` may pause.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause the contract.  Only addresses with the `PAUSER_ROLE` may unpause.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @dev See {IERC165-supportsInterface}.  Required for AccessControl and ERC721 to coexist.
    function supportsInterface(bytes4 interfaceId) public view override(ERC721Upgradeable, AccessControlUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Authorize contract upgrades.  Only addresses with the `ADMIN_ROLE` may upgrade.
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(ADMIN_ROLE) {}
}
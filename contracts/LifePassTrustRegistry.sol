// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title LifePass Trust Registry
/// @notice Companion contract for storing/updating trust score by holder address.
contract LifePassTrustRegistry {
    address public owner;
    mapping(address => bool) public scoreUpdaters;

    struct TrustRecord {
        uint16 score;
        uint64 updatedAt;
        string reason;
    }

    struct ActionAnchor {
        address holder;
        bytes32 actionHash;
        uint64 anchoredAt;
        string actionType;
        string metadataUri;
        address anchoredBy;
    }

    mapping(address => TrustRecord) private _trust;
    mapping(bytes32 => ActionAnchor) private _anchors;
    mapping(address => bytes32[]) private _holderAnchors;

    event TrustScoreUpdated(address indexed holder, uint16 score, string reason, uint64 updatedAt);
    event ScoreUpdaterSet(address indexed updater, bool enabled);
    event ActionAnchored(
        address indexed holder,
        bytes32 indexed actionHash,
        string actionType,
        string metadataUri,
        uint64 anchoredAt,
        address anchoredBy
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "TrustRegistry: owner only");
        _;
    }

    modifier onlyScoreUpdater() {
        require(scoreUpdaters[msg.sender], "TrustRegistry: updater only");
        _;
    }

    constructor(address admin) {
        require(admin != address(0), "TrustRegistry: admin is zero address");
        owner = admin;
        scoreUpdaters[admin] = true;
    }

    function setScoreUpdater(address updater, bool enabled) external onlyOwner {
        require(updater != address(0), "TrustRegistry: updater is zero address");
        scoreUpdaters[updater] = enabled;
        emit ScoreUpdaterSet(updater, enabled);
    }

    function updateTrustScore(address holder, uint16 score, string calldata reason) external onlyScoreUpdater {
        require(holder != address(0), "TrustRegistry: holder is zero address");
        require(score <= 100, "TrustRegistry: score must be <= 100");

        uint64 nowTs = uint64(block.timestamp);
        _trust[holder] = TrustRecord({ score: score, updatedAt: nowTs, reason: reason });
        emit TrustScoreUpdated(holder, score, reason, nowTs);
    }

    function anchorAction(
        address holder,
        bytes32 actionHash,
        string calldata actionType,
        string calldata metadataUri
    ) external onlyScoreUpdater {
        require(holder != address(0), "TrustRegistry: holder is zero address");
        require(actionHash != bytes32(0), "TrustRegistry: action hash is zero");
        require(bytes(actionType).length > 0, "TrustRegistry: action type is required");
        require(_anchors[actionHash].anchoredAt == 0, "TrustRegistry: action already anchored");

        uint64 nowTs = uint64(block.timestamp);
        _anchors[actionHash] = ActionAnchor({
            holder: holder,
            actionHash: actionHash,
            anchoredAt: nowTs,
            actionType: actionType,
            metadataUri: metadataUri,
            anchoredBy: msg.sender
        });
        _holderAnchors[holder].push(actionHash);

        emit ActionAnchored(holder, actionHash, actionType, metadataUri, nowTs, msg.sender);
    }

    function getTrustScore(address holder) external view returns (TrustRecord memory) {
        return _trust[holder];
    }

    function getActionAnchor(bytes32 actionHash) external view returns (ActionAnchor memory) {
        return _anchors[actionHash];
    }

    function getActionHashes(address holder) external view returns (bytes32[] memory) {
        return _holderAnchors[holder];
    }
}

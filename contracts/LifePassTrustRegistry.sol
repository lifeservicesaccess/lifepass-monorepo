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

    mapping(address => TrustRecord) private _trust;

    event TrustScoreUpdated(address indexed holder, uint16 score, string reason, uint64 updatedAt);
    event ScoreUpdaterSet(address indexed updater, bool enabled);

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

    function getTrustScore(address holder) external view returns (TrustRecord memory) {
        return _trust[holder];
    }
}

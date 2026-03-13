const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TRUST_FILE = path.join(DATA_DIR, 'trust-scores.json');

async function readTrustScores() {
  try {
    const raw = await fs.readFile(TRUST_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

async function writeTrustScores(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TRUST_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function getTrustScore(userId) {
  const all = await readTrustScores();
  return all[userId] || {
    userId,
    score: 0,
    level: 'Bronze',
    reason: 'default',
    reasonCodes: ['default'],
    policyVersion: 'v1',
    updatedAt: null
  };
}

function inferLevel(score) {
  if (score >= 80) return 'Gold';
  if (score >= 50) return 'Silver';
  return 'Bronze';
}

function evaluateTrustPolicy(input = {}) {
  const verificationStatus = String(input.verificationStatus || 'pending');
  const verifierSubmissionsCount = Math.max(0, Number(input.verifierSubmissionsCount) || 0);
  const hasMinted = Boolean(input.hasMinted);
  const minBronzeScore = Math.max(0, Math.min(49, Number(input.minBronzeScore) || 20));

  let score = minBronzeScore;
  const reasonCodes = [];

  if (verificationStatus === 'approved') {
    score = Math.max(score, 60);
    reasonCodes.push('verification_approved');
  } else if (verificationStatus === 'rejected') {
    score = Math.min(score, 25);
    reasonCodes.push('verification_rejected');
  } else {
    reasonCodes.push('verification_pending');
  }

  if (verifierSubmissionsCount > 0) {
    const verifierBoost = Math.min(verifierSubmissionsCount, 3) * 5;
    score += verifierBoost;
    reasonCodes.push(`verifier_sources_${Math.min(verifierSubmissionsCount, 3)}`);
  }

  if (hasMinted) {
    score += 10;
    reasonCodes.push('mint_submitted');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    level: inferLevel(score),
    reasonCodes,
    policyVersion: 'v1'
  };
}

async function updateTrustScore(userId, score, reason = 'manual', meta = {}) {
  const normalized = Math.max(0, Math.min(100, Number(score) || 0));
  const all = await readTrustScores();
  const next = {
    userId,
    score: normalized,
    level: inferLevel(normalized),
    reason,
    reasonCodes: Array.isArray(meta.reasonCodes) ? meta.reasonCodes : [reason],
    policyVersion: meta.policyVersion || 'v1',
    updatedAt: new Date().toISOString()
  };
  all[userId] = next;
  await writeTrustScores(all);
  return next;
}

async function applyTrustPolicy(userId, policyInput = {}, reason = 'policy-evaluation') {
  const policy = evaluateTrustPolicy(policyInput);
  return updateTrustScore(userId, policy.score, reason, {
    reasonCodes: policy.reasonCodes,
    policyVersion: policy.policyVersion
  });
}

module.exports = {
  getTrustScore,
  updateTrustScore,
  applyTrustPolicy,
  evaluateTrustPolicy,
  inferLevel
};

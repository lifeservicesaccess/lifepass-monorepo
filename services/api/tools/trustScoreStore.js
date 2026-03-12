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
    updatedAt: null
  };
}

function inferLevel(score) {
  if (score >= 80) return 'Gold';
  if (score >= 50) return 'Silver';
  return 'Bronze';
}

async function updateTrustScore(userId, score, reason = 'manual') {
  const normalized = Math.max(0, Math.min(100, Number(score) || 0));
  const all = await readTrustScores();
  const next = {
    userId,
    score: normalized,
    level: inferLevel(normalized),
    reason,
    updatedAt: new Date().toISOString()
  };
  all[userId] = next;
  await writeTrustScores(all);
  return next;
}

module.exports = {
  getTrustScore,
  updateTrustScore,
  inferLevel
};

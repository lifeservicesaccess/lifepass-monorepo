const fs = require('fs').promises;
const path = require('path');

const pgPool = require('./pgPool');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TRUST_FILE = path.join(DATA_DIR, 'trust-scores.json');
const TRUST_EVENTS_FILE = path.join(DATA_DIR, 'trust-events.json');

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

async function readTrustEvents() {
  try {
    const raw = await fs.readFile(TRUST_EVENTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_err) {
    return [];
  }
}

async function writeTrustEvents(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TRUST_EVENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function getTrustScore(userId) {
  const all = await readTrustScores();
  return all[userId] || {
    userId,
    score: 0,
    level: 'Bronze',
    reason: 'default',
    reasonCodes: ['default'],
    policyVersion: 'v2',
    updatedAt: null
  };
}

function inferLevel(score) {
  if (score >= 80) return 'Gold';
  if (score >= 50) return 'Silver';
  return 'Bronze';
}

function inferVerificationStatusFromSignals(input = {}) {
  const explicit = String(input.verificationStatus || '').trim().toLowerCase();
  if (explicit === 'approved' || explicit === 'pending' || explicit === 'rejected') {
    return explicit;
  }

  const rejectedDocumentChecks = Math.max(0, Number(input.rejectedDocumentChecks) || 0);
  const approvedDocumentChecks = Math.max(0, Number(input.documentChecksCount) || 0);
  const approvedEndorsements = Math.max(0, Number(input.endorsementsCount) || Number(input.verifierSubmissionsCount) || 0);

  if (rejectedDocumentChecks > 0) return 'rejected';
  if (approvedDocumentChecks >= 1 && approvedEndorsements >= 2) return 'approved';
  return 'pending';
}

function evaluateTrustPolicy(input = {}) {
  const verificationStatus = inferVerificationStatusFromSignals(input);
  const endorsementsCount = Math.max(0, Number(input.endorsementsCount) || Number(input.verifierSubmissionsCount) || 0);
  const documentChecksCount = Math.max(0, Number(input.documentChecksCount) || 0);
  const mutualVerificationsCount = Math.max(0, Number(input.mutualVerificationsCount) || 0);
  const rejectedDocumentChecks = Math.max(0, Number(input.rejectedDocumentChecks) || 0);
  const hasMinted = Boolean(input.hasMinted);
  const minBronzeScore = Math.max(0, Math.min(49, Number(input.minBronzeScore) || 25));

  let score = minBronzeScore;
  const reasonCodes = [];

  if (verificationStatus === 'approved') {
    score = Math.max(score, 55);
    reasonCodes.push('verification_approved');
  } else if (verificationStatus === 'rejected') {
    score = Math.min(score, 25);
    reasonCodes.push('verification_rejected');
  } else {
    reasonCodes.push('verification_pending');
  }

  if (endorsementsCount > 0) {
    const endorsementBoost = Math.min(endorsementsCount, 5) * 4;
    score += endorsementBoost;
    reasonCodes.push(`endorsements_${Math.min(endorsementsCount, 5)}`);
  }

  if (documentChecksCount > 0) {
    const docsBoost = Math.min(documentChecksCount, 3) * 8;
    score += docsBoost;
    reasonCodes.push(`document_checks_${Math.min(documentChecksCount, 3)}`);
  }

  if (mutualVerificationsCount > 0) {
    const mutualBoost = Math.min(mutualVerificationsCount, 3) * 6;
    score += mutualBoost;
    reasonCodes.push(`mutual_verifications_${Math.min(mutualVerificationsCount, 3)}`);
  }

  if (rejectedDocumentChecks > 0) {
    score = Math.min(score, 25);
    reasonCodes.push('document_rejection_present');
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

async function appendTrustEvent(event) {
  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO trust_events
          (event_id, user_id, from_score, to_score, from_level, to_level, reason, reason_codes, policy_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
        [
          event.eventId,
          event.userId,
          event.fromScore,
          event.toScore,
          event.fromLevel,
          event.toLevel,
          event.reason,
          JSON.stringify(event.reasonCodes || []),
          event.policyVersion || 'v2'
        ]
      );
      return;
    } catch (e) {
      console.warn('Trust event insert failed; falling back to file DB:', e.message || e);
    }
  }

  const allEvents = await readTrustEvents();
  allEvents.push(event);
  await writeTrustEvents(allEvents);
}

async function updateTrustScore(userId, score, reason = 'manual', meta = {}) {
  const normalized = Math.max(0, Math.min(100, Number(score) || 0));
  const previous = await getTrustScore(userId);
  const all = await readTrustScores();
  const next = {
    userId,
    score: normalized,
    level: inferLevel(normalized),
    reason,
    reasonCodes: Array.isArray(meta.reasonCodes) ? meta.reasonCodes : [reason],
    policyVersion: meta.policyVersion || 'v2',
    updatedAt: new Date().toISOString()
  };
  all[userId] = next;
  await writeTrustScores(all);

  await appendTrustEvent({
    eventId: `${Date.now()}-${userId}-${Math.floor(Math.random() * 100000)}`,
    userId,
    fromScore: previous && typeof previous.score === 'number' ? previous.score : null,
    toScore: next.score,
    fromLevel: previous ? previous.level || null : null,
    toLevel: next.level,
    reason,
    reasonCodes: next.reasonCodes,
    policyVersion: next.policyVersion,
    createdAt: next.updatedAt
  });

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
  inferLevel,
  inferVerificationStatusFromSignals
};

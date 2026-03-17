const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const onchainVerifier = require('./tools/onchainVerifier');
const profileDb = require('./tools/profileDb');
const zkProof = require('./tools/zkProof');
const walletTool = require('./tools/wallet');
const trustScoreStore = require('./tools/trustScoreStore');
const verificationStore = require('./tools/verificationStore');
const storageTool = require('./tools/storage');
const profileMediaStore = require('./tools/profileMediaStore');
const ssoAuth = require('./tools/ssoAuth');
const passQr = require('./tools/passQr');
const { readPolicyMatrix } = require('./portals/policyMatrix');
const portalAccessAuditStore = require('./tools/portalAccessAuditStore');
const portalPolicyStore = require('./tools/portalPolicyStore');
const policyAdminAuditStore = require('./tools/policyAdminAuditStore');
const policySnapshotStore = require('./tools/policySnapshotStore');
const policyApprovalStore = require('./tools/policyApprovalStore');
const vectorStore = require('./tools/vectorStore');
const chatGuide = require('./tools/chatGuide');
const milestoneStore = require('./tools/milestoneStore');
const { createPortalRouter } = require('./portals/router');
const { loadApiEnv } = require('./tools/loadEnv');
const pgPool = require('./tools/pgPool');
const { isDurableGovernanceRequired } = require('./tools/governanceMode');

loadApiEnv();

/**
 * Simple REST API for interacting with the LifePass smart contract and zk‑proof verifier.  This
 * server exposes endpoints to submit an age proof and to mint an SBT.  In a production
 * deployment the RPC URL, private key, and contract addresses should be stored in a secure
 * secret manager rather than environment variables.
 */
const app = express();

// Security headers
app.use(helmet());

// Access logging
app.use(morgan('combined'));

// Body size limit (100 kb) — guards against payload amplification
app.use(express.json({ limit: '100kb' }));

// Rate limiters
const publicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' }
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' }
});

const { body, validationResult } = require('express-validator');

// Load environment variables
const RPC_URL = process.env.RPC_URL || "https://rpc-mumbai.maticvigil.com"; // default to Polygon Mumbai
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SBT_CONTRACT_ADDRESS = process.env.SBT_CONTRACT_ADDRESS;
const TRUST_REGISTRY_ADDRESS = process.env.TRUST_REGISTRY_ADDRESS;
const AGE_VERIFIER_ADDRESS = process.env.AGE_VERIFIER_ADDRESS;
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const CORS_ALLOW_ALL = CORS_ALLOWED_ORIGINS.includes('*');
const CORS_ALLOW_CREDENTIALS = process.env.CORS_ALLOW_CREDENTIALS === '1';
const TRUST_SCORE_DEFAULT = Number(process.env.TRUST_SCORE_DEFAULT || 35);
const ONBOARDING_BRONZE_SCORE = Math.max(0, Math.min(49, TRUST_SCORE_DEFAULT));

// ABI for the LifePassSBT contract.  In practice, generate this with `solc` or Foundry and import
// the JSON.  Here we define a minimal ABI for minting and updating.
const LIFE_PASS_ABI = [
  "function mint(address to, uint256 tokenId, tuple(string purpose,uint8 trustScore,string verificationLevel,string didUri) meta) external",
  "function getMetadata(uint256 tokenId) external view returns (tuple(string purpose,uint8 trustScore,string verificationLevel,string didUri) meta)"
];

// Initialize provider and signer
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;
const sbtContract = SBT_CONTRACT_ADDRESS && wallet
  ? new ethers.Contract(SBT_CONTRACT_ADDRESS, LIFE_PASS_ABI, wallet)
  : null;
const flowMintLocks = new Set();
const PORTAL_POLICY_ROUTE_MAP = {
  commons: { me: 'GET /portals/commons/me' },
  agri: {
    createRequest: 'POST /portals/agri/requests',
    listRequests: 'GET /portals/agri/requests'
  },
  health: { ageGatedServices: 'GET /portals/health/age-gated-services' }
};

function isValidPrivateKey(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function startupChecklist() {
  const isProd = process.env.NODE_ENV === 'production';
  const hasRpc = Boolean(RPC_URL);
  const hasPk = Boolean(PRIVATE_KEY);
  const hasSbtAddress = Boolean(SBT_CONTRACT_ADDRESS);
  const hasTrustRegistryAddress = Boolean(TRUST_REGISTRY_ADDRESS);
  const requireAgeVerifier = process.env.REQUIRE_AGE_VERIFIER === '1' || isProd;
  const useSnarkJs = process.env.USE_SNARKJS === '1';
  const policyPreconditions = getPolicyExecutionPreconditions();
  const policyAdminAccess = getPolicyAdminAccessPreconditions();
  const blockchainReady = hasRpc && hasPk && hasSbtAddress;
  const anchorReady = hasRpc && hasPk && hasTrustRegistryAddress;
  const hasCorsAllowlist = CORS_ALLOW_ALL || CORS_ALLOWED_ORIGINS.length > 0;

  const items = [
    {
      check: 'NODE_ENV',
      status: process.env.NODE_ENV ? 'pass' : 'warn',
      detail: process.env.NODE_ENV || 'not set'
    },
    {
      check: 'CORS_ALLOWED_ORIGINS configured',
      status: hasCorsAllowlist ? 'pass' : (isProd ? 'fail' : 'warn'),
      detail: hasCorsAllowlist
        ? (CORS_ALLOW_ALL ? 'allow all (*)' : `${CORS_ALLOWED_ORIGINS.length} origin(s) configured`)
        : 'not set; browser cross-origin requests will be blocked'
    },
    {
      check: 'API_KEY set',
      status: process.env.API_KEY ? 'pass' : (isProd ? 'fail' : 'warn'),
      detail: process.env.API_KEY ? 'protected endpoints require x-api-key' : 'not set; protected endpoints are open'
    },
    {
      check: 'USE_SNARKJS in production',
      status: useSnarkJs ? 'pass' : 'warn',
      detail: useSnarkJs ? 'enabled' : 'not set; ZK proof generation uses fallback — set USE_SNARKJS=1 for on-chain circuits'
    },
    {
      check: 'PRIVATE_KEY format',
      status: hasPk ? (isValidPrivateKey(PRIVATE_KEY) ? 'pass' : 'fail') : 'warn',
      detail: hasPk ? (isValidPrivateKey(PRIVATE_KEY) ? 'valid hex key format' : 'expected 0x-prefixed 64-byte hex key') : 'not set'
    },
    {
      check: 'SBT_CONTRACT_ADDRESS format',
      status: hasSbtAddress ? (ethers.isAddress(SBT_CONTRACT_ADDRESS) ? 'pass' : 'fail') : 'warn',
      detail: hasSbtAddress ? (ethers.isAddress(SBT_CONTRACT_ADDRESS) ? 'valid address format' : 'invalid address format') : 'not set'
    },
    {
      check: 'On-chain mint mode',
      status: blockchainReady ? 'pass' : 'warn',
      detail: blockchainReady ? 'RPC_URL + PRIVATE_KEY + SBT_CONTRACT_ADDRESS set' : 'incomplete config; /sbt/mint will simulate'
    },
    {
      check: 'TRUST_REGISTRY_ADDRESS format',
      status: hasTrustRegistryAddress ? (ethers.isAddress(TRUST_REGISTRY_ADDRESS) ? 'pass' : 'fail') : 'warn',
      detail: hasTrustRegistryAddress ? (ethers.isAddress(TRUST_REGISTRY_ADDRESS) ? 'valid address format' : 'invalid address format') : 'not set'
    },
    {
      check: 'On-chain action anchoring mode',
      status: anchorReady ? 'pass' : 'warn',
      detail: anchorReady ? 'RPC_URL + PRIVATE_KEY + TRUST_REGISTRY_ADDRESS set' : 'incomplete config; milestone anchors will simulate'
    },
    {
      check: 'AGE_VERIFIER_ADDRESS format',
      status: AGE_VERIFIER_ADDRESS
        ? (ethers.isAddress(AGE_VERIFIER_ADDRESS) ? 'pass' : 'fail')
        : (requireAgeVerifier ? 'fail' : 'warn'),
      detail: AGE_VERIFIER_ADDRESS
        ? (ethers.isAddress(AGE_VERIFIER_ADDRESS) ? 'valid address format' : 'invalid address format')
        : (requireAgeVerifier
            ? 'required when REQUIRE_AGE_VERIFIER=1'
            : 'optional; not set')
    },
    {
      check: 'LIFEPASS_SSO_JWT_SECRET configured',
      status: ssoAuth.getSsoConfig().configured ? 'pass' : 'warn',
      detail: ssoAuth.getSsoConfig().configured ? 'SSO token endpoints enabled' : 'not set; /auth/sso/token and /auth/sso/verify return 503'
    },
    {
      check: 'Policy admin auth mode',
      status: policyAdminAccess.configured ? 'pass' : 'fail',
      detail: policyAdminAccess.detail
    },
    {
      check: 'Durable governance storage',
      status: isDurableGovernanceRequired()
        ? (pgPool ? 'pass' : 'fail')
        : (pgPool ? 'pass' : 'warn'),
      detail: isDurableGovernanceRequired()
        ? (pgPool
            ? 'REQUIRE_DURABLE_GOVERNANCE=1 and Postgres is configured for audit/admin persistence'
            : 'REQUIRE_DURABLE_GOVERNANCE=1 but DATABASE_URL / PG_CONNECTION_STRING is not configured')
        : (pgPool
            ? 'Postgres configured for audit/admin persistence'
            : 'file fallback remains enabled for audit/admin stores')
    },
    {
      check: 'POLICY_TWO_PERSON_REQUIRED readiness',
      status: policyPreconditions.twoPerson
        ? (policyPreconditions.approverCount >= policyPreconditions.requiredApprovals ? 'pass' : 'fail')
        : 'warn',
      detail: policyPreconditions.twoPerson
        ? `enabled; ${policyPreconditions.approverCount} approver key(s) configured (required ${policyPreconditions.requiredApprovals})`
        : 'disabled; direct policy apply/restore allowed for policy admin key'
    }
  ];

  const hasFail = items.some((item) => item.status === 'fail');
  return { items, hasFail, isProd };
}

function printStartupChecklist(report) {
  console.log('Startup Checklist');
  for (const item of report.items) {
    console.log(`[${item.status.toUpperCase()}] ${item.check}: ${item.detail}`);
  }
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function deriveProfileVerificationStatus(summary) {
  if (summary.rejectedDocumentChecks > 0) return 'rejected';
  if (summary.approvedDocumentChecks >= 1 && summary.approvedEndorsements >= 2) return 'approved';
  return 'pending';
}

async function recomputeTrustFromProfile(userId, profile) {
  const summary = await verificationStore.getVerificationSummary(userId);
  const verificationStatus = deriveProfileVerificationStatus(summary);

  const trust = await trustScoreStore.applyTrustPolicy(
    userId,
    {
      verificationStatus,
      endorsementsCount: summary.approvedEndorsements,
      documentChecksCount: summary.approvedDocumentChecks,
      mutualVerificationsCount: summary.approvedMutualVerifications,
      rejectedDocumentChecks: summary.rejectedDocumentChecks,
      verifierSubmissionsCount: Array.isArray(profile.verifierSubmissions) ? profile.verifierSubmissions.length : 0,
      hasMinted: Boolean(profile.mintedTxHash),
      minBronzeScore: ONBOARDING_BRONZE_SCORE
    },
    'verification-recompute-policy'
  );

  const updatedProfile = await profileDb.patchProfile(userId, {
    verificationStatus,
    verificationSummary: {
      endorsementsApproved: summary.approvedEndorsements,
      documentChecksApproved: summary.approvedDocumentChecks,
      mutualVerificationsApproved: summary.approvedMutualVerifications,
      documentChecksRejected: summary.rejectedDocumentChecks,
      graphEdgesCount: summary.graphEdgesCount
    },
    trustScore: trust.score,
    trustLevel: trust.level
  });

  return {
    trust,
    verificationStatus,
    summary,
    profile: updatedProfile
  };
}

function parseEvmError(err) {
  if (!err) return 'Unknown blockchain error';
  if (err.shortMessage) return err.shortMessage;
  if (err.reason) return err.reason;
  if (err.info && err.info.error && err.info.error.message) return err.info.error.message;
  if (err.error && err.error.message) return err.error.message;
  if (err.message) return err.message;
  return String(err);
}

function toCsvValue(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toAccessAuditCsv(events) {
  const headers = [
    'at',
    'method',
    'path',
    'covenant',
    'policyKey',
    'decision',
    'status',
    'requiredTrustLevel',
    'actualTrustLevel',
    'userId',
    'reason',
    'trustScore'
  ];

  const rows = events.map((evt) => headers.map((key) => toCsvValue(evt[key])));
  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function buildPolicyDiff(beforeMatrix, afterMatrix) {
  const covenants = new Set([
    ...Object.keys(beforeMatrix || {}),
    ...Object.keys(afterMatrix || {})
  ]);

  const changes = [];
  for (const covenant of covenants) {
    const beforePolicies = beforeMatrix[covenant] || {};
    const afterPolicies = afterMatrix[covenant] || {};
    const policyKeys = new Set([...Object.keys(beforePolicies), ...Object.keys(afterPolicies)]);

    for (const policyKey of policyKeys) {
      const before = beforePolicies[policyKey] || {};
      const after = afterPolicies[policyKey] || {};
      const beforeMin = before.minTrustLevel || null;
      const afterMin = after.minTrustLevel || null;
      const beforeAudience = before.audience || null;
      const afterAudience = after.audience || null;

      if (beforeMin !== afterMin || beforeAudience !== afterAudience) {
        changes.push({
          covenant,
          policyKey,
          route: (PORTAL_POLICY_ROUTE_MAP[covenant] || {})[policyKey] || null,
          before: {
            minTrustLevel: beforeMin,
            audience: beforeAudience
          },
          after: {
            minTrustLevel: afterMin,
            audience: afterAudience
          }
        });
      }
    }
  }

  return changes;
}

function summarizeDenyAlerts(events, threshold, windowMinutes) {
  const now = Date.now();
  const windowMs = Math.max(1, windowMinutes) * 60 * 1000;
  const grouped = new Map();

  for (const evt of events || []) {
    if (String(evt.decision || '').toLowerCase() !== 'deny') continue;
    const at = evt.at instanceof Date ? evt.at.getTime() : Date.parse(evt.at || '');
    if (!Number.isFinite(at) || now - at > windowMs) continue;

    const covenant = String(evt.covenant || 'unknown').toLowerCase();
    const current = grouped.get(covenant) || { count: 0, reasons: {} };
    current.count += 1;
    const reason = String(evt.reason || 'unknown');
    current.reasons[reason] = (current.reasons[reason] || 0) + 1;
    grouped.set(covenant, current);
  }

  const alerts = [];
  for (const [covenant, data] of grouped.entries()) {
    if (data.count >= threshold) {
      alerts.push({
        covenant,
        denyCount: data.count,
        threshold,
        windowMinutes,
        reasons: data.reasons
      });
    }
  }

  return alerts.sort((a, b) => b.denyCount - a.denyCount);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function createApprovalMessage(proposalId, action, payloadHash) {
  return `${proposalId}:${action}:${payloadHash}`;
}

function parsePolicyApprovalKeyMap() {
  const raw = process.env.POLICY_APPROVAL_SIGNING_KEYS_JSON || '';
  if (!raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [id, secret] of Object.entries(parsed)) {
      const key = String(id || '').trim();
      const val = String(secret || '').trim();
      if (!key || !val) continue;
      out[key] = val;
    }
    return out;
  } catch (_err) {
    return {};
  }
}

function parsePolicyAdminKeyMap() {
  const out = {};
  const legacy = String(process.env.POLICY_ADMIN_KEY || '').trim();
  if (legacy) {
    out.legacy = legacy;
  }

  const raw = process.env.POLICY_ADMIN_KEYS_JSON || '';
  if (!raw.trim()) return out;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
    for (const [id, secret] of Object.entries(parsed)) {
      const keyId = String(id || '').trim();
      const value = String(secret || '').trim();
      if (!keyId || !value) continue;
      out[keyId] = value;
    }
  } catch (_err) {
    return out;
  }

  return out;
}

function parsePolicyAdminActorAllowlist() {
  return String(process.env.POLICY_ADMIN_ALLOWED_ACTORS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPolicyAdminJwtConfig() {
  return {
    secret: String(process.env.POLICY_ADMIN_JWT_SECRET || '').trim(),
    issuer: String(process.env.POLICY_ADMIN_JWT_ISSUER || '').trim(),
    audience: String(process.env.POLICY_ADMIN_JWT_AUDIENCE || '').trim(),
    requiredRole: String(process.env.POLICY_ADMIN_REQUIRED_ROLE || 'policy_admin').trim() || 'policy_admin'
  };
}

function normalizeClaimList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function hasRequiredPolicyAdminRole(claims, requiredRole) {
  const candidates = [
    ...normalizeClaimList(claims && claims.role),
    ...normalizeClaimList(claims && claims.roles),
    ...normalizeClaimList(claims && claims.permissions),
    ...normalizeClaimList(claims && claims.scope),
    ...normalizeClaimList(claims && claims.scopes)
  ];
  const set = new Set(candidates.map((item) => item.toLowerCase()));
  const target = String(requiredRole || 'policy_admin').toLowerCase();
  return set.has(target) || set.has('policy:admin') || set.has('admin');
}

function resolvePolicyAdminActorFromClaims(claims) {
  const candidate = claims && (
    claims.email
    || claims.preferred_username
    || claims.sub
    || claims.lifePassId
    || claims.actor
  );
  const actor = String(candidate || '').trim();
  return actor || null;
}

function timingSafeMatch(value, expected) {
  const a = Buffer.from(String(value || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isAllowedPolicyAdminActor(actor) {
  const allowlist = parsePolicyAdminActorAllowlist();
  if (allowlist.length === 0) return true;
  return allowlist.includes(String(actor || '').trim());
}

function getPolicyAdminAccessPreconditions() {
  const keyMap = parsePolicyAdminKeyMap();
  const jwtConfig = getPolicyAdminJwtConfig();
  const allowlist = parsePolicyAdminActorAllowlist();
  const keyCount = Object.keys(keyMap).length;
  const hasJwt = Boolean(jwtConfig.secret);
  return {
    configured: hasJwt || keyCount > 0,
    detail: hasJwt
      ? `JWT admin auth enabled${allowlist.length ? ` with ${allowlist.length} allowed actor(s)` : ''}`
      : (keyCount > 0
          ? `${keyCount} policy admin key(s) configured${allowlist.length ? ` with ${allowlist.length} allowed actor(s)` : ''}`
          : 'configure POLICY_ADMIN_KEY / POLICY_ADMIN_KEYS_JSON or POLICY_ADMIN_JWT_SECRET'),
    keyCount,
    hasJwt,
    allowlistCount: allowlist.length
  };
}

function resolvePolicyAdminActor(req) {
  return (req.policyAdmin && req.policyAdmin.actor) || 'unknown';
}

function buildAuditChainExport(scope, events) {
  let previousHash = sha256Hex(`${scope}:genesis`);
  const entries = (events || []).map((event, index) => {
    const canonical = stableStringify(event);
    const hash = sha256Hex(`${scope}:${index}:${previousHash}:${canonical}`);
    const item = {
      index,
      previousHash,
      hash,
      event
    };
    previousHash = hash;
    return item;
  });

  return {
    scope,
    exportedAt: new Date().toISOString(),
    algorithm: 'sha256',
    count: entries.length,
    rootHash: previousHash,
    entries
  };
}

function toNdjson(lines) {
  return lines.map((line) => JSON.stringify(line)).join('\n');
}

function isTwoPersonPolicyEnabled() {
  return process.env.POLICY_TWO_PERSON_REQUIRED === '1';
}

function requiredPolicyApprovals() {
  return Math.max(2, Number(process.env.POLICY_REQUIRED_APPROVALS) || 2);
}

function verifyApproverSignature(proposal, approverId, signature) {
  const keyMap = parsePolicyApprovalKeyMap();
  const secret = keyMap[approverId];
  if (!secret) return false;

  const message = createApprovalMessage(proposal.id, proposal.action, proposal.payloadHash);
  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex');
  const a = Buffer.from(String(signature || ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getPolicyExecutionPreconditions() {
  const twoPerson = isTwoPersonPolicyEnabled();
  const approvals = parsePolicyApprovalKeyMap();
  const approverCount = Object.keys(approvals).length;
  return {
    twoPerson,
    approverCount,
    requiredApprovals: requiredPolicyApprovals()
  };
}

async function executePolicyMatrixUpdate({ actor, reason, replace, matrix }) {
  const incoming = portalPolicyStore.normalizePolicyMatrix(matrix || {});
  const previousOverrides = portalPolicyStore.readPolicyOverrideMatrixSync();
  const nextOverrides = replace
    ? incoming
    : portalPolicyStore.mergePolicyLayers(previousOverrides, incoming);
  const beforeMatrix = readPolicyMatrix();

  await portalPolicyStore.writePolicyOverrideMatrix(nextOverrides);
  const afterMatrix = readPolicyMatrix();
  const changes = buildPolicyDiff(beforeMatrix, afterMatrix);

  const snapshot = await policySnapshotStore.appendPolicySnapshot({
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    at: new Date().toISOString(),
    actor,
    reason,
    replace,
    overrides: nextOverrides,
    changes
  });

  await policyAdminAuditStore.appendPolicyAdminAuditEvent({
    at: new Date().toISOString(),
    actor,
    action: 'policy_matrix_update',
    reason,
    replace,
    snapshotId: snapshot.id,
    changedCount: changes.length,
    changedCovenants: Object.keys(incoming),
    changedPolicyKeys: Object.fromEntries(
      Object.entries(incoming).map(([covenant, rules]) => [covenant, Object.keys(rules || {})])
    )
  });

  return {
    snapshotId: snapshot.id,
    changes,
    matrix: afterMatrix,
    overrides: nextOverrides
  };
}

async function executePolicySnapshotRestore({ actor, reason, snapshotId }) {
  const snapshot = await policySnapshotStore.findPolicySnapshot(snapshotId);
  if (!snapshot) {
    const err = new Error('Snapshot not found');
    err.statusCode = 404;
    throw err;
  }

  const beforeMatrix = readPolicyMatrix();
  await portalPolicyStore.writePolicyOverrideMatrix(snapshot.overrides || {});
  const afterMatrix = readPolicyMatrix();
  const changes = buildPolicyDiff(beforeMatrix, afterMatrix);

  await policyAdminAuditStore.appendPolicyAdminAuditEvent({
    at: new Date().toISOString(),
    actor,
    action: 'policy_matrix_restore',
    reason,
    snapshotId,
    changedCount: changes.length
  });

  return {
    snapshotId,
    changes,
    matrix: afterMatrix,
    overrides: snapshot.overrides || {}
  };
}

async function createPendingPolicyProposal({ actor, action, reason, payload }) {
  const normalizedPayload = payload || {};
  const payloadHash = sha256Hex(stableStringify(normalizedPayload));
  const proposal = {
    id: `proposal-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    at: new Date().toISOString(),
    actor,
    action,
    reason: reason || '',
    payload: normalizedPayload,
    payloadHash,
    status: 'pending',
    requiredApprovals: requiredPolicyApprovals(),
    approvals: []
  };

  await policyApprovalStore.appendPolicyApproval(proposal);
  await policyAdminAuditStore.appendPolicyAdminAuditEvent({
    at: new Date().toISOString(),
    actor,
    action: 'policy_change_proposed',
    proposalId: proposal.id,
    proposalAction: action,
    reason: proposal.reason,
    requiredApprovals: proposal.requiredApprovals
  });

  return proposal;
}

// Production CORS allowlist: set CORS_ALLOWED_ORIGINS="https://app.example,https://preview.example"
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const originAllowed = CORS_ALLOW_ALL || (origin && CORS_ALLOWED_ORIGINS.includes(origin));

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

  if (origin && originAllowed) {
    if (CORS_ALLOW_ALL) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      if (CORS_ALLOW_CREDENTIALS) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }
  }

  if (req.method === 'OPTIONS') {
    if (origin && CORS_ALLOWED_ORIGINS.length > 0 && !originAllowed) {
      return res.sendStatus(403);
    }
    return res.sendStatus(204);
  }

  if (origin && CORS_ALLOWED_ORIGINS.length > 0 && !originAllowed) {
    return res.status(403).json({ success: false, error: 'Origin not allowed by CORS policy' });
  }

  next();
});

app.get('/health', (_req, res) => {
  const report = startupChecklist();
  const hasCriticalFailure = report.items.some(
    (item) => item.status === 'fail' && item.check !== 'AGE_VERIFIER_ADDRESS format'
  );

  return res.json({
    success: true,
    service: 'lifepass-api',
    mode: report.isProd ? 'production' : 'non-production',
    hasCriticalFailure,
    checks: report.items
  });
});

/**
 * POST /proof/generate
 * Build an age proof payload from user birth year using the configured zk engine.
 */
app.post('/proof/generate',
  publicRateLimit,
  body('birthYear').isInt({ min: 1900, max: 2100 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const birthYear = Number(req.body.birthYear);
      const profile = { dob: `${birthYear}-01-01` };
      const generated = await zkProof.generateOver18Proof(`web-${Date.now()}`, profile);

      if (!generated || !generated.proof || !generated.publicSignals) {
        return res.status(500).json({ success: false, error: 'Failed to generate proof payload' });
      }

      return res.json({
        success: true,
        proof: generated.proof,
        publicSignals: generated.publicSignals,
        mode: process.env.USE_SNARKJS === '1' ? 'snarkjs' : 'simulated'
      });
    } catch (err) {
      console.error('proof/generate error', err);
      return res.status(500).json({ success: false, error: 'Error generating proof' });
    }
  }
);

/**
 * POST /proof/submit
 * Receive a zkSNARK proof for the over-18 predicate and verify it through the shared
 * verification utility. If verifier contract config is absent, this falls back to local
 * deterministic verification.
 */
app.post('/proof/submit', publicRateLimit, async (req, res) => {
  try {
    const { proof, publicSignals } = req.body;
    if (!proof || !publicSignals) {
      return res.status(400).json({ success: false, error: 'Missing proof or publicSignals' });
    }

    const verifyResult = await onchainVerifier.verifyOnChain({ proof, publicSignals });
    if (!verifyResult.verified) {
      return res.status(400).json({ success: false, error: 'Proof verification failed', verifyResult });
    }

    res.json({ success: true, message: 'Proof verified', verifyResult });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error verifying proof' });
  }
});

// POST /proof/verify-onchain
app.post('/proof/verify-onchain',
  requireApiKey,
  body('proof').exists(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const payload = req.body;
      const result = await onchainVerifier.verifyOnChain(payload);
      return res.json({ success: true, result });
    } catch (err) {
      console.error('verify-onchain error', err);
      res.status(500).json({ success: false, error: 'Verify error' });
    }
  }
);

/**
 * POST /sbt/mint
 * Mint a new LifePass SBT.  Requires a previously verified proof (off‑chain enforcement) and
 * expects the caller to provide the recipient address, token ID, and metadata object.  The
 * server signs and sends the transaction via ethers.js.
 */
app.post('/sbt/mint', requireApiKey, async (req, res) => {
  try {
    const { to, tokenId, metadata, userId } = req.body;
    if (!to || !tokenId || !metadata) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!ethers.isAddress(to)) {
      return res.status(400).json({ success: false, error: 'Invalid recipient wallet address' });
    }

    // Graceful fallback for local/dev environments without blockchain config.
    if (!sbtContract) {
      const simulatedTxHash = `0xSIMULATED_SBT_MINT_${Date.now()}`;
      return res.json({
        success: true,
        txHash: simulatedTxHash,
        simulated: true,
        message: 'SBT contract not configured; mint simulated'
      });
    }

    let tx;
    try {
      tx = await sbtContract.mint(to, tokenId, metadata);
      await tx.wait();
    } catch (chainErr) {
      const chainReason = parseEvmError(chainErr);
      const allowSimulatedOnChainFailure = process.env.ALLOW_SIMULATED_MINT_ONCHAIN_FAILURE
        ? process.env.ALLOW_SIMULATED_MINT_ONCHAIN_FAILURE === '1'
        : process.env.NODE_ENV !== 'production';

      if (allowSimulatedOnChainFailure) {
        const simulatedTxHash = `0xSIMULATED_SBT_MINT_ERR_${Date.now()}`;
        return res.json({
          success: true,
          txHash: simulatedTxHash,
          simulated: true,
          message: 'On-chain mint failed; simulated fallback returned',
          chainError: chainReason
        });
      }

      return res.status(502).json({
        success: false,
        error: `On-chain mint failed: ${chainReason}`,
        reason: chainReason
      });
    }

    if (userId) {
      const updatedProfile = await profileDb.patchProfile(userId, {
        walletAddress: to,
        mintedTokenId: tokenId,
        mintedTxHash: tx.hash,
        mintedAt: new Date().toISOString()
      });

      await trustScoreStore.applyTrustPolicy(
        userId,
        {
          verificationStatus: updatedProfile.verificationStatus || 'pending',
          endorsementsCount: Array.isArray(updatedProfile.verifierSubmissions) ? updatedProfile.verifierSubmissions.length : 0,
          documentChecksCount: (updatedProfile.verificationSummary && updatedProfile.verificationSummary.documentChecksApproved) || 0,
          mutualVerificationsCount: (updatedProfile.verificationSummary && updatedProfile.verificationSummary.mutualVerificationsApproved) || 0,
          rejectedDocumentChecks: (updatedProfile.verificationSummary && updatedProfile.verificationSummary.documentChecksRejected) || 0,
          hasMinted: true,
          minBronzeScore: ONBOARDING_BRONZE_SCORE
        },
        'direct-mint-policy'
      );
    }

    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    console.error('sbt/mint error', err);
    const reason = parseEvmError(err);
    res.status(500).json({ success: false, error: `Error minting token: ${reason}`, reason });
  }
});


// Integrate PurposeGuide agent with mock tools
const PurposeGuide = require('../../agents/purpose_guide_agent');

const agent = new PurposeGuide(profileDb, zkProof, walletTool);

// Simple API key middleware (set API_KEY env var to enable)
function requireApiKey(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next(); // no enforcement if not configured
  const provided = req.header('x-api-key');
  if (!provided || provided !== apiKey) return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}

function requireApiKeyOrSelfAccess(paramName = 'userId') {
  return (req, res, next) => {
    const apiKey = process.env.API_KEY;
    const provided = req.header('x-api-key');
    if (!apiKey || (provided && provided === apiKey)) {
      return next();
    }

    const authHeader = req.header('authorization') || '';
    const parts = authHeader.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0]) && parts[1]) {
      try {
        const verified = ssoAuth.verifySsoToken(parts[1]);
        const claims = verified?.claims || {};
        const targetUserId = String(req.params[paramName] || '');
        const tokenUserId = String(claims.lifePassId || claims.sub || '');
        if (targetUserId && tokenUserId && tokenUserId === targetUserId) {
          req.lifePassClaims = claims;
          return next();
        }
        return res.status(403).json({ success: false, error: 'Forbidden: token does not match requested user' });
      } catch (_err) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
    }

    return res.status(401).json({ success: false, error: 'Unauthorized' });
  };
}

function normalizeVisibilityPreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    legalName: Boolean(input.legalName),
    covenantName: input.covenantName !== false,
    purposeStatement: input.purposeStatement !== false,
    skills: Boolean(input.skills),
    callings: Boolean(input.callings),
    trustLevel: input.trustLevel !== false,
    trustScore: Boolean(input.trustScore),
    milestones: input.milestones !== false,
    biometricPhoto: Boolean(input.biometricPhoto)
  };
}

function maybeIssueSsoSession(userId, trust, extra = {}) {
  if (!ssoAuth.getSsoConfig().configured) {
    return null;
  }

  const issued = ssoAuth.issueSsoToken({
    userId,
    trustLevel: trust.level,
    trustScore: trust.score,
    metadata: extra
  });

  return {
    token: issued.token,
    tokenType: 'Bearer',
    audience: issued.audience,
    expiresIn: issued.expiresIn,
    claims: {
      lifePassId: userId,
      trustLevel: trust.level,
      trustScore: trust.score
    }
  };
}

function requireSsoConfigured(req, res, next) {
  const config = ssoAuth.getSsoConfig();
  if (!config.configured) {
    return res.status(503).json({ success: false, error: 'SSO is not configured' });
  }
  return next();
}

function requirePolicyAdminAccess(req, res, next) {
  const jwtConfig = getPolicyAdminJwtConfig();
  const authHeader = req.header('authorization') || '';
  const parts = authHeader.split(' ');

  if (jwtConfig.secret && parts.length === 2 && /^Bearer$/i.test(parts[0]) && parts[1]) {
    try {
      const verifyOptions = {};
      if (jwtConfig.issuer) verifyOptions.issuer = jwtConfig.issuer;
      if (jwtConfig.audience) verifyOptions.audience = jwtConfig.audience;
      const claims = jwt.verify(parts[1], jwtConfig.secret, verifyOptions);
      if (!hasRequiredPolicyAdminRole(claims, jwtConfig.requiredRole)) {
        return res.status(403).json({ success: false, error: 'Forbidden: policy admin role is required' });
      }
      const actor = resolvePolicyAdminActorFromClaims(claims);
      if (!actor) {
        return res.status(403).json({ success: false, error: 'Forbidden: admin token is missing an actor identity' });
      }
      if (!isAllowedPolicyAdminActor(actor)) {
        return res.status(403).json({ success: false, error: 'Forbidden: admin actor is not allowlisted' });
      }
      req.policyAdmin = { mode: 'jwt', actor, claims };
      return next();
    } catch (_err) {
      return res.status(401).json({ success: false, error: 'Unauthorized: invalid admin bearer token' });
    }
  }

  const keyMap = parsePolicyAdminKeyMap();
  const configuredKeyIds = Object.keys(keyMap);
  if (configuredKeyIds.length === 0 && !jwtConfig.secret) {
    return res.status(503).json({ success: false, error: 'Policy admin auth is not configured' });
  }

  const provided = req.header('x-policy-admin-key');
  if (!provided) {
    return res.status(403).json({ success: false, error: 'Forbidden: invalid policy admin credentials' });
  }

  const requestedKeyId = String(req.header('x-policy-admin-key-id') || '').trim();
  let matchedKeyId = null;

  if (requestedKeyId) {
    if (keyMap[requestedKeyId] && timingSafeMatch(provided, keyMap[requestedKeyId])) {
      matchedKeyId = requestedKeyId;
    }
  } else {
    const matches = configuredKeyIds.filter((keyId) => timingSafeMatch(provided, keyMap[keyId]));
    if (matches.length === 1) {
      matchedKeyId = matches[0];
    } else if (matches.length > 1) {
      matchedKeyId = matches[0];
    }
  }

  if (!matchedKeyId) {
    return res.status(403).json({ success: false, error: 'Forbidden: invalid policy admin credentials' });
  }

  const actor = String(req.header('x-admin-actor') || '').trim() || `key:${matchedKeyId}`;
  if (!isAllowedPolicyAdminActor(actor)) {
    return res.status(403).json({ success: false, error: 'Forbidden: admin actor is not allowlisted' });
  }

  req.policyAdmin = { mode: 'key', actor, keyId: matchedKeyId };
  return next();
}

app.use('/portals', createPortalRouter());

app.post('/onboarding/signup',
  publicRateLimit,
  body('userId').isString().notEmpty(),
  body('legalName').optional().isString(),
  body('name').optional().isString(),
  body('covenantName').optional().isString(),
  body('preferredCovenantName').optional().isString(),
  body('purpose').optional().isString(),
  body('purposeStatement').optional().isString(),
  body('skills').optional(),
  body('coreSkills').optional(),
  body('callings').optional(),
  body('verificationDocs').optional().isArray(),
  body('biometricPhotoRef').optional().isString(),
  body('biometricPhotoUrl').optional().isString(),
  body('visibility').optional().isObject(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const {
        userId,
        name,
        legalName,
        covenantName,
        preferredCovenantName,
        purpose,
        purposeStatement,
        skills,
        coreSkills,
        callings,
        verificationDocs,
        biometricPhotoRef,
        biometricPhotoUrl,
        biometric,
        visibility
      } = req.body;

      const resolvedLegalName = String(legalName || name || '').trim();
      const resolvedPurpose = String(purposeStatement || purpose || '').trim();
      const resolvedSkills = toStringArray(coreSkills || skills);
      const resolvedCallings = toStringArray(callings);
      const resolvedDocs = Array.isArray(verificationDocs) ? verificationDocs : [];

      if (!resolvedLegalName) {
        return res.status(400).json({ success: false, error: 'legalName (or name) is required' });
      }

      if (!resolvedPurpose) {
        return res.status(400).json({ success: false, error: 'purposeStatement (or purpose) is required' });
      }

      const trust = await trustScoreStore.applyTrustPolicy(
        userId,
        {
          verificationStatus: 'pending',
          endorsementsCount: 0,
          documentChecksCount: 0,
          mutualVerificationsCount: 0,
          rejectedDocumentChecks: 0,
          hasMinted: false,
          minBronzeScore: ONBOARDING_BRONZE_SCORE
        },
        'onboarding-signup-policy'
      );

      const profile = {
        userId,
        name: resolvedLegalName,
        legalName: resolvedLegalName,
        covenantName: covenantName ? String(covenantName).trim() : '',
        preferredCovenantName: preferredCovenantName
          ? String(preferredCovenantName).trim()
          : (covenantName ? String(covenantName).trim() : ''),
        purpose: resolvedPurpose,
        purposeStatement: resolvedPurpose,
        skills: resolvedSkills,
        coreSkills: resolvedSkills,
        callings: resolvedCallings,
        biometricPhotoRef: biometricPhotoRef ? String(biometricPhotoRef).trim() : '',
        biometricPhotoUrl: biometricPhotoUrl ? String(biometricPhotoUrl).trim() : '',
        biometric: biometric || {
          hasFaceScan: false,
          hasFingerprint: false,
          source: 'self-declared'
        },
        verificationDocs: resolvedDocs,
        visibility: normalizeVisibilityPreferences(visibility),
        verificationStatus: 'pending',
        trustScore: trust.score,
        trustLevel: trust.level,
        verifierSubmissions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await profileDb.upsertProfile(userId, profile);
      await vectorStore.upsertEmbedding(
        `profile:${userId}`,
        `${resolvedPurpose} ${resolvedSkills.join(' ')} ${resolvedCallings.join(' ')}`,
        { userId, type: 'profile' }
      );
      const session = maybeIssueSsoSession(userId, trust, { source: 'signup' });
      return res.status(201).json({ success: true, profile, trust, session });
    } catch (err) {
      console.error('onboarding/signup error', err);
      return res.status(500).json({ success: false, error: 'Signup error' });
    }
  }
);

app.post('/onboarding/upload-url',
  body('userId').isString().notEmpty(),
  body('fileName').isString().notEmpty(),
  body('contentType').optional().isString(),
  body('mediaType').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { userId, fileName, contentType, mediaType } = req.body;
      const profile = await profileDb.getProfile(userId);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

      const intent = await storageTool.createUploadIntent({
        userId,
        fileName,
        contentType,
        mediaType: mediaType || 'biometric-photo'
      });

      const mediaRecord = await profileMediaStore.addMediaRecord({
        mediaId: intent.uploadId,
        userId,
        mediaType: mediaType || 'biometric-photo',
        storageProvider: intent.provider,
        bucket: intent.bucket,
        objectKey: intent.objectKey,
        publicUrl: intent.fileUrl,
        metadata: {
          fileName,
          contentType: contentType || null,
          uploadUrlIssued: Boolean(intent.uploadUrl)
        }
      });

      await profileDb.patchProfile(userId, {
        biometricPhotoRef: mediaRecord.objectKey || mediaRecord.mediaId,
        biometricPhotoUrl: mediaRecord.publicUrl || '',
        biometricMediaId: mediaRecord.mediaId
      });

      return res.status(201).json({
        success: true,
        upload: intent,
        media: mediaRecord
      });
    } catch (err) {
      console.error('onboarding/upload-url error', err);
      return res.status(500).json({ success: false, error: 'Upload intent error' });
    }
  }
);

app.get('/onboarding/media/:userId', requireApiKey, async (req, res) => {
  try {
    const media = await profileMediaStore.listMediaByUser(req.params.userId);
    return res.json({ success: true, media });
  } catch (err) {
    console.error('onboarding/media list error', err);
    return res.status(500).json({ success: false, error: 'Media lookup failed' });
  }
});

app.post('/onboarding/verifier-submission',
  body('userId').isString().notEmpty(),
  body('verifierName').isString().notEmpty(),
  body('verifierType').isIn(['church', 'school', 'co-op', 'employer', 'leader', 'other']),
  body('relationship').optional().isString(),
  body('endorsement').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const { userId, verifierName, verifierType, relationship, endorsement } = req.body;
      const profile = await profileDb.getProfile(userId);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

      const existing = Array.isArray(profile.verifierSubmissions) ? profile.verifierSubmissions : [];
      const submission = {
        verifierName: String(verifierName).trim(),
        verifierType,
        relationship: relationship ? String(relationship).trim() : '',
        endorsement: endorsement ? String(endorsement).trim() : '',
        submittedAt: new Date().toISOString()
      };
      const updatedSubmissions = [...existing, submission];

      await verificationStore.addVerificationEvent({
        userId,
        verifierName: submission.verifierName,
        kind: 'endorsement',
        status: 'approved',
        note: submission.endorsement,
        metadata: {
          verifierType,
          relationship: submission.relationship,
          source: 'onboarding/verifier-submission'
        }
      });

      await profileDb.patchProfile(userId, {
        verifierSubmissions: updatedSubmissions,
        verificationSourcesCount: updatedSubmissions.length
      });

      const recomputed = await recomputeTrustFromProfile(userId, {
        ...profile,
        verifierSubmissions: updatedSubmissions
      });

      return res.status(201).json({
        success: true,
        submission,
        profile: recomputed.profile,
        verifierSubmissionsCount: updatedSubmissions.length,
        trust: recomputed.trust,
        verificationSummary: recomputed.summary
      });
    } catch (err) {
      console.error('onboarding/verifier-submission error', err);
      return res.status(500).json({ success: false, error: 'Verifier submission error' });
    }
  }
);

app.post('/verifications/add',
  requireApiKey,
  body('userId').isString().notEmpty(),
  body('kind').isIn(['endorsement', 'document', 'mutual']),
  body('status').optional().isIn(['pending', 'approved', 'rejected']),
  body('verifierUserId').optional().isString(),
  body('verifierName').optional().isString(),
  body('documentType').optional().isIn(['passport', 'national-id', 'utility-bill', 'selfie-match', 'other']),
  body('note').optional().isString(),
  body('evidenceUrl').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const {
        userId,
        kind,
        status,
        verifierUserId,
        verifierName,
        documentType,
        note,
        evidenceUrl
      } = req.body;

      const profile = await profileDb.getProfile(userId);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

      const event = await verificationStore.addVerificationEvent({
        userId,
        kind,
        status: status || 'approved',
        verifierUserId,
        verifierName,
        documentType,
        note,
        evidenceUrl,
        metadata: {
          source: 'verifications/add'
        }
      });

      if (kind === 'mutual' && verifierUserId) {
        await verificationStore.upsertTrustEdge({
          edgeId: `${verifierUserId}->${userId}`,
          sourceUserId: verifierUserId,
          targetUserId: userId,
          status: status || 'approved',
          metadata: {
            verificationId: event.verificationId
          }
        });
      }

      const recomputed = await recomputeTrustFromProfile(userId, profile);
      return res.status(201).json({
        success: true,
        event,
        trust: recomputed.trust,
        verificationStatus: recomputed.verificationStatus,
        verificationSummary: recomputed.summary
      });
    } catch (err) {
      console.error('verifications/add error', err);
      return res.status(500).json({ success: false, error: 'Verification add error' });
    }
  }
);

app.post('/verifications/revoke',
  requireApiKey,
  body('userId').isString().notEmpty(),
  body('verificationId').isString().notEmpty(),
  body('reason').optional().isString(),
  body('reviewerId').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const { userId, verificationId, reason, reviewerId } = req.body;
      const profile = await profileDb.getProfile(userId);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

      const revoked = await verificationStore.revokeVerificationEvent(userId, verificationId, reason || '', reviewerId || '');
      if (!revoked) return res.status(404).json({ success: false, error: 'Verification not found' });

      const recomputed = await recomputeTrustFromProfile(userId, profile);
      return res.json({
        success: true,
        revoked,
        trust: recomputed.trust,
        verificationStatus: recomputed.verificationStatus,
        verificationSummary: recomputed.summary
      });
    } catch (err) {
      console.error('verifications/revoke error', err);
      return res.status(500).json({ success: false, error: 'Verification revoke error' });
    }
  }
);

app.get('/verifications/:userId', requireApiKey, async (req, res) => {
  try {
    const events = await verificationStore.listVerificationEvents(req.params.userId, {
      includeRevoked: req.query.includeRevoked === '1'
    });
    const summary = await verificationStore.getVerificationSummary(req.params.userId);
    return res.json({ success: true, summary, events });
  } catch (err) {
    console.error('verifications list error', err);
    return res.status(500).json({ success: false, error: 'Verification lookup failed' });
  }
});

app.post('/onboarding/verify',
  requireApiKey,
  body('userId').isString().notEmpty(),
  body('status').isIn(['pending', 'approved', 'rejected']),
  body('reviewerId').optional().isString(),
  body('reviewerNote').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const { userId, status, reviewerId, reviewerNote } = req.body;
      const profile = await profileDb.getProfile(userId);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

      const currentStatus = profile.verificationStatus || 'pending';
      const normalizedCurrent = ['pending', 'approved', 'rejected'].includes(currentStatus) ? currentStatus : 'pending';
      const sameStatus = normalizedCurrent === status;
      const allowedTransitions = {
        pending: ['approved', 'rejected'],
        approved: ['rejected'],
        rejected: ['approved']
      };

      if (!sameStatus && !allowedTransitions[normalizedCurrent].includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid verification transition from ${normalizedCurrent} to ${status}`
        });
      }

      await profileDb.patchProfile(userId, {
        verificationStatus: status,
        verificationReviewedAt: new Date().toISOString(),
        verificationReviewerId: reviewerId || null,
        verificationReviewerNote: reviewerNote || '',
        verificationDecisionHistory: [
          ...(Array.isArray(profile.verificationDecisionHistory) ? profile.verificationDecisionHistory : []),
          {
            from: normalizedCurrent,
            to: status,
            reviewerId: reviewerId || null,
            reviewerNote: reviewerNote || '',
            decidedAt: new Date().toISOString()
          }
        ]
      });

      const summary = await verificationStore.getVerificationSummary(userId);
      const trust = await trustScoreStore.applyTrustPolicy(
        userId,
        {
          verificationStatus: status,
          endorsementsCount: summary.approvedEndorsements,
          documentChecksCount: summary.approvedDocumentChecks,
          mutualVerificationsCount: summary.approvedMutualVerifications,
          rejectedDocumentChecks: summary.rejectedDocumentChecks,
          verifierSubmissionsCount: Array.isArray(profile.verifierSubmissions) ? profile.verifierSubmissions.length : 0,
          hasMinted: Boolean(profile.mintedTxHash),
          minBronzeScore: ONBOARDING_BRONZE_SCORE
        },
        'onboarding-verify-policy'
      );

      const updated = await profileDb.patchProfile(userId, {
        trustScore: trust.score,
        trustLevel: trust.level
      });

      return res.json({ success: true, profile: updated, trust, verificationSummary: summary });
    } catch (err) {
      console.error('onboarding/verify error', err);
      return res.status(500).json({ success: false, error: 'Verification workflow error' });
    }
  }
);

app.get('/trust/:userId', requireApiKey, async (req, res) => {
  try {
    const trust = await trustScoreStore.getTrustScore(req.params.userId);
    return res.json({ success: true, trust });
  } catch (err) {
    console.error('trust get error', err);
    return res.status(500).json({ success: false, error: 'Trust score lookup failed' });
  }
});

app.post('/trust/:userId/update',
  requireApiKey,
  body('score').isNumeric(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const trust = await trustScoreStore.updateTrustScore(req.params.userId, req.body.score, req.body.reason || 'manual-update');
      await profileDb.patchProfile(req.params.userId, { trustScore: trust.score, trustLevel: trust.level });
      return res.json({ success: true, trust });
    } catch (err) {
      console.error('trust update error', err);
      return res.status(500).json({ success: false, error: 'Trust score update failed' });
    }
  }
);

app.get('/users/:userId/dashboard', requireApiKeyOrSelfAccess('userId'), async (req, res) => {
  try {
    const profile = await profileDb.getProfile(req.params.userId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const trust = await trustScoreStore.getTrustScore(req.params.userId);
    const milestones = await milestoneStore.listMilestones(req.params.userId);
    const milestoneSummary = milestoneStore.computeSummary(milestones);
    const badges = milestoneStore.buildBadges(trust, milestones);
    return res.json({
      success: true,
      profile,
      trust,
      milestones,
      milestoneSummary,
      badges
    });
  } catch (err) {
    console.error('dashboard error', err);
    return res.status(500).json({ success: false, error: 'Dashboard lookup failed' });
  }
});

app.get('/users/:userId/milestones', requireApiKeyOrSelfAccess('userId'), async (req, res) => {
  try {
    const profile = await profileDb.getProfile(req.params.userId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const trust = await trustScoreStore.getTrustScore(req.params.userId);
    const milestones = await milestoneStore.listMilestones(req.params.userId);
    const summary = milestoneStore.computeSummary(milestones);
    const badges = milestoneStore.buildBadges(trust, milestones);
    return res.json({ success: true, milestones, summary, badges });
  } catch (err) {
    console.error('milestones list error', err);
    return res.status(500).json({ success: false, error: 'Milestone lookup failed' });
  }
});

app.post('/users/:userId/milestones',
  requireApiKeyOrSelfAccess('userId'),
  body('title').isString().notEmpty(),
  body('description').optional().isString(),
  body('status').optional().isIn(['pending', 'in_progress', 'completed']),
  body('dueAt').optional().isISO8601(),
  body('completedAt').optional().isISO8601(),
  body('tags').optional().isArray(),
  body('metadata').optional().isObject(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const profile = await profileDb.getProfile(req.params.userId);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

      const milestone = await milestoneStore.addMilestone(req.params.userId, req.body || {});
      return res.status(201).json({ success: true, milestone });
    } catch (err) {
      console.error('milestone create error', err);
      return res.status(500).json({ success: false, error: err.message || 'Milestone create failed' });
    }
  }
);

app.patch('/users/:userId/milestones/:milestoneId',
  requireApiKeyOrSelfAccess('userId'),
  body('title').optional().isString().notEmpty(),
  body('description').optional().isString(),
  body('status').optional().isIn(['pending', 'in_progress', 'completed']),
  body('dueAt').optional({ nullable: true }).isISO8601(),
  body('completedAt').optional({ nullable: true }).isISO8601(),
  body('tags').optional().isArray(),
  body('metadata').optional().isObject(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const updated = await milestoneStore.updateMilestone(req.params.userId, req.params.milestoneId, req.body || {});
      if (!updated) return res.status(404).json({ success: false, error: 'Milestone not found' });
      return res.json({ success: true, milestone: updated });
    } catch (err) {
      console.error('milestone update error', err);
      return res.status(500).json({ success: false, error: err.message || 'Milestone update failed' });
    }
  }
);

app.post('/users/:userId/milestones/:milestoneId/anchor',
  requireApiKeyOrSelfAccess('userId'),
  body('holderAddress').optional().isString(),
  body('actionType').optional().isString(),
  body('metadataUri').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const profile = await profileDb.getProfile(req.params.userId);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

      const milestones = await milestoneStore.listMilestones(req.params.userId);
      const milestone = milestones.find((item) => item.id === req.params.milestoneId);
      if (!milestone) return res.status(404).json({ success: false, error: 'Milestone not found' });

      const holderAddress = String(req.body.holderAddress || profile.walletAddress || '').trim();
      if (!holderAddress || !ethers.isAddress(holderAddress)) {
        return res.status(400).json({ success: false, error: 'A valid holderAddress or minted profile walletAddress is required' });
      }

      const actionType = String(req.body.actionType || 'milestone_completed').trim() || 'milestone_completed';
      const metadataUri = String(req.body.metadataUri || '').trim();
      const actionPayload = {
        userId: req.params.userId,
        milestoneId: milestone.id,
        title: milestone.title,
        status: milestone.status,
        completedAt: milestone.completedAt || null,
        metadata: milestone.metadata || {},
        actionType,
        metadataUri
      };
      const actionHash = ethers.keccak256(ethers.toUtf8Bytes(stableStringify(actionPayload)));
      const anchor = await walletTool.anchorTrustAction(req.params.userId, {
        holderAddress,
        actionHash,
        actionType,
        metadataUri
      });

      const updatedMilestone = await milestoneStore.updateMilestone(req.params.userId, milestone.id, {
        metadata: {
          ...(milestone.metadata || {}),
          onchainAnchor: {
            actionHash,
            actionType,
            holderAddress,
            metadataUri,
            txHash: anchor.txHash,
            simulated: Boolean(anchor.simulated),
            anchoredAt: new Date().toISOString()
          }
        }
      });

      return res.status(201).json({ success: true, milestone: updatedMilestone, anchor });
    } catch (err) {
      console.error('milestone anchor error', err);
      return res.status(500).json({ success: false, error: 'Milestone anchor failed', reason: parseEvmError(err) });
    }
  }
);

app.patch('/users/:userId/visibility',
  requireApiKeyOrSelfAccess('userId'),
  body('visibility').isObject(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const profile = await profileDb.getProfile(req.params.userId);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
      const visibility = normalizeVisibilityPreferences(req.body.visibility);
      const updatedProfile = await profileDb.patchProfile(req.params.userId, { visibility });
      return res.json({ success: true, visibility, profile: updatedProfile });
    } catch (err) {
      console.error('visibility update error', err);
      return res.status(500).json({ success: false, error: 'Visibility update failed' });
    }
  }
);

app.post('/auth/sso/token',
  requireApiKey,
  requireSsoConfigured,
  body('userId').isString().notEmpty(),
  body('audience').optional().isString(),
  body('expiresIn').optional().isString(),
  body('scope').optional(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const { userId, audience, expiresIn, scope } = req.body;
      const trust = await trustScoreStore.getTrustScore(userId);
      const issued = ssoAuth.issueSsoToken({
        userId,
        trustLevel: trust.level,
        trustScore: trust.score,
        audience,
        expiresIn,
        scope: toStringArray(scope)
      });
      return res.status(201).json({
        success: true,
        token: issued.token,
        tokenType: 'Bearer',
        claims: {
          lifePassId: userId,
          trustLevel: trust.level,
          trustScore: trust.score
        },
        audience: issued.audience,
        expiresIn: issued.expiresIn
      });
    } catch (err) {
      console.error('auth/sso/token error', err);
      return res.status(500).json({ success: false, error: 'Failed to issue SSO token' });
    }
  }
);

app.post('/auth/sso/verify',
  authRateLimit,
  requireSsoConfigured,
  body('token').isString().notEmpty(),
  body('audience').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const verified = ssoAuth.verifySsoToken(req.body.token, {
        audience: req.body.audience
      });
      return res.json({ success: true, verified });
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        reason: parseEvmError(err)
      });
    }
  }
);

app.get('/pass/qr-payload/:userId', requireApiKeyOrSelfAccess('userId'), async (req, res) => {
  try {
    const trust = await trustScoreStore.getTrustScore(req.params.userId);
    const profile = await profileDb.getProfile(req.params.userId);
    const payload = await passQr.buildPassPayload(req.params.userId, trust, profile);
    const nfcPayload = passQr.buildNfcPayload(payload);
    return res.json({ success: true, payload, nfcPayload });
  } catch (err) {
    console.error('pass/qr-payload error', err);
    return res.status(500).json({ success: false, error: 'Failed to generate pass payload' });
  }
});

app.get('/pass/nfc-payload/:userId', requireApiKeyOrSelfAccess('userId'), async (req, res) => {
  try {
    const trust = await trustScoreStore.getTrustScore(req.params.userId);
    const profile = await profileDb.getProfile(req.params.userId);
    const payload = await passQr.buildPassPayload(req.params.userId, trust, profile);
    const nfcPayload = passQr.buildNfcPayload(payload);
    return res.json({ success: true, payload, nfcPayload });
  } catch (err) {
    console.error('pass/nfc-payload error', err);
    return res.status(500).json({ success: false, error: 'Failed to generate NFC pass payload' });
  }
});

app.get('/pass/qr/:userId', requireApiKeyOrSelfAccess('userId'), async (req, res) => {
  try {
    const trust = await trustScoreStore.getTrustScore(req.params.userId);
    const profile = await profileDb.getProfile(req.params.userId);
    const payload = await passQr.buildPassPayload(req.params.userId, trust, profile);
    const qrDataUrl = await passQr.buildQrCodeDataUrl(payload);
    const nfcPayload = passQr.buildNfcPayload(payload);
    return res.json({ success: true, payload, nfcPayload, qrDataUrl });
  } catch (err) {
    console.error('pass/qr error', err);
    return res.status(500).json({ success: false, error: 'Failed to generate QR pass' });
  }
});

app.get('/portals/policy-matrix', requireApiKey, (_req, res) => {
  const matrix = readPolicyMatrix();
  return res.json({ success: true, matrix });
});

app.post('/portals/policy-matrix',
  requireApiKey,
  requirePolicyAdminAccess,
  body('matrix').isObject(),
  body('replace').optional().isBoolean(),
  body('reason').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const actor = resolvePolicyAdminActor(req);
      const reason = (req.body.reason || '').trim();
      const replace = Boolean(req.body.replace);

      const incoming = portalPolicyStore.normalizePolicyMatrix(req.body.matrix || {});

      if (isTwoPersonPolicyEnabled()) {
        const proposal = await createPendingPolicyProposal({
          actor,
          action: 'policy_matrix_update',
          reason,
          payload: {
            replace,
            matrix: incoming
          }
        });

        return res.status(202).json({
          success: true,
          message: 'Policy change proposal created; awaiting signed approvals',
          proposalId: proposal.id,
          requiredApprovals: proposal.requiredApprovals,
          approvals: proposal.approvals.length
        });
      }

      const execution = await executePolicyMatrixUpdate({
        actor,
        reason,
        replace,
        matrix: incoming
      });

      return res.json({
        success: true,
        message: 'Portal policy matrix updated',
        snapshotId: execution.snapshotId,
        changes: execution.changes,
        matrix: execution.matrix,
        overrides: execution.overrides
      });
    } catch (err) {
      if (String(err.message || '').includes('matrix.')) {
        return res.status(400).json({ success: false, error: err.message });
      }
      console.error('portals/policy-matrix update error', err);
      return res.status(500).json({ success: false, error: 'Failed to update portal policy matrix' });
    }
  }
);

app.post('/portals/policy-matrix/preview',
  requireApiKey,
  requirePolicyAdminAccess,
  body('matrix').isObject(),
  body('replace').optional().isBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const replace = Boolean(req.body.replace);
      const incoming = portalPolicyStore.normalizePolicyMatrix(req.body.matrix || {});
      const previousOverrides = portalPolicyStore.readPolicyOverrideMatrixSync();
      const nextOverrides = replace
        ? incoming
        : portalPolicyStore.mergePolicyLayers(previousOverrides, incoming);

      const beforeMatrix = readPolicyMatrix();
      const afterMatrix = portalPolicyStore.mergePolicyLayers(
        beforeMatrix,
        nextOverrides
      );
      const changes = buildPolicyDiff(beforeMatrix, afterMatrix);

      return res.json({
        success: true,
        replace,
        changedCount: changes.length,
        changes,
        projectedMatrix: afterMatrix,
        projectedOverrides: nextOverrides
      });
    } catch (err) {
      if (String(err.message || '').includes('matrix.')) {
        return res.status(400).json({ success: false, error: err.message });
      }
      console.error('portals/policy-matrix/preview error', err);
      return res.status(500).json({ success: false, error: 'Failed to preview portal policy matrix changes' });
    }
  }
);

app.get('/portals/policy-snapshots', requireApiKey, requirePolicyAdminAccess, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || 50);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 50));
    const snapshots = await policySnapshotStore.readPolicySnapshots();
    const sliced = snapshots.slice(-limit);
    return res.json({ success: true, count: sliced.length, snapshots: sliced });
  } catch (err) {
    console.error('portals/policy-snapshots error', err);
    return res.status(500).json({ success: false, error: 'Failed to read policy snapshots' });
  }
});

app.post('/portals/policy-snapshots/:snapshotId/restore',
  requireApiKey,
  requirePolicyAdminAccess,
  body('reason').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const snapshotId = req.params.snapshotId;
      const actor = resolvePolicyAdminActor(req);
      const reason = (req.body.reason || '').trim();

      if (isTwoPersonPolicyEnabled()) {
        const proposal = await createPendingPolicyProposal({
          actor,
          action: 'policy_matrix_restore',
          reason,
          payload: { snapshotId }
        });

        return res.status(202).json({
          success: true,
          message: 'Policy restore proposal created; awaiting signed approvals',
          proposalId: proposal.id,
          requiredApprovals: proposal.requiredApprovals,
          approvals: proposal.approvals.length
        });
      }

      const execution = await executePolicySnapshotRestore({
        actor,
        reason,
        snapshotId
      });

      return res.json({
        success: true,
        message: 'Policy snapshot restored',
        snapshotId: execution.snapshotId,
        changes: execution.changes,
        matrix: execution.matrix,
        overrides: execution.overrides
      });
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({ success: false, error: 'Snapshot not found' });
      }
      console.error('portals/policy-snapshots restore error', err);
      return res.status(500).json({ success: false, error: 'Failed to restore policy snapshot' });
    }
  }
);

app.get('/portals/policy-approvals', requireApiKey, requirePolicyAdminAccess, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || 50);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 50));
    const status = req.query.status ? String(req.query.status).toLowerCase() : '';
    const proposals = await policyApprovalStore.readPolicyApprovals();
    const filtered = proposals.filter((item) => {
      if (!status) return true;
      return String(item.status || '').toLowerCase() === status;
    });
    const sliced = filtered.slice(-limit);
    return res.json({ success: true, count: sliced.length, proposals: sliced });
  } catch (err) {
    console.error('portals/policy-approvals error', err);
    return res.status(500).json({ success: false, error: 'Failed to read policy approval proposals' });
  }
});

app.get('/portals/policy-approvals/:proposalId', requireApiKey, requirePolicyAdminAccess, async (req, res) => {
  try {
    const proposal = await policyApprovalStore.findPolicyApprovalById(req.params.proposalId);
    if (!proposal) return res.status(404).json({ success: false, error: 'Proposal not found' });
    return res.json({ success: true, proposal });
  } catch (err) {
    console.error('portals/policy-approvals/:proposalId error', err);
    return res.status(500).json({ success: false, error: 'Failed to read policy approval proposal' });
  }
});

app.post('/portals/policy-approvals/:proposalId/approve',
  requireApiKey,
  requirePolicyAdminAccess,
  body('approverId').isString().notEmpty(),
  body('signature').isString().notEmpty(),
  body('note').optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    try {
      const proposalId = req.params.proposalId;
      const approverId = String(req.body.approverId || '').trim();
      const signature = String(req.body.signature || '').trim();
      const note = (req.body.note || '').trim();

      const proposal = await policyApprovalStore.findPolicyApprovalById(proposalId);
      if (!proposal) return res.status(404).json({ success: false, error: 'Proposal not found' });
      if (proposal.status !== 'pending') {
        return res.status(409).json({ success: false, error: 'Proposal is not pending', status: proposal.status });
      }
      if (!verifyApproverSignature(proposal, approverId, signature)) {
        return res.status(403).json({ success: false, error: 'Invalid approval signature' });
      }
      if (proposal.approvals.some((item) => item.approverId === approverId)) {
        return res.status(409).json({ success: false, error: 'Approver has already approved this proposal' });
      }

      const updated = await policyApprovalStore.updatePolicyApproval(proposalId, (current) => ({
        ...current,
        approvals: [
          ...(Array.isArray(current.approvals) ? current.approvals : []),
          {
            approverId,
            at: new Date().toISOString(),
            note
          }
        ]
      }));

      await policyAdminAuditStore.appendPolicyAdminAuditEvent({
        at: new Date().toISOString(),
        actor: approverId,
        action: 'policy_change_approved',
        proposalId,
        proposalAction: updated.action,
        approvals: updated.approvals.length,
        requiredApprovals: updated.requiredApprovals
      });

      if (updated.approvals.length < updated.requiredApprovals) {
        return res.status(202).json({
          success: true,
          message: 'Approval recorded; awaiting additional approvals',
          proposalId,
          approvals: updated.approvals.length,
          requiredApprovals: updated.requiredApprovals,
          status: 'pending'
        });
      }

      let execution;
      if (updated.action === 'policy_matrix_update') {
        execution = await executePolicyMatrixUpdate({
          actor: updated.actor || approverId,
          reason: updated.reason || '',
          replace: Boolean(updated.payload && updated.payload.replace),
          matrix: (updated.payload && updated.payload.matrix) || {}
        });
      } else if (updated.action === 'policy_matrix_restore') {
        execution = await executePolicySnapshotRestore({
          actor: updated.actor || approverId,
          reason: updated.reason || '',
          snapshotId: updated.payload && updated.payload.snapshotId
        });
      } else {
        return res.status(400).json({ success: false, error: 'Unsupported proposal action' });
      }

      await policyApprovalStore.updatePolicyApproval(proposalId, (current) => ({
        ...current,
        status: 'executed',
        executedAt: new Date().toISOString(),
        execution
      }));

      await policyAdminAuditStore.appendPolicyAdminAuditEvent({
        at: new Date().toISOString(),
        actor: approverId,
        action: 'policy_change_executed',
        proposalId,
        proposalAction: updated.action,
        approvals: updated.approvals.length,
        requiredApprovals: updated.requiredApprovals
      });

      return res.json({
        success: true,
        message: 'Proposal executed after reaching approval threshold',
        proposalId,
        approvals: updated.approvals.length,
        requiredApprovals: updated.requiredApprovals,
        status: 'executed',
        execution
      });
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({ success: false, error: 'Snapshot not found' });
      }
      console.error('portals/policy-approvals/:proposalId/approve error', err);
      return res.status(500).json({ success: false, error: 'Failed to approve policy change proposal' });
    }
  }
);

app.get('/portals/policy-admin/audit', requireApiKey, requirePolicyAdminAccess, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || 50);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 50));
    const events = await policyAdminAuditStore.readPolicyAdminAuditEvents();
    const sliced = events.slice(-limit);
    return res.json({ success: true, count: sliced.length, events: sliced });
  } catch (err) {
    console.error('portals/policy-admin/audit error', err);
    return res.status(500).json({ success: false, error: 'Failed to read policy admin audit events' });
  }
});

app.get('/portals/policy-admin/audit/export', requireApiKey, requirePolicyAdminAccess, async (req, res) => {
  try {
    const format = String(req.query.format || 'json').toLowerCase();
    const events = await policyAdminAuditStore.readPolicyAdminAuditEvents();
    const exported = buildAuditChainExport('policy-admin-audit', events);

    if (format === 'ndjson') {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      return res.status(200).send(toNdjson(exported.entries));
    }

    return res.json({ success: true, export: exported });
  } catch (err) {
    console.error('portals/policy-admin/audit/export error', err);
    return res.status(500).json({ success: false, error: 'Failed to export policy admin audit events' });
  }
});

app.get('/portals/access-audit/alerts', requireApiKey, requirePolicyAdminAccess, async (req, res) => {
  try {
    const thresholdRaw = Number(req.query.threshold || process.env.PORTAL_DENY_ALERT_THRESHOLD || 10);
    const windowRaw = Number(req.query.windowMinutes || process.env.PORTAL_DENY_ALERT_WINDOW_MINUTES || 60);
    const threshold = Math.max(1, Math.min(10000, Number.isFinite(thresholdRaw) ? thresholdRaw : 10));
    const windowMinutes = Math.max(1, Math.min(60 * 24 * 14, Number.isFinite(windowRaw) ? windowRaw : 60));

    const events = await portalAccessAuditStore.readAuditEvents();
    const alerts = summarizeDenyAlerts(events, threshold, windowMinutes);
    return res.json({
      success: true,
      threshold,
      windowMinutes,
      alerts,
      alertCount: alerts.length
    });
  } catch (err) {
    console.error('portals/access-audit/alerts error', err);
    return res.status(500).json({ success: false, error: 'Failed to generate access audit alerts' });
  }
});

app.get('/portals/access-audit/export', requireApiKey, requirePolicyAdminAccess, async (req, res) => {
  try {
    const events = await portalAccessAuditStore.readAuditEvents();
    const exported = buildAuditChainExport('portal-access-audit', events);
    return res.json({ success: true, export: exported });
  } catch (err) {
    console.error('portals/access-audit/export error', err);
    return res.status(500).json({ success: false, error: 'Failed to export access audit events' });
  }
});

app.get('/portals/access-audit', requireApiKey, async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || 50);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 50));
    const decision = req.query.decision ? String(req.query.decision).toLowerCase() : '';
    const covenant = req.query.covenant ? String(req.query.covenant).toLowerCase() : '';
    const policyKey = req.query.policyKey ? String(req.query.policyKey).toLowerCase() : '';
    const userId = req.query.userId ? String(req.query.userId).toLowerCase() : '';
    const format = req.query.format ? String(req.query.format).toLowerCase() : 'json';

    const events = await portalAccessAuditStore.readAuditEvents();
    const filtered = events.filter((evt) => {
      if (decision && String(evt.decision || '').toLowerCase() !== decision) return false;
      if (covenant && String(evt.covenant || '').toLowerCase() !== covenant) return false;
      if (policyKey && String(evt.policyKey || '').toLowerCase() !== policyKey) return false;
      if (userId && String(evt.userId || '').toLowerCase() !== userId) return false;
      return true;
    });
    const sliced = filtered.slice(-limit);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return res.status(200).send(toAccessAuditCsv(sliced));
    }

    return res.json({
      success: true,
      count: sliced.length,
      filters: {
        decision: decision || null,
        covenant: covenant || null,
        policyKey: policyKey || null,
        userId: userId || null
      },
      events: sliced
    });
  } catch (err) {
    console.error('portals/access-audit error', err);
    return res.status(500).json({ success: false, error: 'Failed to read access audit events' });
  }
});

app.post('/embeddings/upsert',
  requireApiKey,
  body('id').isString().notEmpty(),
  body('text').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const item = await vectorStore.upsertEmbedding(req.body.id, req.body.text, req.body.metadata || {});
      return res.status(201).json({ success: true, item });
    } catch (err) {
      console.error('embeddings upsert error', err);
      return res.status(500).json({ success: false, error: 'Embedding upsert failed' });
    }
  }
);

app.post('/embeddings/query',
  publicRateLimit,
  body('text').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const matches = await vectorStore.queryEmbeddings(req.body.text, req.body.limit || 5);
      return res.json({ success: true, matches });
    } catch (err) {
      console.error('embeddings query error', err);
      return res.status(500).json({ success: false, error: 'Embedding query failed' });
    }
  }
);

app.post('/ai/chat',
  publicRateLimit,
  body('userId').isString().notEmpty(),
  body('message').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const profile = await profileDb.getProfile(req.body.userId);
      const result = await chatGuide.respond({ userId: req.body.userId, message: req.body.message, profile });
      return res.json({ success: true, result });
    } catch (err) {
      console.error('ai chat error', err);
      return res.status(500).json({ success: false, error: 'Chat guide failed' });
    }
  }
);

/**
 * POST /flow/mint
 * High-level flow: fetch profile, generate + verify ZK proof, then mint SBT (simulated)
 */
app.post('/flow/mint',
  requireApiKey,
  body('userId').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    try {
      const { userId, mintOptions } = req.body || {};
      if (flowMintLocks.has(userId)) {
        return res.status(409).json({ success: false, error: 'Mint already in progress for this user' });
      }
      flowMintLocks.add(userId);
      // Fetch profile
      const profile = await profileDb.getProfile(userId);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });

      if (profile.mintStatus === 'submitted' || profile.mintStatus === 'confirmed' || profile.mintedTxHash) {
        return res.status(409).json({ success: false, error: 'Profile already minted or mint already submitted' });
      }

      if (profile.verificationStatus && profile.verificationStatus !== 'approved') {
        return res.status(400).json({ success: false, error: 'Profile not yet approved for minting' });
      }
      // Generate ZK proof
      const proof = await zkProof.generateOver18Proof(userId, profile);
      // Verify on-chain
      const verifyResult = await onchainVerifier.verifyOnChain(proof);
      if (!verifyResult.verified) return res.status(400).json({ success: false, error: 'On-chain verification failed', verifyResult });
      // Mint SBT
      const result = await agent.handleMint(userId, mintOptions);
      if (result && result.status === 'submitted') {
        const updatedProfile = await profileDb.patchProfile(userId, {
          mintStatus: 'submitted',
          mintedTxHash: result.tx_hash || null,
          mintedSubmittedAt: new Date().toISOString()
        });

        const summary = await verificationStore.getVerificationSummary(userId);

        const trust = await trustScoreStore.applyTrustPolicy(
          userId,
          {
            verificationStatus: updatedProfile.verificationStatus || 'approved',
            endorsementsCount: summary.approvedEndorsements,
            documentChecksCount: summary.approvedDocumentChecks,
            mutualVerificationsCount: summary.approvedMutualVerifications,
            rejectedDocumentChecks: summary.rejectedDocumentChecks,
            verifierSubmissionsCount: Array.isArray(updatedProfile.verifierSubmissions) ? updatedProfile.verifierSubmissions.length : 0,
            hasMinted: true,
            minBronzeScore: ONBOARDING_BRONZE_SCORE
          },
          'mint-submitted-policy'
        );

        await profileDb.patchProfile(userId, {
          trustScore: trust.score,
          trustLevel: trust.level
        });

        return res.json({ success: true, result, verifyResult, trust });
      }
      return res.status(400).json({ success: false, result, verifyResult });
    } catch (err) {
      console.error('flow/mint error', err);
      res.status(500).json({ success: false, error: 'Flow error' });
    } finally {
      if (req.body && req.body.userId) {
        flowMintLocks.delete(req.body.userId);
      }
    }
  }
);

const PORT = process.env.PORT || 3003;
const startupReport = startupChecklist();
printStartupChecklist(startupReport);
if (process.env.STARTUP_STRICT === '1' && startupReport.hasFail) {
  console.error('STARTUP_STRICT=1 and one or more startup checks failed. Exiting.');
  process.exit(1);
}

const server = app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});

// Graceful shutdown — drain in-flight requests before exiting on SIGTERM (Render rolling deploy)
process.on('SIGTERM', () => {
  console.log('SIGTERM received — closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    const pgPool = require('./tools/pgPool');
    if (pgPool) pgPool.end(() => process.exit(0));
    else process.exit(0);
  });
});

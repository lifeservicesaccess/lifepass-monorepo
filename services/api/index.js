const express = require('express');
const { ethers } = require('ethers');
const onchainVerifier = require('./tools/onchainVerifier');
const profileDb = require('./tools/profileDb');
const zkProof = require('./tools/zkProof');
const walletTool = require('./tools/wallet');
const trustScoreStore = require('./tools/trustScoreStore');
const verificationStore = require('./tools/verificationStore');
const storageTool = require('./tools/storage');
const profileMediaStore = require('./tools/profileMediaStore');
const vectorStore = require('./tools/vectorStore');
const chatGuide = require('./tools/chatGuide');
const { createPortalRouter } = require('./portals/router');
const { loadApiEnv } = require('./tools/loadEnv');

loadApiEnv();

/**
 * Simple REST API for interacting with the LifePass smart contract and zk‑proof verifier.  This
 * server exposes endpoints to submit an age proof and to mint an SBT.  In a production
 * deployment the RPC URL, private key, and contract addresses should be stored in a secure
 * secret manager rather than environment variables.
 */
const app = express();
app.use(express.json());

const { body, validationResult } = require('express-validator');

// Load environment variables
const RPC_URL = process.env.RPC_URL || "https://rpc-mumbai.maticvigil.com"; // default to Polygon Mumbai
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SBT_CONTRACT_ADDRESS = process.env.SBT_CONTRACT_ADDRESS;
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

function isValidPrivateKey(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function startupChecklist() {
  const isProd = process.env.NODE_ENV === 'production';
  const hasRpc = Boolean(RPC_URL);
  const hasPk = Boolean(PRIVATE_KEY);
  const hasSbtAddress = Boolean(SBT_CONTRACT_ADDRESS);
  const blockchainReady = hasRpc && hasPk && hasSbtAddress;
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
      status: process.env.API_KEY ? 'pass' : (isProd ? 'warn' : 'warn'),
      detail: process.env.API_KEY ? 'protected endpoints require x-api-key' : 'not set; protected endpoints are open'
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
      check: 'AGE_VERIFIER_ADDRESS format',
      status: AGE_VERIFIER_ADDRESS ? (ethers.isAddress(AGE_VERIFIER_ADDRESS) ? 'pass' : 'fail') : 'warn',
      detail: AGE_VERIFIER_ADDRESS ? (ethers.isAddress(AGE_VERIFIER_ADDRESS) ? 'valid address format' : 'invalid address format') : 'optional; not set'
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
 * POST /proof/submit
 * Receive a zkSNARK proof for the over-18 predicate and verify it through the shared
 * verification utility. If verifier contract config is absent, this falls back to local
 * deterministic verification.
 */
app.post('/proof/submit', async (req, res) => {
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
app.post('/sbt/mint', async (req, res) => {
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
        error: 'On-chain mint failed',
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
    res.status(500).json({ success: false, error: 'Error minting token', reason: parseEvmError(err) });
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

app.use('/portals', createPortalRouter());

app.post('/onboarding/signup',
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
        biometric
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
      return res.status(201).json({ success: true, profile, trust });
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

app.get('/onboarding/media/:userId', async (req, res) => {
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

app.get('/verifications/:userId', async (req, res) => {
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

app.get('/trust/:userId', async (req, res) => {
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

app.get('/users/:userId/dashboard', async (req, res) => {
  try {
    const profile = await profileDb.getProfile(req.params.userId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const trust = await trustScoreStore.getTrustScore(req.params.userId);
    return res.json({ success: true, profile, trust });
  } catch (err) {
    console.error('dashboard error', err);
    return res.status(500).json({ success: false, error: 'Dashboard lookup failed' });
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

app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});

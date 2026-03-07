const express = require('express');
const { ethers } = require('ethers');
const onchainVerifier = require('./tools/onchainVerifier');
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
    const { to, tokenId, metadata } = req.body;
    if (!to || !tokenId || !metadata) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
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

    const tx = await sbtContract.mint(to, tokenId, metadata);
    await tx.wait();
    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error minting token' });
  }
});

// Integrate PurposeGuide agent with mock tools
const PurposeGuide = require('../../agents/purpose_guide_agent');
const profileDb = require('./tools/profileDb');
const zkProof = require('./tools/zkProof');
const walletTool = require('./tools/wallet');

const agent = new PurposeGuide(profileDb, zkProof, walletTool);

// Simple API key middleware (set API_KEY env var to enable)
function requireApiKey(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next(); // no enforcement if not configured
  const provided = req.header('x-api-key');
  if (!provided || provided !== apiKey) return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
}

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
      // Fetch profile
      const profile = await profileDb.getProfile(userId);
      if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
      // Generate ZK proof
      const proof = await zkProof.generateOver18Proof(userId, profile);
      // Verify on-chain
      const verifyResult = await onchainVerifier.verifyOnChain(proof);
      if (!verifyResult.verified) return res.status(400).json({ success: false, error: 'On-chain verification failed', verifyResult });
      // Mint SBT
      const result = await agent.handleMint(userId, mintOptions);
      if (result && result.status === 'submitted') return res.json({ success: true, result, verifyResult });
      return res.status(400).json({ success: false, result, verifyResult });
    } catch (err) {
      console.error('flow/mint error', err);
      res.status(500).json({ success: false, error: 'Flow error' });
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

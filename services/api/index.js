const express = require('express');
const { ethers } = require('ethers');

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
const PRIVATE_KEY = process.env.PRIVATE_KEY; // private key used for signing transactions
const SBT_CONTRACT_ADDRESS = process.env.SBT_CONTRACT_ADDRESS;
const AGE_VERIFIER_ADDRESS = process.env.AGE_VERIFIER_ADDRESS;

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

/**
 * POST /proof/submit
 * Receive a zkSNARK proof for the over‑18 predicate.  This endpoint would normally verify
 * the proof on‑chain (via an AgeVerifier contract) or off‑chain using snarkjs.  For now we
 * simulate verification and return success=true if the proof payload contains a field
 * `is_over_18` equal to 1.
 */
app.post('/proof/submit', async (req, res) => {
  try {
    const { proof, publicSignals } = req.body;
    // TODO: Use snarkjs or call the AgeVerifier contract via ethers to verify the proof.
    const isOver18 = publicSignals && Number(publicSignals.is_over_18) === 1;
    if (!isOver18) {
      return res.status(400).json({ success: false, error: 'Proof indicates user is under 18' });
    }
    // If integrated with a verifier contract: await verifierContract.verifyProof(proof, publicSignals);
    res.json({ success: true, message: 'Proof verified' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error verifying proof' });
  }
});

// POST /proof/verify-onchain
const onchainVerifier = require('./tools/onchainVerifier');
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
    if (!sbtContract) {
      return res.status(500).json({ success: false, error: 'SBT contract not configured' });
    }
    const { to, tokenId, metadata } = req.body;
    if (!to || !tokenId || !metadata) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
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

const onchainVerifier = require('./tools/onchainVerifier');
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
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});

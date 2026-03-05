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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});

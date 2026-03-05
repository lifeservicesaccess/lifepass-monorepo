const { ethers } = require('ethers');
const zkProof = require('./zkProof');

async function verifyOnChain(proofObj) {
  // If an AGE_VERIFIER_ADDRESS and RPC are configured, attempt on-chain verification.
  const RPC_URL = process.env.RPC_URL;
  const AGE_VERIFIER_ADDRESS = process.env.AGE_VERIFIER_ADDRESS;
  if (!RPC_URL || !AGE_VERIFIER_ADDRESS) {
    // Fallback to local (simulated) verification
    return { onchain: false, verified: await zkProof.verifyProof(proofObj), reason: 'verifier not configured' };
  }

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    // Minimal verifier ABI: assume a `verifyProof(bytes proof, uint256[] publicSignals) returns (bool)` method
    const ABI = [ 'function verifyProof(bytes proof, uint256[] publicSignals) public view returns (bool)' ];
    const verifier = new ethers.Contract(AGE_VERIFIER_ADDRESS, ABI, provider);

    // Ensure proof format: if proofObj.proof is object/string, pass bytes; same for publicSignals
    const proof = typeof proofObj.proof === 'string' ? ethers.toUtf8Bytes(proofObj.proof) : proofObj.proof;
    let publicSignals = [];
    if (proofObj.publicSignals) {
      if (Array.isArray(proofObj.publicSignals)) publicSignals = proofObj.publicSignals.map(n => BigInt(n));
      else if (typeof proofObj.publicSignals === 'object') {
        // Map from keys to values
        publicSignals = Object.values(proofObj.publicSignals).map(n => BigInt(n));
      }
    }

    const ok = await verifier.verifyProof(proof, publicSignals);
    return { onchain: true, verified: Boolean(ok) };
  } catch (err) {
    return { onchain: false, verified: false, error: err.message || String(err) };
  }
}

module.exports = { verifyOnChain };

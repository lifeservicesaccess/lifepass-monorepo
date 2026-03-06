const { ethers } = require('ethers');
const zkProof = require('./zkProof');

function normalizeProofBytes(proof) {
  if (proof == null) {
    throw new Error('Missing proof payload');
  }

  // Already bytes-like (Uint8Array, Buffer, etc.)
  if (proof instanceof Uint8Array) {
    return proof;
  }

  // Hex string bytes payload (preferred for on-chain verifier calls)
  if (typeof proof === 'string') {
    if (ethers.isHexString(proof)) {
      return proof;
    }
    throw new Error('Invalid proof format: expected hex bytes string (0x...) or Uint8Array');
  }

  // Array of byte values
  if (Array.isArray(proof)) {
    if (proof.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
      throw new Error('Invalid proof byte array: values must be integers in [0,255]');
    }
    return Uint8Array.from(proof);
  }

  throw new Error('Invalid proof format: expected hex bytes string, Uint8Array, or byte array');
}

function toUint256BigInt(value) {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new Error('publicSignals value must be >= 0');
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('publicSignals number values must be non-negative integers');
    }
    return BigInt(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) throw new Error('publicSignals string values must be non-empty');

    const isHex = /^0x[0-9a-fA-F]+$/.test(trimmed);
    const isDec = /^[0-9]+$/.test(trimmed);
    if (!isHex && !isDec) {
      throw new Error('publicSignals string values must be decimal or 0x-prefixed hex');
    }

    const asBigInt = BigInt(trimmed);
    if (asBigInt < 0n) throw new Error('publicSignals value must be >= 0');
    return asBigInt;
  }

  throw new Error('publicSignals values must be bigint, number, or numeric string');
}

function normalizePublicSignals(publicSignals) {
  if (publicSignals == null) {
    throw new Error('Missing publicSignals payload');
  }

  if (Array.isArray(publicSignals)) {
    return publicSignals.map((v) => toUint256BigInt(v));
  }

  // Allow object input for compatibility; sort keys for deterministic ordering.
  if (typeof publicSignals === 'object') {
    const keys = Object.keys(publicSignals).sort((a, b) => a.localeCompare(b));
    return keys.map((k) => toUint256BigInt(publicSignals[k]));
  }

  throw new Error('Invalid publicSignals format: expected array or object');
}

async function verifyOnChain(proofObj) {
  // Validate payload shape and types up-front so fallback/local verification enforces
  // the same input contract as on-chain calls.
  try {
    normalizeProofBytes(proofObj && proofObj.proof);
    normalizePublicSignals(proofObj && proofObj.publicSignals);
  } catch (err) {
    return { onchain: false, verified: false, error: err.message || String(err) };
  }

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

    const proof = normalizeProofBytes(proofObj && proofObj.proof);
    const publicSignals = normalizePublicSignals(proofObj && proofObj.publicSignals);

    const ok = await verifier.verifyProof(proof, publicSignals);
    return { onchain: true, verified: Boolean(ok) };
  } catch (err) {
    return { onchain: false, verified: false, error: err.message || String(err) };
  }
}

module.exports = {
  verifyOnChain,
  // Export helpers for direct unit tests and validation scripts.
  normalizeProofBytes,
  normalizePublicSignals
};

// ZK proof tool: prefer snarkjs when enabled, otherwise simulate
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

let snarkjs = null;
try { snarkjs = require('snarkjs'); } catch (e) { /* optional */ }

let cachedVKey = null;

function _isSnarkJsEnabled() {
  return snarkjs && process.env.USE_SNARKJS === '1';
}

function _resolveArtifactPath(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

async function _getVerificationKey() {
  if (cachedVKey) return cachedVKey;
  const vkeyPath = _resolveArtifactPath(process.env.SNARK_VKEY_PATH);
  if (!vkeyPath) throw new Error('SNARK_VKEY_PATH is required when USE_SNARKJS=1');
  const raw = await fs.readFile(vkeyPath, 'utf8');
  cachedVKey = JSON.parse(raw);
  return cachedVKey;
}

function _buildInput(profile) {
  const birthYear = profile && profile.dob ? Number(new Date(profile.dob).getFullYear()) : 0;
  const currentYear = Number(new Date().getFullYear());
  return {
    birth_year: birthYear,
    current_year: currentYear
  };
}

function _simulatedProofHex(userId, age) {
  const digest = crypto
    .createHash('sha256')
    .update(`${userId || 'anon'}:${age}:${Date.now()}`)
    .digest('hex');
  return `0x${digest}`;
}

function _jsonToHex(obj) {
  return `0x${Buffer.from(JSON.stringify(obj), 'utf8').toString('hex')}`;
}

function _hexToJson(hex) {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Expected 0x-prefixed hex proof payload');
  }
  const json = Buffer.from(hex.slice(2), 'hex').toString('utf8');
  return JSON.parse(json);
}

function _ageFromDob(dob) {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

async function generateOver18Proof(userId, profile) {
  const age = profile && profile.dob ? _ageFromDob(profile.dob) : 0;

  if (_isSnarkJsEnabled()) {
    const wasmPath = _resolveArtifactPath(process.env.SNARK_WASM_PATH);
    const zkeyPath = _resolveArtifactPath(process.env.SNARK_ZKEY_PATH);
    if (!wasmPath || !zkeyPath) {
      throw new Error('SNARK_WASM_PATH and SNARK_ZKEY_PATH are required when USE_SNARKJS=1');
    }

    const input = _buildInput(profile);
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    return {
      // Keep the transport proof bytes-like for API and verifier compatibility.
      proof: _jsonToHex(proof),
      publicSignals
    };
  }

  // Fallback simulated proof
  return {
    proof: _simulatedProofHex(userId, age),
    publicSignals: { is_over_18: age >= 18 ? 1 : 0 }
  };
}

async function verifyProof(proofObj) {
  if (_isSnarkJsEnabled()) {
    try {
      const verificationKey = await _getVerificationKey();
      const decodedProof = typeof proofObj.proof === 'string' ? _hexToJson(proofObj.proof) : proofObj.proof;
      return await snarkjs.groth16.verify(verificationKey, proofObj.publicSignals, decodedProof);
    } catch (err) {
      return false;
    }
  }

  // Fallback simulated verification
  return proofObj && proofObj.publicSignals && Number(proofObj.publicSignals.is_over_18) === 1;
}

module.exports = { generateOver18Proof, verifyProof };

// ZK proof tool: prefer snarkjs when enabled, otherwise simulate
let snarkjs = null;
try { snarkjs = require('snarkjs'); } catch (e) { /* optional */ }

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
  // If snarkjs is available and USE_SNARKJS env var is set, a real proof could be generated here.
  if (snarkjs && process.env.USE_SNARKJS === '1') {
    // Placeholder: real proof generation requires circuits and witness creation.
    // Return a wrapper object that a verifier can check with snarkjs.
    return { proof: 'SNARKJS_PLACEHOLDER', publicSignals: { is_over_18: age >= 18 ? 1 : 0 } };
  }
  // Fallback simulated proof
  return { proof: 'SIMULATED_PROOF', publicSignals: { is_over_18: age >= 18 ? 1 : 0 } };
}

async function verifyProof(proofObj) {
  if (snarkjs && process.env.USE_SNARKJS === '1') {
    // Real verification would use snarkjs.groth16.verify(...) or similar.
    // This is a placeholder that assumes proofObj.publicSignals present.
    try {
      return proofObj && proofObj.publicSignals && Number(proofObj.publicSignals.is_over_18) === 1;
    } catch (err) {
      return false;
    }
  }
  // Fallback simulated verification
  return proofObj && proofObj.publicSignals && Number(proofObj.publicSignals.is_over_18) === 1;
}

module.exports = { generateOver18Proof, verifyProof };

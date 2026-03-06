const test = require('node:test');
const assert = require('node:assert/strict');

const zkProof = require('../tools/zkProof');

test('generateOver18Proof returns bytes-like simulated proof and over-18 signal', async () => {
  const out = await zkProof.generateOver18Proof('user-123', { dob: '2000-01-01' });
  assert.equal(typeof out.proof, 'string');
  assert.match(out.proof, /^0x[0-9a-fA-F]+$/);
  assert.equal(Number(out.publicSignals.is_over_18), 1);
});

test('verifyProof fallback accepts over-18 signal and rejects under-18 signal', async () => {
  const ok = await zkProof.verifyProof({ proof: '0x1234', publicSignals: { is_over_18: 1 } });
  const bad = await zkProof.verifyProof({ proof: '0x1234', publicSignals: { is_over_18: 0 } });

  assert.equal(ok, true);
  assert.equal(bad, false);
});

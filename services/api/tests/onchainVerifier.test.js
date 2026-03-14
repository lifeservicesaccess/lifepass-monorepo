const test = require('node:test');
const assert = require('node:assert/strict');

const {
  verifyOnChain,
  normalizeProofBytes,
  normalizePublicSignals
} = require('../tools/onchainVerifier');

test('normalizeProofBytes accepts hex strings', () => {
  assert.equal(normalizeProofBytes('0x1234'), '0x1234');
});

test('normalizeProofBytes accepts Uint8Array', () => {
  const bytes = Uint8Array.from([1, 2, 3]);
  assert.deepEqual(normalizeProofBytes(bytes), bytes);
});

test('normalizeProofBytes accepts byte arrays', () => {
  const out = normalizeProofBytes([0, 15, 255]);
  assert.ok(out instanceof Uint8Array);
  assert.deepEqual(Array.from(out), [0, 15, 255]);
});

test('normalizeProofBytes rejects plain strings', () => {
  assert.throws(
    () => normalizeProofBytes('SIMULATED_PROOF'),
    /Invalid proof format/
  );
});

test('normalizePublicSignals converts mixed numeric values to BigInt', () => {
  const out = normalizePublicSignals(['1', '0x2', 3, 4n]);
  assert.deepEqual(out, [1n, 2n, 3n, 4n]);
});

test('normalizePublicSignals object input is deterministic by sorted keys', () => {
  const out = normalizePublicSignals({ z: '3', a: '1', b: '2' });
  assert.deepEqual(out, [1n, 2n, 3n]);
});

test('normalizePublicSignals rejects invalid and negative values', () => {
  assert.throws(() => normalizePublicSignals(['-1']), /decimal or 0x-prefixed hex|>= 0/);
  assert.throws(() => normalizePublicSignals(['abc']), /decimal or 0x-prefixed hex/);
});

test('normalizePublicSignals rejects unsupported payload shapes', () => {
  assert.throws(() => normalizePublicSignals(null), /Missing publicSignals payload/);
  assert.throws(() => normalizePublicSignals('1'), /Invalid publicSignals format/);
});

test('verifyOnChain blocks local fallback in production when verifier is missing', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevRpc = process.env.RPC_URL;
  const prevVerifier = process.env.AGE_VERIFIER_ADDRESS;

  process.env.NODE_ENV = 'production';
  process.env.RPC_URL = '';
  process.env.AGE_VERIFIER_ADDRESS = '';

  try {
    const result = await verifyOnChain({ proof: '0x1234', publicSignals: { is_over_18: 1 } });
    assert.equal(result.onchain, false);
    assert.equal(result.verified, false);
    assert.match(String(result.reason || ''), /verifier not configured in production/);
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    process.env.RPC_URL = prevRpc;
    process.env.AGE_VERIFIER_ADDRESS = prevVerifier;
  }
});

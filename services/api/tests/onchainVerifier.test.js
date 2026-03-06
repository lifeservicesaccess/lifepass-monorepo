const test = require('node:test');
const assert = require('node:assert/strict');

const {
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

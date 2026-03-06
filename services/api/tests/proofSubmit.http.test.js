const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');

const API_PORT = 3013;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const API_CWD = __dirname + '/..';

function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      `${API_BASE}${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (err) {
            return reject(err);
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function startApiServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['index.js'], {
      cwd: API_CWD,
      env: {
        ...process.env,
        PORT: String(API_PORT)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const startupTimeout = setTimeout(() => {
      reject(new Error('API server startup timed out'));
    }, 10000);

    child.stdout.on('data', (chunk) => {
      const out = chunk.toString();
      if (out.includes(`API server listening on port ${API_PORT}`)) {
        clearTimeout(startupTimeout);
        resolve(child);
      }
    });

    child.stderr.on('data', (chunk) => {
      // Keep stderr attached for easier debugging if startup fails.
      const out = chunk.toString();
      if (out.trim().length > 0) {
        // no-op, but intentionally consumed
      }
    });

    child.on('exit', (code) => {
      clearTimeout(startupTimeout);
      reject(new Error(`API server exited early with code ${code}`));
    });
  });
}

let serverProcess;

test.before(async () => {
  serverProcess = await startApiServer();
});

test.after(() => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

test('POST /proof/submit returns 400 for missing proof/publicSignals payload fields', async () => {
  const res = await postJson('/proof/submit', { proof: '0x1234' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, {
    success: false,
    error: 'Missing proof or publicSignals'
  });
});

test('POST /proof/submit returns 400 for malformed proof format', async () => {
  const res = await postJson('/proof/submit', {
    proof: 'SIMULATED_PROOF',
    publicSignals: { is_over_18: 1 }
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'Proof verification failed');
  assert.equal(res.body.verifyResult.verified, false);
  assert.match(res.body.verifyResult.error, /Invalid proof format/);
});

test('POST /proof/submit returns 200 for valid proof payload and over-18 signal', async () => {
  const res = await postJson('/proof/submit', {
    proof: '0x1234',
    publicSignals: { is_over_18: 1 }
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'Proof verified');

  assert.ok(res.body.verifyResult);
  assert.equal(typeof res.body.verifyResult.onchain, 'boolean');
  assert.equal(res.body.verifyResult.verified, true);

  // Semantic contract:
  // - fallback mode: onchain=false and includes human-readable reason, no error
  // - on-chain mode: onchain=true and no reason/error fields required
  if (res.body.verifyResult.onchain === false) {
    assert.equal(typeof res.body.verifyResult.reason, 'string');
    assert.ok(res.body.verifyResult.reason.length > 0);
    assert.ok(!('error' in res.body.verifyResult));
  } else {
    assert.ok(!('reason' in res.body.verifyResult));
    assert.ok(!('error' in res.body.verifyResult));
  }
});

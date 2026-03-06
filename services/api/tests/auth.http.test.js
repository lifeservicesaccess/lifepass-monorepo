const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');

const API_PORT = 3015;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const API_CWD = __dirname + '/..';
const API_KEY = 'test-api-key-123';

function postJson(path, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      `${API_BASE}${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers
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
        PORT: String(API_PORT),
        API_KEY
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

test('POST /flow/mint returns 401 without API key', async () => {
  const res = await postJson('/flow/mint', { userId: 'user-123' });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { success: false, error: 'Unauthorized' });
});

test('POST /flow/mint accepts API key and proceeds to business logic', async () => {
  const res = await postJson(
    '/flow/mint',
    { userId: 'missing-user-for-auth-test' },
    { 'x-api-key': API_KEY }
  );

  // With auth satisfied, route should continue and return domain response (not auth error).
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { success: false, error: 'Profile not found' });
});

test('POST /proof/verify-onchain returns 401 without API key', async () => {
  const res = await postJson('/proof/verify-onchain', {
    proof: '0x1234',
    publicSignals: { is_over_18: 1 }
  });

  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { success: false, error: 'Unauthorized' });
});

test('POST /proof/verify-onchain accepts API key and returns verifier result', async () => {
  const res = await postJson(
    '/proof/verify-onchain',
    { proof: '0x1234', publicSignals: { is_over_18: 1 } },
    { 'x-api-key': API_KEY }
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.result);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');

const profileDb = require('../tools/profileDb');

const API_PORT = 3014;
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

    child.on('exit', (code) => {
      clearTimeout(startupTimeout);
      reject(new Error(`API server exited early with code ${code}`));
    });
  });
}

let serverProcess;

test.before(async () => {
  await profileDb.upsertProfile('user-over18-test', {
    userId: 'user-over18-test',
    name: 'Flow Test User',
    dob: '1990-01-01',
    email: 'flow@example.com'
  });

  await profileDb.upsertProfile('user-under18-test', {
    userId: 'user-under18-test',
    name: 'Flow Underage User',
    dob: '2012-01-01',
    email: 'underage@example.com'
  });

  serverProcess = await startApiServer();
});

test.after(() => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

test('POST /flow/mint returns 404 when profile is missing', async () => {
  const res = await postJson('/flow/mint', { userId: 'missing-user' });
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, {
    success: false,
    error: 'Profile not found'
  });
});

test('POST /flow/mint returns 200 and submitted result for eligible profile', async () => {
  const res = await postJson('/flow/mint', { userId: 'user-over18-test' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.result.status, 'submitted');
  assert.equal(typeof res.body.result.tx_hash, 'string');

  assert.ok(res.body.verifyResult);
  assert.equal(res.body.verifyResult.verified, true);
});

test('POST /flow/mint returns 409 when mint is attempted twice for same profile', async () => {
  const userId = `user-over18-repeat-${Date.now()}`;
  await profileDb.upsertProfile(userId, {
    userId,
    name: 'Flow Repeat User',
    dob: '1994-01-01',
    email: 'repeat@example.com',
    verificationStatus: 'approved'
  });

  const first = await postJson('/flow/mint', { userId });
  assert.equal(first.status, 200);
  assert.equal(first.body.success, true);

  const second = await postJson('/flow/mint', { userId });
  assert.equal(second.status, 409);
  assert.deepEqual(second.body, {
    success: false,
    error: 'Profile already minted or mint already submitted'
  });
});

test('POST /flow/mint returns 400 for under-18 profile', async () => {
  const res = await postJson('/flow/mint', { userId: 'user-under18-test' });

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'On-chain verification failed');
  assert.ok(res.body.verifyResult);
  assert.equal(res.body.verifyResult.verified, false);
});

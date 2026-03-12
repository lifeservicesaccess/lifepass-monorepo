const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');

const API_PORT = 3016;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const API_CWD = __dirname + '/..';

function requestJson(path, method, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : '';
    const req = http.request(
      `${API_BASE}${path}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
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
    if (body) req.write(body);
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
        API_KEY: 'test-key'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timeout = setTimeout(() => reject(new Error('API startup timeout')), 10000);
    child.stdout.on('data', (chunk) => {
      const out = chunk.toString();
      if (out.includes(`API server listening on port ${API_PORT}`)) {
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`API exited early with code ${code}`));
    });
  });
}

let server;

test.before(async () => {
  server = await startApiServer();
});

test.after(() => {
  if (server && !server.killed) server.kill();
});

test('signup + verify + trust lookup works', async () => {
  const userId = `user-onboard-${Date.now()}`;
  const signup = await requestJson('/onboarding/signup', 'POST', {
    userId,
    name: 'Onboard User',
    purpose: 'Agri cooperative onboarding',
    skills: ['farming', 'supply-chain'],
    verificationDocs: ['doc://stub-id']
  });

  assert.equal(signup.status, 201);
  assert.equal(signup.body.success, true);
  assert.equal(signup.body.profile.verificationStatus, 'pending');

  const verify = await requestJson(
    '/onboarding/verify',
    'POST',
    { userId, status: 'approved' },
    { 'x-api-key': 'test-key' }
  );
  assert.equal(verify.status, 200);
  assert.equal(verify.body.success, true);
  assert.equal(verify.body.profile.verificationStatus, 'approved');

  const trust = await requestJson(`/trust/${userId}`, 'GET');
  assert.equal(trust.status, 200);
  assert.equal(trust.body.success, true);
  assert.equal(typeof trust.body.trust.score, 'number');
});

test('chat and portal stubs return recommendations and responses', async () => {
  const chat = await requestJson('/ai/chat', 'POST', {
    userId: `chat-user-${Date.now()}`,
    message: 'I need agri funding and farm support'
  });

  assert.equal(chat.status, 200);
  assert.equal(chat.body.success, true);
  assert.equal(chat.body.result.recommendedPortal, 'agri');

  const agriStatus = await requestJson('/portals/agri/status', 'GET');
  assert.equal(agriStatus.status, 200);
  assert.equal(agriStatus.body.success, true);
  assert.equal(agriStatus.body.portal, 'agri');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');

const API_PORT = 3017;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const API_CWD = __dirname + '/..';
const API_KEY = 'test-key-sso';

function requestJson(path, method = 'GET', payload = null, headers = {}) {
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
        API_KEY,
        LIFEPASS_SSO_JWT_SECRET: 'test-sso-secret',
        LIFEPASS_SSO_JWT_ISSUER: 'lifepass-api-test',
        LIFEPASS_SSO_DEFAULT_AUDIENCE: 'zionstack-portals'
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

test('POST /auth/sso/token issues signed token when authorized', async () => {
  const userId = `sso-user-${Date.now()}`;
  const issued = await requestJson(
    '/auth/sso/token',
    'POST',
    { userId, audience: 'portal-test', scope: ['portal:access', 'profile:read'] },
    { 'x-api-key': API_KEY }
  );

  assert.equal(issued.status, 201);
  assert.equal(issued.body.success, true);
  assert.equal(typeof issued.body.token, 'string');
  assert.equal(issued.body.audience, 'portal-test');
  assert.equal(issued.body.claims.lifePassId, userId);
});

test('POST /auth/sso/verify validates issued token', async () => {
  const userId = `sso-verify-${Date.now()}`;
  const issued = await requestJson(
    '/auth/sso/token',
    'POST',
    { userId, audience: 'portal-verify' },
    { 'x-api-key': API_KEY }
  );
  assert.equal(issued.status, 201);

  const verified = await requestJson('/auth/sso/verify', 'POST', {
    token: issued.body.token,
    audience: 'portal-verify'
  });

  assert.equal(verified.status, 200);
  assert.equal(verified.body.success, true);
  assert.equal(verified.body.verified.claims.lifePassId, userId);
});

test('GET /pass/qr and /pass/qr-payload return LifePass pass artifacts', async () => {
  const userId = `qr-user-${Date.now()}`;

  const payloadRes = await requestJson(`/pass/qr-payload/${userId}`, 'GET');
  assert.equal(payloadRes.status, 200);
  assert.equal(payloadRes.body.success, true);
  assert.equal(payloadRes.body.payload.lifePassId, userId);
  assert.ok(payloadRes.body.payload.trustLevel);

  const qrRes = await requestJson(`/pass/qr/${userId}`, 'GET');
  assert.equal(qrRes.status, 200);
  assert.equal(qrRes.body.success, true);
  assert.equal(qrRes.body.payload.lifePassId, userId);
  assert.ok(String(qrRes.body.qrDataUrl).startsWith('data:image/png;base64,'));
});

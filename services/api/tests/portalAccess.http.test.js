const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');

const API_PORT = 3018;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const API_CWD = __dirname + '/..';
const API_KEY = 'test-key-portal';

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

async function issueTokenForUser(userId, audience = 'zionstack-portals') {
  const issued = await requestJson(
    '/auth/sso/token',
    'POST',
    { userId, audience },
    { 'x-api-key': API_KEY }
  );
  assert.equal(issued.status, 201);
  return issued.body.token;
}

async function setTrust(userId, score) {
  const updated = await requestJson(
    `/trust/${userId}/update`,
    'POST',
    { score, reason: 'portal-access-test' },
    { 'x-api-key': API_KEY }
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.success, true);
}

let server;

test.before(async () => {
  server = await startApiServer();
});

test.after(() => {
  if (server && !server.killed) server.kill();
});

test('portal protected routes require bearer token', async () => {
  const withoutToken = await requestJson('/portals/agri/requests', 'POST', {
    userId: `portal-user-${Date.now()}`,
    requestType: 'inputs'
  });

  assert.equal(withoutToken.status, 401);
  assert.equal(withoutToken.body.success, false);
});

test('bronze can submit agri request but cannot list all requests', async () => {
  const userId = `portal-bronze-${Date.now()}`;
  await setTrust(userId, 35);
  const token = await issueTokenForUser(userId);

  const submit = await requestJson(
    '/portals/agri/requests',
    'POST',
    { userId, requestType: 'soil-support', details: 'Need advisory' },
    { Authorization: `Bearer ${token}` }
  );
  assert.equal(submit.status, 201);
  assert.equal(submit.body.success, true);

  const list = await requestJson('/portals/agri/requests', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(list.status, 403);
  assert.equal(list.body.success, false);
});

test('silver can access gated list and health age-gated services', async () => {
  const userId = `portal-silver-${Date.now()}`;
  await setTrust(userId, 70);
  const token = await issueTokenForUser(userId);

  const list = await requestJson('/portals/agri/requests', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(list.status, 200);
  assert.equal(list.body.success, true);

  const health = await requestJson('/portals/health/age-gated-services', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(health.status, 200);
  assert.equal(health.body.success, true);
  assert.equal(health.body.identity.userId, userId);
});

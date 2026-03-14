const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const API_PORT = 3018;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const API_CWD = __dirname + '/..';
const API_KEY = 'test-key-portal';
const AUDIT_FILE = path.join(API_CWD, '..', 'data', 'portal-access-audit.json');

function requestJson(path, method = 'GET', payload = null, headers = {}, baseUrl = API_BASE) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : '';
    const req = http.request(
      `${baseUrl}${path}`,
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

function requestRaw(path, method = 'GET', payload = null, headers = {}, baseUrl = API_BASE) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : '';
    const req = http.request(
      `${baseUrl}${path}`,
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
          resolve({ status: res.statusCode, body: raw, headers: res.headers });
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function startApiServer(port = API_PORT, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['index.js'], {
      cwd: API_CWD,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY,
        LIFEPASS_SSO_JWT_SECRET: 'test-sso-secret',
        LIFEPASS_SSO_JWT_ISSUER: 'lifepass-api-test',
        LIFEPASS_SSO_DEFAULT_AUDIENCE: 'zionstack-portals',
        ...extraEnv
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timeout = setTimeout(() => reject(new Error('API startup timeout')), 10000);
    child.stdout.on('data', (chunk) => {
      const out = chunk.toString();
      if (out.includes(`API server listening on port ${port}`)) {
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

async function issueTokenForUserAt(baseUrl, userId, audience = 'zionstack-portals') {
  const issued = await requestJson(
    '/auth/sso/token',
    'POST',
    { userId, audience },
    { 'x-api-key': API_KEY },
    baseUrl
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

async function setTrustAt(baseUrl, userId, score) {
  const updated = await requestJson(
    `/trust/${userId}/update`,
    'POST',
    { score, reason: 'portal-access-test' },
    { 'x-api-key': API_KEY },
    baseUrl
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.success, true);
}

let server;

test.before(async () => {
  await fs.mkdir(path.dirname(AUDIT_FILE), { recursive: true });
  await fs.writeFile(AUDIT_FILE, '[]', 'utf8');
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

test('policy matrix endpoint returns covenant policy config', async () => {
  const response = await requestJson('/portals/policy-matrix', 'GET', null, { 'x-api-key': API_KEY });
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.matrix.agri.createRequest.minTrustLevel, 'bronze');
  assert.equal(response.body.matrix.agri.listRequests.minTrustLevel, 'silver');
});

test('access decisions are recorded in portal audit log', async () => {
  const userId = `portal-audit-${Date.now()}`;
  await setTrust(userId, 70);
  const token = await issueTokenForUser(userId);

  const allow = await requestJson('/portals/commons/me', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(allow.status, 200);

  const deny = await requestJson('/portals/agri/requests', 'GET', null);
  assert.equal(deny.status, 401);

  const audit = await requestJson('/portals/access-audit?limit=20', 'GET', null, { 'x-api-key': API_KEY });
  assert.equal(audit.status, 200);
  assert.equal(audit.body.success, true);
  assert.ok(Array.isArray(audit.body.events));
  assert.ok(audit.body.events.length >= 2);
  const hasAllow = audit.body.events.some((evt) => evt.decision === 'allow');
  const hasDeny = audit.body.events.some((evt) => evt.decision === 'deny');
  assert.equal(hasAllow, true);
  assert.equal(hasDeny, true);
});

test('access audit supports filtering by decision and covenant', async () => {
  const userId = `portal-filter-${Date.now()}`;
  await setTrust(userId, 70);
  const token = await issueTokenForUser(userId);

  const allow = await requestJson('/portals/commons/me', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(allow.status, 200);

  const deny = await requestJson('/portals/agri/requests', 'GET', null);
  assert.equal(deny.status, 401);

  const filtered = await requestJson('/portals/access-audit?decision=deny&covenant=agri&limit=20', 'GET', null, {
    'x-api-key': API_KEY
  });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.success, true);
  assert.ok(Array.isArray(filtered.body.events));
  assert.ok(filtered.body.events.length >= 1);
  for (const evt of filtered.body.events) {
    assert.equal(evt.decision, 'deny');
    assert.equal(evt.covenant, 'agri');
  }
});

test('access audit supports CSV export format', async () => {
  const csv = await requestRaw('/portals/access-audit?format=csv&limit=5', 'GET', null, {
    'x-api-key': API_KEY
  });

  assert.equal(csv.status, 200);
  assert.match(String(csv.headers['content-type'] || ''), /text\/csv/);
  assert.match(csv.body, /at,method,path,covenant,policyKey,decision,status/);
});

test('policy matrix override can lower trust threshold via env config', async () => {
  const overridePort = 3019;
  const overrideBase = `http://127.0.0.1:${overridePort}`;
  const overrideMatrix = JSON.stringify({
    agri: {
      listRequests: { minTrustLevel: 'bronze', audience: 'zionstack-portals' }
    }
  });

  const overrideServer = await startApiServer(overridePort, {
    LIFEPASS_PORTAL_POLICY_JSON: overrideMatrix
  });

  try {
    const userId = `portal-override-${Date.now()}`;
    await setTrustAt(overrideBase, userId, 35);
    const token = await issueTokenForUserAt(overrideBase, userId);

    const list = await requestJson('/portals/agri/requests', 'GET', null, {
      Authorization: `Bearer ${token}`
    }, overrideBase);

    assert.equal(list.status, 200);
    assert.equal(list.body.success, true);
  } finally {
    if (!overrideServer.killed) overrideServer.kill();
  }
});

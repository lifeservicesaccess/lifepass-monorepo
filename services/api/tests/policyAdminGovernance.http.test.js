const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const jwt = require('jsonwebtoken');

const API_CWD = path.join(__dirname, '..');
const API_KEY = 'test-key-governance';
const POLICY_OVERRIDE_FILE = path.join(API_CWD, '..', 'data', 'portal-policy-overrides.json');
const POLICY_ADMIN_AUDIT_FILE = path.join(API_CWD, '..', 'data', 'portal-policy-admin-audit.json');
const POLICY_SNAPSHOT_FILE = path.join(API_CWD, '..', 'data', 'portal-policy-snapshots.json');
const POLICY_APPROVAL_FILE = path.join(API_CWD, '..', 'data', 'portal-policy-approvals.json');
const AUDIT_FILE = path.join(API_CWD, '..', 'data', 'portal-access-audit.json');

function requestJson(baseUrl, pathname, method = 'GET', payload = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : '';
    const req = http.request(
      `${baseUrl}${pathname}`,
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

function startApiServer(port, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['index.js'], {
      cwd: API_CWD,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        API_KEY,
        DATABASE_URL: '',
        PG_CONNECTION_STRING: '',
        POLICY_ADMIN_KEY: '',
        POLICY_ADMIN_KEYS_JSON: '',
        POLICY_ADMIN_ALLOWED_ACTORS: '',
        POLICY_ADMIN_JWT_SECRET: '',
        POLICY_ADMIN_JWT_ISSUER: '',
        POLICY_ADMIN_JWT_AUDIENCE: '',
        POLICY_ADMIN_REQUIRED_ROLE: 'policy_admin',
        REQUIRE_DURABLE_GOVERNANCE: '0',
        ALLOW_INSECURE_FILE_GOVERNANCE: '0',
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

test.before(async () => {
  await fs.mkdir(path.dirname(AUDIT_FILE), { recursive: true });
  await fs.writeFile(AUDIT_FILE, '[]', 'utf8');
  await fs.writeFile(POLICY_OVERRIDE_FILE, '{}', 'utf8');
  await fs.writeFile(POLICY_ADMIN_AUDIT_FILE, '[]', 'utf8');
  await fs.writeFile(POLICY_SNAPSHOT_FILE, '[]', 'utf8');
  await fs.writeFile(POLICY_APPROVAL_FILE, '[]', 'utf8');
});

test('rotated policy admin keys support key-id based admin access with actor allowlist', async () => {
  const port = 3027;
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = await startApiServer(port, {
    POLICY_ADMIN_KEY: '',
    POLICY_ADMIN_KEYS_JSON: JSON.stringify({ current: 'key-current', next: 'key-next' }),
    POLICY_ADMIN_ALLOWED_ACTORS: 'governance-admin'
  });

  try {
    const denied = await requestJson(baseUrl, '/portals/policy-matrix/preview', 'POST', {
      matrix: { health: { ageGatedServices: { minTrustLevel: 'bronze' } } }
    }, {
      'x-api-key': API_KEY,
      'x-policy-admin-key-id': 'current',
      'x-policy-admin-key': 'key-current',
      'x-admin-actor': 'unlisted-actor'
    });

    assert.equal(denied.status, 403);

    const allowed = await requestJson(baseUrl, '/portals/policy-matrix/preview', 'POST', {
      matrix: { health: { ageGatedServices: { minTrustLevel: 'bronze' } } }
    }, {
      'x-api-key': API_KEY,
      'x-policy-admin-key-id': 'current',
      'x-policy-admin-key': 'key-current',
      'x-admin-actor': 'governance-admin'
    });

    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.success, true);
  } finally {
    if (!server.killed) server.kill();
  }
});

test('policy admin JWT can read audit export with tamper-evident root hash', async () => {
  const port = 3028;
  const baseUrl = `http://127.0.0.1:${port}`;
  const secret = 'policy-admin-jwt-secret';
  const server = await startApiServer(port, {
    POLICY_ADMIN_KEY: '',
    POLICY_ADMIN_JWT_SECRET: secret,
    POLICY_ADMIN_JWT_ISSUER: 'lifepass-admin-tests',
    POLICY_ADMIN_REQUIRED_ROLE: 'policy_admin',
    POLICY_ADMIN_ALLOWED_ACTORS: 'governance@example.com'
  });

  try {
    const token = jwt.sign(
      {
        sub: 'governance@example.com',
        email: 'governance@example.com',
        roles: ['policy_admin']
      },
      secret,
      { issuer: 'lifepass-admin-tests', expiresIn: '5m' }
    );

    const response = await requestJson(baseUrl, '/portals/policy-admin/audit/export', 'GET', null, {
      'x-api-key': API_KEY,
      Authorization: `Bearer ${token}`
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.export.scope, 'policy-admin-audit');
    assert.equal(typeof response.body.export.rootHash, 'string');
    assert.ok(response.body.export.rootHash.length > 20);
  } finally {
    if (!server.killed) server.kill();
  }
});
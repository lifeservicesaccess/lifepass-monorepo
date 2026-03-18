const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const API_PORT = 3018;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const API_CWD = __dirname + '/..';
const API_KEY = 'test-key-portal';
const POLICY_ADMIN_KEY = 'test-policy-admin-key';
const AUDIT_FILE = path.join(API_CWD, '..', 'data', 'portal-access-audit.json');
const POLICY_OVERRIDE_FILE = path.join(API_CWD, '..', 'data', 'portal-policy-overrides.json');
const POLICY_ADMIN_AUDIT_FILE = path.join(API_CWD, '..', 'data', 'portal-policy-admin-audit.json');
const POLICY_SNAPSHOT_FILE = path.join(API_CWD, '..', 'data', 'portal-policy-snapshots.json');
const POLICY_APPROVAL_FILE = path.join(API_CWD, '..', 'data', 'portal-policy-approvals.json');

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

async function waitForAuditQuery(auditPath, minEvents = 1, attempts = 20, delayMs = 25) {
  let response = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await requestJson(auditPath, 'GET', null, { 'x-api-key': API_KEY });
    if (
      response.status === 200
      && response.body?.success === true
      && Array.isArray(response.body.events)
      && response.body.events.length >= minEvents
    ) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return response;
}

async function waitForAuditMatch(auditPath, matcher, attempts = 40, delayMs = 50) {
  let response = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await requestJson(auditPath, 'GET', null, { 'x-api-key': API_KEY });
    if (
      response.status === 200
      && response.body?.success === true
      && Array.isArray(response.body.events)
      && matcher(response.body.events)
    ) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return response;
}

function startApiServer(port = API_PORT, extraEnv = {}) {
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
        POLICY_ADMIN_KEY,
        POLICY_ADMIN_KEYS_JSON: '',
        POLICY_ADMIN_ALLOWED_ACTORS: '',
        POLICY_ADMIN_JWT_SECRET: '',
        POLICY_ADMIN_JWT_ISSUER: '',
        POLICY_ADMIN_JWT_AUDIENCE: '',
        POLICY_ADMIN_REQUIRED_ROLE: '',
        REQUIRE_DURABLE_GOVERNANCE: '0',
        ALLOW_INSECURE_FILE_GOVERNANCE: '0',
        POLICY_TWO_PERSON_REQUIRED: '0',
        POLICY_REQUIRED_APPROVALS: '2',
        POLICY_APPROVAL_SIGNING_KEYS_JSON: '',
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
  await fs.writeFile(POLICY_OVERRIDE_FILE, '{}', 'utf8');
  await fs.writeFile(POLICY_ADMIN_AUDIT_FILE, '[]', 'utf8');
  await fs.writeFile(POLICY_SNAPSHOT_FILE, '[]', 'utf8');
  await fs.writeFile(POLICY_APPROVAL_FILE, '[]', 'utf8');
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

  const audit = await waitForAuditMatch(
    '/portals/access-audit?limit=50',
    (events) => {
      const hasAllow = events.some(
        (evt) => evt.decision === 'allow' && evt.userId === userId && evt.path === '/portals/commons/me'
      );
      const hasDeny = events.some(
        (evt) => evt.decision === 'deny' && evt.path === '/portals/agri/requests' && evt.status === 401
      );
      return hasAllow && hasDeny;
    }
  );
  assert.equal(audit.status, 200);
  assert.equal(audit.body.success, true);
  assert.ok(Array.isArray(audit.body.events));
  const hasAllow = audit.body.events.some(
    (evt) => evt.decision === 'allow' && evt.userId === userId && evt.path === '/portals/commons/me'
  );
  const hasDeny = audit.body.events.some(
    (evt) => evt.decision === 'deny' && evt.path === '/portals/agri/requests' && evt.status === 401
  );
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

  const filtered = await waitForAuditQuery('/portals/access-audit?decision=deny&covenant=agri&limit=20', 1);
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

test('policy matrix update requires policy admin key', async () => {
  const denied = await requestJson('/portals/policy-matrix', 'POST', {
    matrix: {
      health: {
        ageGatedServices: { minTrustLevel: 'bronze' }
      }
    }
  }, {
    'x-api-key': API_KEY
  });

  assert.equal(denied.status, 403);
  assert.equal(denied.body.success, false);
});

test('policy admin update changes enforcement and writes admin audit trail', async () => {
  const userId = `portal-admin-${Date.now()}`;
  await setTrust(userId, 35);
  const token = await issueTokenForUser(userId);

  const before = await requestJson('/portals/health/age-gated-services', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(before.status, 403);

  const updated = await requestJson('/portals/policy-matrix', 'POST', {
    matrix: {
      health: {
        ageGatedServices: { minTrustLevel: 'bronze' }
      }
    },
    reason: 'test policy update'
  }, {
    'x-api-key': API_KEY,
    'x-policy-admin-key': POLICY_ADMIN_KEY,
    'x-admin-actor': 'integration-test'
  });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.success, true);
  assert.equal(updated.body.matrix.health.ageGatedServices.minTrustLevel, 'bronze');

  const after = await requestJson('/portals/health/age-gated-services', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(after.status, 200);

  const audit = await requestJson('/portals/policy-admin/audit?limit=20', 'GET', null, {
    'x-api-key': API_KEY,
    'x-policy-admin-key': POLICY_ADMIN_KEY
  });

  assert.equal(audit.status, 200);
  assert.equal(audit.body.success, true);
  assert.ok(Array.isArray(audit.body.events));
  assert.ok(audit.body.events.length >= 1);
  const latest = audit.body.events[audit.body.events.length - 1];
  assert.equal(latest.action, 'policy_matrix_update');
  assert.equal(latest.actor, 'integration-test');
});

test('policy preview returns route-level diff without applying changes', async () => {
  const preview = await requestJson('/portals/policy-matrix/preview', 'POST', {
    matrix: {
      agri: {
        listRequests: { minTrustLevel: 'gold' }
      }
    }
  }, {
    'x-api-key': API_KEY,
    'x-policy-admin-key': POLICY_ADMIN_KEY
  });

  assert.equal(preview.status, 200);
  assert.equal(preview.body.success, true);
  assert.ok(preview.body.changedCount >= 1);
  assert.ok(Array.isArray(preview.body.changes));
  const target = preview.body.changes.find((item) => item.covenant === 'agri' && item.policyKey === 'listRequests');
  assert.ok(Boolean(target));
  assert.equal(target.route, 'GET /portals/agri/requests');
});

test('policy snapshots can be listed and restored', async () => {
  const baselinePolicy = await requestJson('/portals/policy-matrix', 'POST', {
    matrix: {
      health: {
        ageGatedServices: { minTrustLevel: 'silver' }
      }
    },
    reason: 'reset baseline before snapshot test'
  }, {
    'x-api-key': API_KEY,
    'x-policy-admin-key': POLICY_ADMIN_KEY,
    'x-admin-actor': 'snapshot-test'
  });
  assert.equal(baselinePolicy.status, 200);

  const userId = `portal-snapshot-${Date.now()}`;
  await setTrust(userId, 35);
  const token = await issueTokenForUser(userId);

  const baseline = await requestJson('/portals/health/age-gated-services', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(baseline.status, 403);

  const firstUpdate = await requestJson('/portals/policy-matrix', 'POST', {
    matrix: {
      health: {
        ageGatedServices: { minTrustLevel: 'bronze' }
      }
    },
    reason: 'snapshot-one'
  }, {
    'x-api-key': API_KEY,
    'x-policy-admin-key': POLICY_ADMIN_KEY,
    'x-admin-actor': 'snapshot-test'
  });
  assert.equal(firstUpdate.status, 200);
  assert.equal(firstUpdate.body.success, true);
  const firstSnapshotId = firstUpdate.body.snapshotId;
  assert.ok(Boolean(firstSnapshotId));

  const bronzeAccess = await requestJson('/portals/health/age-gated-services', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(bronzeAccess.status, 200);

  const secondUpdate = await requestJson('/portals/policy-matrix', 'POST', {
    matrix: {
      health: {
        ageGatedServices: { minTrustLevel: 'silver' }
      }
    },
    reason: 'snapshot-two'
  }, {
    'x-api-key': API_KEY,
    'x-policy-admin-key': POLICY_ADMIN_KEY,
    'x-admin-actor': 'snapshot-test'
  });
  assert.equal(secondUpdate.status, 200);

  const restrictedAgain = await requestJson('/portals/health/age-gated-services', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(restrictedAgain.status, 403);

  const snapshotList = await requestJson('/portals/policy-snapshots?limit=20', 'GET', null, {
    'x-api-key': API_KEY,
    'x-policy-admin-key': POLICY_ADMIN_KEY
  });
  assert.equal(snapshotList.status, 200);
  assert.equal(snapshotList.body.success, true);
  assert.ok(Array.isArray(snapshotList.body.snapshots));
  assert.ok(snapshotList.body.snapshots.some((item) => item.id === firstSnapshotId));

  const restore = await requestJson(`/portals/policy-snapshots/${firstSnapshotId}/restore`, 'POST', {
    reason: 'restore-first-snapshot'
  }, {
    'x-api-key': API_KEY,
    'x-policy-admin-key': POLICY_ADMIN_KEY,
    'x-admin-actor': 'snapshot-test'
  });
  assert.equal(restore.status, 200);
  assert.equal(restore.body.success, true);

  const afterRestore = await requestJson('/portals/health/age-gated-services', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(afterRestore.status, 200);
});

test('deny spike alerts summarize covenant-level thresholds', async () => {
  const userId = `portal-deny-${Date.now()}`;
  await setTrust(userId, 35);
  const token = await issueTokenForUser(userId);

  const denyOne = await requestJson('/portals/agri/requests', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  const denyTwo = await requestJson('/portals/agri/requests', 'GET', null, {
    Authorization: `Bearer ${token}`
  });
  assert.equal(denyOne.status, 403);
  assert.equal(denyTwo.status, 403);

  const denyAudit = await waitForAuditQuery('/portals/access-audit?decision=deny&covenant=agri&limit=200', 1);
  assert.equal(denyAudit.status, 200);
  assert.ok(Array.isArray(denyAudit.body.events));
  assert.ok(denyAudit.body.events.length >= 1);

  const alerts = await requestJson('/portals/access-audit/alerts?threshold=1&windowMinutes=240', 'GET', null, {
    'x-api-key': API_KEY,
    'x-policy-admin-key': POLICY_ADMIN_KEY
  });

  assert.equal(alerts.status, 200);
  assert.equal(alerts.body.success, true);
  assert.ok(Array.isArray(alerts.body.alerts));
  assert.ok(alerts.body.alerts.length >= 1);
  const agri = alerts.body.alerts.find((item) => item.covenant === 'agri');
  assert.ok(Boolean(agri));
  assert.ok(agri.denyCount >= 1);
});

function signProposalApproval(proposal, secret) {
  const message = `${proposal.id}:${proposal.action}:${proposal.payloadHash}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

test('two-person rule requires two signed approvals before policy update executes', async () => {
  const port = 3020;
  const base = `http://127.0.0.1:${port}`;
  const keyMap = {
    alice: 'alice-secret',
    bob: 'bob-secret'
  };

  const twoPersonServer = await startApiServer(port, {
    POLICY_TWO_PERSON_REQUIRED: '1',
    POLICY_REQUIRED_APPROVALS: '2',
    POLICY_APPROVAL_SIGNING_KEYS_JSON: JSON.stringify(keyMap)
  });

  try {
    const userId = `portal-2p-${Date.now()}`;
    await setTrustAt(base, userId, 35);
    const token = await issueTokenForUserAt(base, userId);

    const before = await requestJson('/portals/agri/requests', 'GET', null, {
      Authorization: `Bearer ${token}`
    }, base);
    assert.equal(before.status, 403);

    const proposed = await requestJson('/portals/policy-matrix', 'POST', {
      matrix: { agri: { listRequests: { minTrustLevel: 'bronze' } } },
      reason: 'two-person update'
    }, {
      'x-api-key': API_KEY,
      'x-policy-admin-key': POLICY_ADMIN_KEY,
      'x-admin-actor': 'lead-admin'
    }, base);

    assert.equal(proposed.status, 202);
    assert.equal(proposed.body.success, true);
    const proposalId = proposed.body.proposalId;
    assert.ok(Boolean(proposalId));

    const detail = await requestJson(`/portals/policy-approvals/${proposalId}`, 'GET', null, {
      'x-api-key': API_KEY,
      'x-policy-admin-key': POLICY_ADMIN_KEY
    }, base);
    assert.equal(detail.status, 200);
    const proposal = detail.body.proposal;

    const sigAlice = signProposalApproval(proposal, keyMap.alice);
    const firstApprove = await requestJson(`/portals/policy-approvals/${proposalId}/approve`, 'POST', {
      approverId: 'alice',
      signature: sigAlice
    }, {
      'x-api-key': API_KEY,
      'x-policy-admin-key': POLICY_ADMIN_KEY
    }, base);
    assert.equal(firstApprove.status, 202);
    assert.equal(firstApprove.body.status, 'pending');

    const mid = await requestJson('/portals/agri/requests', 'GET', null, {
      Authorization: `Bearer ${token}`
    }, base);
    assert.equal(mid.status, 403);

    const sigBob = signProposalApproval(proposal, keyMap.bob);
    const secondApprove = await requestJson(`/portals/policy-approvals/${proposalId}/approve`, 'POST', {
      approverId: 'bob',
      signature: sigBob
    }, {
      'x-api-key': API_KEY,
      'x-policy-admin-key': POLICY_ADMIN_KEY
    }, base);

    assert.equal(secondApprove.status, 200);
    assert.equal(secondApprove.body.status, 'executed');

    const after = await requestJson('/portals/agri/requests', 'GET', null, {
      Authorization: `Bearer ${token}`
    }, base);
    assert.equal(after.status, 200);
  } finally {
    if (!twoPersonServer.killed) twoPersonServer.kill();
  }
});

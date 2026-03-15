const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');

const API_PORT = 3021;
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const API_CWD = __dirname + '/..';
const API_KEY = 'test-key';

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
        API_KEY,
        OPENAI_API_KEY: '',
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

async function issueToken(userId) {
  const issued = await requestJson('/auth/sso/token', 'POST', { userId }, { 'x-api-key': API_KEY });
  assert.equal(issued.status, 201);
  return issued.body.token;
}

let server;

test.before(async () => {
  server = await startApiServer();
});

test.after(() => {
  if (server && !server.killed) server.kill();
});

test('milestone create/update/list and dashboard summary work', async () => {
  const userId = `user-milestone-${Date.now()}`;

  const signup = await requestJson('/onboarding/signup', 'POST', {
    userId,
    name: 'Milestone User',
    purpose: 'Finish weekly impact goals'
  });
  assert.equal(signup.status, 201);

  const created = await requestJson(
    `/users/${encodeURIComponent(userId)}/milestones`,
    'POST',
    {
      title: 'Complete first impact task',
      description: 'Submit one verified service action',
      status: 'in_progress',
      tags: ['service', 'week1']
    },
    { 'x-api-key': API_KEY }
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.success, true);
  assert.equal(created.body.milestone.status, 'in_progress');

  const milestoneId = created.body.milestone.id;
  const updated = await requestJson(
    `/users/${encodeURIComponent(userId)}/milestones/${encodeURIComponent(milestoneId)}`,
    'PATCH',
    { status: 'completed' },
    { 'x-api-key': API_KEY }
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.success, true);
  assert.equal(updated.body.milestone.status, 'completed');

  const list = await requestJson(
    `/users/${encodeURIComponent(userId)}/milestones`,
    'GET',
    null,
    { 'x-api-key': API_KEY }
  );
  assert.equal(list.status, 200);
  assert.equal(list.body.success, true);
  assert.equal(Array.isArray(list.body.milestones), true);
  assert.equal(list.body.summary.completed >= 1, true);

  const dashboard = await requestJson(
    `/users/${encodeURIComponent(userId)}/dashboard`,
    'GET',
    null,
    { 'x-api-key': API_KEY }
  );
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.success, true);
  assert.equal(Array.isArray(dashboard.body.badges), true);
  assert.equal(dashboard.body.milestoneSummary.completed >= 1, true);
  assert.equal(typeof signup.body.session?.token, 'string');
});

test('milestones and visibility support self-service via bearer token', async () => {
  const userId = `user-self-${Date.now()}`;
  const signup = await requestJson('/onboarding/signup', 'POST', {
    userId,
    name: 'Self Access User',
    purpose: 'Coordinate trusted community work'
  });
  assert.equal(signup.status, 201);

  const token = await issueToken(userId);
  const created = await requestJson(
    `/users/${encodeURIComponent(userId)}/milestones`,
    'POST',
    { title: 'Ship first community milestone', status: 'pending' },
    { Authorization: `Bearer ${token}` }
  );
  assert.equal(created.status, 201);

  const visibility = await requestJson(
    `/users/${encodeURIComponent(userId)}/visibility`,
    'PATCH',
    { visibility: { legalName: true, trustScore: true, purposeStatement: true } },
    { Authorization: `Bearer ${token}` }
  );
  assert.equal(visibility.status, 200);
  assert.equal(visibility.body.visibility.legalName, true);
  assert.equal(visibility.body.visibility.trustScore, true);

  const dashboard = await requestJson(
    `/users/${encodeURIComponent(userId)}/dashboard`,
    'GET',
    null,
    { Authorization: `Bearer ${token}` }
  );
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.success, true);
  assert.equal(Array.isArray(dashboard.body.milestones), true);
  assert.equal(dashboard.body.profile.visibility.legalName, true);
});

test('completed milestone can be anchored on-chain or simulated via trust registry helper', async () => {
  const userId = `user-anchor-${Date.now()}`;
  const holderAddress = '0x0000000000000000000000000000000000000001';
  const signup = await requestJson('/onboarding/signup', 'POST', {
    userId,
    name: 'Anchor User',
    purpose: 'Anchor service milestones'
  });
  assert.equal(signup.status, 201);

  const token = await issueToken(userId);
  const created = await requestJson(
    `/users/${encodeURIComponent(userId)}/milestones`,
    'POST',
    { title: 'Deliver first anchored service', status: 'completed' },
    { Authorization: `Bearer ${token}` }
  );
  assert.equal(created.status, 201);

  const visibility = await requestJson(
    `/users/${encodeURIComponent(userId)}/visibility`,
    'PATCH',
    { visibility: { legalName: true } },
    { Authorization: `Bearer ${token}` }
  );
  assert.equal(visibility.status, 200);

  const anchor = await requestJson(
    `/users/${encodeURIComponent(userId)}/milestones/${encodeURIComponent(created.body.milestone.id)}/anchor`,
    'POST',
    { holderAddress, metadataUri: 'ipfs://milestone-anchor-1' },
    { Authorization: `Bearer ${token}` }
  );
  assert.equal(anchor.status, 201);
  assert.equal(anchor.body.success, true);
  assert.equal(anchor.body.anchor.holderAddress, holderAddress);
  assert.equal(typeof anchor.body.anchor.actionHash, 'string');
  assert.equal(typeof anchor.body.milestone.metadata.onchainAnchor.txHash, 'string');
});

test('ai chat returns fallback response when model key is not configured', async () => {
  const userId = `user-chat-${Date.now()}`;

  const signup = await requestJson('/onboarding/signup', 'POST', {
    userId,
    name: 'Guide User',
    purpose: 'Grow in cooperative farming'
  });
  assert.equal(signup.status, 201);

  const response = await requestJson('/ai/chat', 'POST', {
    userId,
    message: 'What should I do next in agri?'
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(typeof response.body.result.text, 'string');
  assert.equal(response.body.result.recommendedPortal, 'agri');
  assert.equal(Array.isArray(response.body.result.kairosSignals), true);
  assert.equal(typeof response.body.result.channels.whatsapp, 'string');
});

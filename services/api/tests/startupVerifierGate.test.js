const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const API_CWD = __dirname + '/..';
const FAIL_PORT = 3025;
const PASS_PORT = 3026;

function waitForExit(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('timeout waiting for process exit'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

function waitForListen(child, port, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`timeout waiting for API listen on port ${port}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (text.includes(`API server listening on port ${port}`)) {
        clearTimeout(timeout);
        resolve({ stdout, stderr });
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`API exited before listen with code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    });
  });
}

test('startup strict fails when verifier gate is enabled and AGE_VERIFIER_ADDRESS is missing', async () => {
  const child = spawn('node', ['index.js'], {
    cwd: API_CWD,
    env: {
      ...process.env,
      PORT: String(FAIL_PORT),
      STARTUP_STRICT: '1',
      REQUIRE_AGE_VERIFIER: '1',
      AGE_VERIFIER_ADDRESS: '',
      PRIVATE_KEY: '',
      SBT_CONTRACT_ADDRESS: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const result = await waitForExit(child);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /AGE_VERIFIER_ADDRESS format/);
  assert.match(result.stdout, /required when REQUIRE_AGE_VERIFIER=1/);
  assert.match(result.stderr, /STARTUP_STRICT=1 and one or more startup checks failed/);
});

test('startup strict passes when verifier gate is enabled and AGE_VERIFIER_ADDRESS is valid', async () => {
  const child = spawn('node', ['index.js'], {
    cwd: API_CWD,
    env: {
      ...process.env,
      PORT: String(PASS_PORT),
      STARTUP_STRICT: '1',
      REQUIRE_AGE_VERIFIER: '1',
      AGE_VERIFIER_ADDRESS: '0x0000000000000000000000000000000000000001',
      PRIVATE_KEY: '',
      SBT_CONTRACT_ADDRESS: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForListen(child, PASS_PORT);
  } finally {
    if (!child.killed) child.kill();
  }
});

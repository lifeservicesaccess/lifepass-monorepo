const fs = require('fs');
const path = require('path');

function readDotEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }

  return out;
}

function getEnvValue(name, fallback) {
  const envVal = process.env[name];
  if (envVal != null && String(envVal).trim() !== '') return envVal;
  return fallback[name] || '';
}

function resolveMaybeRelative(p) {
  if (!p) return '';
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function assertFileExists(label, p) {
  if (!p) {
    throw new Error(`${label} is required when USE_SNARKJS=1`);
  }

  if (!fs.existsSync(p)) {
    throw new Error(`${label} does not exist: ${p}`);
  }

  const stat = fs.statSync(p);
  if (!stat.isFile()) {
    throw new Error(`${label} must be a file: ${p}`);
  }
}

function main() {
  const envLocal = readDotEnv(path.join(process.cwd(), '.env.local'));
  const envBase = readDotEnv(path.join(process.cwd(), '.env'));
  const merged = { ...envBase, ...envLocal };

  const useSnark = getEnvValue('USE_SNARKJS', merged);
  if (useSnark !== '1') {
    console.log('SNARK validation skipped: USE_SNARKJS is not 1.');
    return;
  }

  // Ensure runtime dependency can be resolved before expensive checks.
  try {
    require.resolve('snarkjs');
  } catch (err) {
    throw new Error('snarkjs dependency is required when USE_SNARKJS=1');
  }

  const wasmPath = resolveMaybeRelative(getEnvValue('SNARK_WASM_PATH', merged));
  const zkeyPath = resolveMaybeRelative(getEnvValue('SNARK_ZKEY_PATH', merged));
  const vkeyPath = resolveMaybeRelative(getEnvValue('SNARK_VKEY_PATH', merged));

  assertFileExists('SNARK_WASM_PATH', wasmPath);
  assertFileExists('SNARK_ZKEY_PATH', zkeyPath);
  assertFileExists('SNARK_VKEY_PATH', vkeyPath);

  // Basic verification key sanity check.
  const rawVkey = fs.readFileSync(vkeyPath, 'utf8');
  let parsedVkey;
  try {
    parsedVkey = JSON.parse(rawVkey);
  } catch (err) {
    throw new Error(`SNARK_VKEY_PATH is not valid JSON: ${vkeyPath}`);
  }

  if (!parsedVkey || typeof parsedVkey !== 'object') {
    throw new Error(`SNARK_VKEY_PATH must contain a JSON object: ${vkeyPath}`);
  }

  console.log('SNARK artifact validation passed.');
}

try {
  main();
} catch (err) {
  console.error('SNARK artifact validation failed:', err.message || err);
  process.exit(1);
}

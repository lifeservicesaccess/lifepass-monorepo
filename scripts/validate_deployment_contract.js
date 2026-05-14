const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const ETH_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const PRIVATE_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/;

function resolvePath(inputPath) {
  if (!inputPath) return null;
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
}

function stripQuotes(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function readRequiredFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${filePath}: ${error.message}`);
  }
}

function parseArgs(argv) {
  const options = {
    render: resolvePath('render.yaml'),
    railway: resolvePath('railway.json'),
    webEnvExample: resolvePath('apps/web/.env.example'),
    apiEnv: null,
    apiEnvLabel: 'API environment snapshot',
    webEnv: null,
    webEnvLabel: 'Web environment snapshot',
    skipRender: false,
    skipRailway: false,
    skipWebEnvExample: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--skip-render') {
      options.skipRender = true;
      continue;
    }
    if (argument === '--skip-railway') {
      options.skipRailway = true;
      continue;
    }
    if (argument === '--skip-web-env-example') {
      options.skipWebEnvExample = true;
      continue;
    }
    if (argument === '--render') {
      options.render = resolvePath(argv[index + 1]);
      index += 1;
      continue;
    }
    if (argument.startsWith('--render=')) {
      options.render = resolvePath(argument.slice('--render='.length));
      continue;
    }
    if (argument === '--railway') {
      options.railway = resolvePath(argv[index + 1]);
      index += 1;
      continue;
    }
    if (argument.startsWith('--railway=')) {
      options.railway = resolvePath(argument.slice('--railway='.length));
      continue;
    }
    if (argument === '--web-env-example') {
      options.webEnvExample = resolvePath(argv[index + 1]);
      index += 1;
      continue;
    }
    if (argument.startsWith('--web-env-example=')) {
      options.webEnvExample = resolvePath(argument.slice('--web-env-example='.length));
      continue;
    }
    if (argument === '--api-env') {
      options.apiEnv = resolvePath(argv[index + 1]);
      index += 1;
      continue;
    }
    if (argument.startsWith('--api-env=')) {
      options.apiEnv = resolvePath(argument.slice('--api-env='.length));
      continue;
    }
    if (argument === '--api-env-label') {
      options.apiEnvLabel = String(argv[index + 1] || '').trim() || options.apiEnvLabel;
      index += 1;
      continue;
    }
    if (argument.startsWith('--api-env-label=')) {
      options.apiEnvLabel = String(argument.slice('--api-env-label='.length)).trim() || options.apiEnvLabel;
      continue;
    }
    if (argument === '--web-env') {
      options.webEnv = resolvePath(argv[index + 1]);
      index += 1;
      continue;
    }
    if (argument.startsWith('--web-env=')) {
      options.webEnv = resolvePath(argument.slice('--web-env='.length));
      continue;
    }
    if (argument === '--web-env-label') {
      options.webEnvLabel = String(argv[index + 1] || '').trim() || options.webEnvLabel;
      index += 1;
      continue;
    }
    if (argument.startsWith('--web-env-label=')) {
      options.webEnvLabel = String(argument.slice('--web-env-label='.length)).trim() || options.webEnvLabel;
      continue;
    }
    if (argument === '--vercel-env') {
      options.webEnv = resolvePath(argv[index + 1]);
      options.webEnvLabel = 'Vercel production environment';
      index += 1;
      continue;
    }
    if (argument.startsWith('--vercel-env=')) {
      options.webEnv = resolvePath(argument.slice('--vercel-env='.length));
      options.webEnvLabel = 'Vercel production environment';
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function parseRenderEnvVars(content) {
  const lines = content.split(/\r?\n/);
  const envVars = new Map();
  let inEnvVars = false;
  let current = null;
  let inFromDatabase = false;

  const flushCurrent = () => {
    if (current && current.key) {
      envVars.set(current.key, current);
    }
    current = null;
    inFromDatabase = false;
  };

  for (const line of lines) {
    if (!inEnvVars) {
      if (/^\s*envVars:\s*$/.test(line)) {
        inEnvVars = true;
      }
      continue;
    }

    if (/^\s{6}-\s+key:\s*(.+?)\s*$/.test(line)) {
      flushCurrent();
      current = { key: stripQuotes(line.match(/^\s{6}-\s+key:\s*(.+?)\s*$/)[1]) };
      continue;
    }

    if (!current) {
      if (/^\S/.test(line)) {
        inEnvVars = false;
      }
      continue;
    }

    if (/^\s{8}value:\s*(.+?)\s*$/.test(line)) {
      current.value = stripQuotes(line.match(/^\s{8}value:\s*(.+?)\s*$/)[1]);
      continue;
    }
    if (/^\s{8}sync:\s*(.+?)\s*$/.test(line)) {
      current.sync = stripQuotes(line.match(/^\s{8}sync:\s*(.+?)\s*$/)[1]);
      continue;
    }
    if (/^\s{8}fromDatabase:\s*$/.test(line)) {
      current.fromDatabase = {};
      inFromDatabase = true;
      continue;
    }
    if (inFromDatabase && /^\s{10}name:\s*(.+?)\s*$/.test(line)) {
      current.fromDatabase.name = stripQuotes(line.match(/^\s{10}name:\s*(.+?)\s*$/)[1]);
      continue;
    }
    if (inFromDatabase && /^\s{10}property:\s*(.+?)\s*$/.test(line)) {
      current.fromDatabase.property = stripQuotes(line.match(/^\s{10}property:\s*(.+?)\s*$/)[1]);
      continue;
    }

    if (/^\s{6}-\s+key:/.test(line)) {
      flushCurrent();
    }
  }

  flushCurrent();
  return envVars;
}

function parseEnvFile(content) {
  return content.split(/\r?\n/).reduce((accumulator, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return accumulator;
    }
    const separator = trimmed.indexOf('=');
    if (separator < 0) {
      return accumulator;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1);
    accumulator.set(key, value);
    return accumulator;
  }, new Map());
}

function hasEnvValue(envMap, key) {
  return envMap.has(key) && String(envMap.get(key) || '').trim() !== '';
}

function getEnvValue(envMap, key) {
  return String(envMap.get(key) || '').trim();
}

function requireNonEmptyEnv(envMap, key, description, errors, checks) {
  if (!hasEnvValue(envMap, key)) {
    errors.push(`${description} must set ${key} to a non-empty value.`);
    return;
  }
  checks.push(`${description} sets ${key}.`);
}

function requireExactEnvValue(envMap, key, expectedValue, description, errors, checks) {
  const value = getEnvValue(envMap, key);
  if (value !== expectedValue) {
    errors.push(`${description} must set ${key}=${expectedValue}.`);
    return;
  }
  checks.push(`${description} keeps ${key}=${expectedValue}.`);
}

function requireAnyEnv(envMap, keys, description, errors, checks) {
  if (!keys.some((key) => hasEnvValue(envMap, key))) {
    errors.push(`${description} must set one of ${keys.join(' or ')}.`);
    return;
  }
  checks.push(`${description} sets ${keys.find((key) => hasEnvValue(envMap, key))}.`);
}

function requirePattern(value, pattern, errorMessage, errors, checks, successMessage) {
  if (!pattern.test(value)) {
    errors.push(errorMessage);
    return;
  }
  if (successMessage) {
    checks.push(successMessage);
  }
}

function parseJsonObjectValue(rawValue, key, description, errors) {
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      errors.push(`${description} must set ${key} to a JSON object.`);
      return null;
    }
    return parsed;
  } catch (error) {
    errors.push(`${description} must set ${key} to valid JSON.`);
    return null;
  }
}

function validateRenderContract(filePath) {
  const content = readRequiredFile(filePath);
  const envVars = parseRenderEnvVars(content);
  const errors = [];
  const checks = [];

  if (!/healthCheckPath:\s*\/health/.test(content)) {
    errors.push('render.yaml must keep healthCheckPath set to /health.');
  } else {
    checks.push('Render health check path is /health.');
  }

  if (!/rootDir:\s*services\/api/.test(content)) {
    errors.push('render.yaml must keep rootDir set to services/api.');
  } else {
    checks.push('Render API service still builds from services/api.');
  }

  const startupStrict = envVars.get('STARTUP_STRICT');
  if (!startupStrict || startupStrict.value !== '1') {
    errors.push('render.yaml must keep STARTUP_STRICT=1 for the API service.');
  } else {
    checks.push('Render keeps STARTUP_STRICT=1.');
  }

  const durableGovernance = envVars.get('REQUIRE_DURABLE_GOVERNANCE');
  if (!durableGovernance || durableGovernance.value !== '1') {
    errors.push('render.yaml must keep REQUIRE_DURABLE_GOVERNANCE=1 for the API service.');
  } else {
    checks.push('Render keeps REQUIRE_DURABLE_GOVERNANCE=1.');
  }

  const insecureFallback = envVars.get('ALLOW_INSECURE_FILE_GOVERNANCE');
  if (insecureFallback && insecureFallback.value === '1') {
    errors.push('render.yaml must not enable ALLOW_INSECURE_FILE_GOVERNANCE=1 in normal deployments.');
  } else {
    checks.push('Render does not hard-enable insecure file governance fallback.');
  }

  const databaseUrl = envVars.get('DATABASE_URL');
  if (!databaseUrl || !databaseUrl.fromDatabase || databaseUrl.fromDatabase.property !== 'connectionString') {
    errors.push('render.yaml must source DATABASE_URL from the managed database connection string.');
  } else {
    checks.push('Render DATABASE_URL stays attached to the managed database.');
  }

  return { errors, checks };
}

function validateRailwayContract(filePath) {
  const content = readRequiredFile(filePath);
  let config;
  try {
    config = JSON.parse(content);
  } catch (error) {
    throw new Error(`Unable to parse ${filePath} as JSON: ${error.message}`);
  }

  const errors = [];
  const checks = [];
  const buildCommand = String(config?.build?.buildCommand || '');
  const startCommand = String(config?.deploy?.startCommand || '');
  const healthcheckPath = String(config?.deploy?.healthcheckPath || '');

  if (!buildCommand.includes('cd services/api') || !buildCommand.includes('npm install')) {
    errors.push('railway.json must build the API from services/api with npm install.');
  } else {
    checks.push('Railway build command still targets services/api.');
  }

  if (!startCommand.includes('cd services/api') || !startCommand.includes('npm start')) {
    errors.push('railway.json must start the API from services/api with npm start.');
  } else {
    checks.push('Railway start command still targets services/api.');
  }

  if (healthcheckPath !== '/health') {
    errors.push('railway.json must keep deploy.healthcheckPath set to /health.');
  } else {
    checks.push('Railway health check path is /health.');
  }

  return { errors, checks };
}

function validateApiEnv(filePath, description) {
  const envMap = parseEnvFile(readRequiredFile(filePath));
  const errors = [];
  const checks = [];

  requireExactEnvValue(envMap, 'NODE_ENV', 'production', description, errors, checks);
  requireExactEnvValue(envMap, 'STARTUP_STRICT', '1', description, errors, checks);
  requireExactEnvValue(envMap, 'REQUIRE_DURABLE_GOVERNANCE', '1', description, errors, checks);
  requireAnyEnv(envMap, ['DATABASE_URL', 'PG_CONNECTION_STRING'], description, errors, checks);
  requireNonEmptyEnv(envMap, 'API_KEY', description, errors, checks);
  requireNonEmptyEnv(envMap, 'CORS_ALLOWED_ORIGINS', description, errors, checks);
  requireNonEmptyEnv(envMap, 'RPC_URL', description, errors, checks);
  requireNonEmptyEnv(envMap, 'PRIVATE_KEY', description, errors, checks);
  requireNonEmptyEnv(envMap, 'SBT_CONTRACT_ADDRESS', description, errors, checks);
  requireNonEmptyEnv(envMap, 'LIFEPASS_SSO_JWT_SECRET', description, errors, checks);

  if (getEnvValue(envMap, 'ALLOW_INSECURE_FILE_GOVERNANCE') === '1') {
    errors.push(`${description} must not set ALLOW_INSECURE_FILE_GOVERNANCE=1 in normal production validation.`);
  } else {
    checks.push(`${description} does not enable insecure file governance fallback.`);
  }

  if (hasEnvValue(envMap, 'PRIVATE_KEY')) {
    requirePattern(
      getEnvValue(envMap, 'PRIVATE_KEY'),
      PRIVATE_KEY_PATTERN,
      `${description} must set PRIVATE_KEY to a valid 0x-prefixed 64-byte hex value.`,
      errors,
      checks,
      `${description} sets a valid PRIVATE_KEY format.`
    );
  }

  if (hasEnvValue(envMap, 'SBT_CONTRACT_ADDRESS')) {
    requirePattern(
      getEnvValue(envMap, 'SBT_CONTRACT_ADDRESS'),
      ETH_ADDRESS_PATTERN,
      `${description} must set SBT_CONTRACT_ADDRESS to a valid 0x-prefixed 40-hex address.`,
      errors,
      checks,
      `${description} sets a valid SBT_CONTRACT_ADDRESS format.`
    );
  }

  const requireAgeVerifier = getEnvValue(envMap, 'REQUIRE_AGE_VERIFIER') === '1';
  if (requireAgeVerifier) {
    requireNonEmptyEnv(envMap, 'AGE_VERIFIER_ADDRESS', description, errors, checks);
    if (hasEnvValue(envMap, 'AGE_VERIFIER_ADDRESS')) {
      requirePattern(
        getEnvValue(envMap, 'AGE_VERIFIER_ADDRESS'),
        ETH_ADDRESS_PATTERN,
        `${description} must set AGE_VERIFIER_ADDRESS to a valid 0x-prefixed 40-hex address when REQUIRE_AGE_VERIFIER=1.`,
        errors,
        checks,
        `${description} keeps a valid AGE_VERIFIER_ADDRESS for strict verifier mode.`
      );
    }
  }

  const useSnarkJs = getEnvValue(envMap, 'USE_SNARKJS') === '1';
  if (useSnarkJs) {
    requireNonEmptyEnv(envMap, 'SNARK_WASM_PATH', description, errors, checks);
    requireNonEmptyEnv(envMap, 'SNARK_ZKEY_PATH', description, errors, checks);
    requireNonEmptyEnv(envMap, 'SNARK_VKEY_PATH', description, errors, checks);
  }

  const hasKeyMode = hasEnvValue(envMap, 'POLICY_ADMIN_KEY') || hasEnvValue(envMap, 'POLICY_ADMIN_KEYS_JSON');
  const hasJwtMode = hasEnvValue(envMap, 'POLICY_ADMIN_JWT_SECRET');
  if (hasKeyMode && hasJwtMode) {
    errors.push(`${description} must choose exactly one policy admin auth mode: key mode (POLICY_ADMIN_KEY or POLICY_ADMIN_KEYS_JSON) or JWT mode (POLICY_ADMIN_JWT_SECRET).`);
  } else if (hasKeyMode) {
    checks.push(`${description} selects key-mode policy admin auth.`);
  } else if (hasJwtMode) {
    checks.push(`${description} selects JWT-mode policy admin auth.`);
  } else {
    checks.push(`${description} leaves policy admin auth unset; API startup will warn until a mode is configured.`);
  }

  if (hasEnvValue(envMap, 'POLICY_ADMIN_KEYS_JSON')) {
    const keys = parseJsonObjectValue(getEnvValue(envMap, 'POLICY_ADMIN_KEYS_JSON'), 'POLICY_ADMIN_KEYS_JSON', description, errors);
    if (keys && Object.keys(keys).length === 0) {
      errors.push(`${description} must not set POLICY_ADMIN_KEYS_JSON to an empty JSON object.`);
    } else if (keys) {
      checks.push(`${description} provides rotated policy admin keys.`);
    }
  }

  const twoPersonRequired = getEnvValue(envMap, 'POLICY_TWO_PERSON_REQUIRED') === '1';
  if (twoPersonRequired) {
    const approvalCount = Number.parseInt(getEnvValue(envMap, 'POLICY_REQUIRED_APPROVALS') || '0', 10);
    if (!Number.isInteger(approvalCount) || approvalCount < 2) {
      errors.push(`${description} must set POLICY_REQUIRED_APPROVALS to an integer of at least 2 when POLICY_TWO_PERSON_REQUIRED=1.`);
    } else {
      checks.push(`${description} keeps POLICY_REQUIRED_APPROVALS at ${approvalCount}.`);
    }

    requireNonEmptyEnv(envMap, 'POLICY_APPROVAL_SIGNING_KEYS_JSON', description, errors, checks);
    if (hasEnvValue(envMap, 'POLICY_APPROVAL_SIGNING_KEYS_JSON')) {
      const approvers = parseJsonObjectValue(getEnvValue(envMap, 'POLICY_APPROVAL_SIGNING_KEYS_JSON'), 'POLICY_APPROVAL_SIGNING_KEYS_JSON', description, errors);
      if (approvers && Object.keys(approvers).length < Math.max(approvalCount, 2)) {
        errors.push(`${description} must configure at least ${Math.max(approvalCount, 2)} approval signing keys when POLICY_TWO_PERSON_REQUIRED=1.`);
      } else if (approvers) {
        checks.push(`${description} provides enough approval signing keys for two-person governance.`);
      }
    }
  }

  return { errors, checks };
}

function validateWebEnv(filePath, description) {
  const envMap = parseEnvFile(readRequiredFile(filePath));
  const errors = [];
  const checks = [];

  requireNonEmptyEnv(envMap, 'API_BASE_URL', description, errors, checks);
  requireNonEmptyEnv(envMap, 'API_KEY', description, errors, checks);
  requireNonEmptyEnv(envMap, 'ADMIN_CONSOLE_SESSION_SECRET', description, errors, checks);
  requireNonEmptyEnv(envMap, 'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID', description, errors, checks);

  return { errors, checks };
}

function validateEnvKey(filePath, key, description) {
  const envMap = parseEnvFile(readRequiredFile(filePath));
  const errors = [];
  const checks = [];
  const value = envMap.get(key);

  if (value === undefined) {
    errors.push(`${description} must declare ${key}.`);
  } else {
    checks.push(`${description} declares ${key}.`);
  }

  if (value !== undefined && String(value).trim() === '') {
    errors.push(`${description} must set ${key} to a non-empty value.`);
  } else if (value !== undefined) {
    checks.push(`${description} sets ${key} to a non-empty value.`);
  }

  return { errors, checks };
}

function validateExampleEnvKey(filePath, key, description) {
  const envMap = parseEnvFile(readRequiredFile(filePath));
  const errors = [];
  const checks = [];

  if (!envMap.has(key)) {
    errors.push(`${description} must declare ${key}.`);
  } else {
    checks.push(`${description} declares ${key}.`);
  }

  return { errors, checks };
}

function collectResults(results, nextResult) {
  results.errors.push(...nextResult.errors);
  results.checks.push(...nextResult.checks);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const results = { errors: [], checks: [] };

  if (!options.skipRender && options.render) {
    collectResults(results, validateRenderContract(options.render));
  }

  if (!options.skipRailway && options.railway) {
    collectResults(results, validateRailwayContract(options.railway));
  }

  if (!options.skipWebEnvExample && options.webEnvExample) {
    collectResults(results, validateExampleEnvKey(options.webEnvExample, 'ADMIN_CONSOLE_SESSION_SECRET', 'apps/web/.env.example'));
  }

  if (options.apiEnv) {
    collectResults(results, validateApiEnv(options.apiEnv, options.apiEnvLabel));
  }

  if (options.webEnv) {
    collectResults(results, validateWebEnv(options.webEnv, options.webEnvLabel));
  }

  if (results.errors.length > 0) {
    for (const error of results.errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Deployment contract validation passed (${results.checks.length} checks).`);
  for (const check of results.checks) {
    console.log(`- ${check}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
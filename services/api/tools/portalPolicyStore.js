const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const POLICY_OVERRIDE_FILE = path.join(DATA_DIR, 'portal-policy-overrides.json');
const TRUST_LEVELS = new Set(['bronze', 'silver', 'gold']);

function cloneObject(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function normalizePolicyMatrix(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('matrix must be an object');
  }

  const out = {};
  for (const [covenant, policies] of Object.entries(input)) {
    if (!policies || typeof policies !== 'object' || Array.isArray(policies)) {
      throw new Error(`matrix.${covenant} must be an object`);
    }

    out[covenant] = {};
    for (const [policyKey, rule] of Object.entries(policies)) {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
        throw new Error(`matrix.${covenant}.${policyKey} must be an object`);
      }

      const normalized = {};
      if (rule.minTrustLevel != null) {
        const level = String(rule.minTrustLevel).trim().toLowerCase();
        if (!TRUST_LEVELS.has(level)) {
          throw new Error(`matrix.${covenant}.${policyKey}.minTrustLevel must be bronze|silver|gold`);
        }
        normalized.minTrustLevel = level;
      }

      if (rule.audience != null) {
        const audience = String(rule.audience).trim();
        if (!audience) {
          throw new Error(`matrix.${covenant}.${policyKey}.audience must be non-empty when provided`);
        }
        normalized.audience = audience;
      }

      if (!Object.keys(normalized).length) {
        throw new Error(`matrix.${covenant}.${policyKey} must include minTrustLevel and/or audience`);
      }

      out[covenant][policyKey] = normalized;
    }
  }

  return out;
}

function mergePolicyLayers(...layers) {
  const merged = {};
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    for (const [covenant, policies] of Object.entries(layer)) {
      merged[covenant] = {
        ...(merged[covenant] || {})
      };
      if (!policies || typeof policies !== 'object') continue;
      for (const [policyKey, rule] of Object.entries(policies)) {
        merged[covenant][policyKey] = {
          ...(merged[covenant][policyKey] || {}),
          ...(rule || {})
        };
      }
    }
  }
  return merged;
}

function readPolicyOverrideMatrixSync() {
  try {
    const raw = fs.readFileSync(POLICY_OVERRIDE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch (_err) {
    return {};
  }
}

async function writePolicyOverrideMatrix(matrix) {
  const normalized = normalizePolicyMatrix(matrix);
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(POLICY_OVERRIDE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return cloneObject(normalized);
}

module.exports = {
  POLICY_OVERRIDE_FILE,
  normalizePolicyMatrix,
  mergePolicyLayers,
  readPolicyOverrideMatrixSync,
  writePolicyOverrideMatrix
};

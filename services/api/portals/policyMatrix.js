const DEFAULT_POLICY_MATRIX = {
  commons: {
    me: { minTrustLevel: 'bronze', audience: 'zionstack-portals' }
  },
  agri: {
    createRequest: { minTrustLevel: 'bronze', audience: 'zionstack-portals' },
    listRequests: { minTrustLevel: 'silver', audience: 'zionstack-portals' }
  },
  health: {
    ageGatedServices: { minTrustLevel: 'silver', audience: 'zionstack-portals' }
  }
};

function parseCustomMatrix() {
  const raw = process.env.LIFEPASS_PORTAL_POLICY_JSON || '';
  if (!raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (_err) {
    console.warn('Invalid LIFEPASS_PORTAL_POLICY_JSON; using defaults.');
    return {};
  }
}

function readPolicyMatrix() {
  const custom = parseCustomMatrix();
  return {
    ...DEFAULT_POLICY_MATRIX,
    ...custom,
    commons: {
      ...DEFAULT_POLICY_MATRIX.commons,
      ...(custom.commons || {})
    },
    agri: {
      ...DEFAULT_POLICY_MATRIX.agri,
      ...(custom.agri || {})
    },
    health: {
      ...DEFAULT_POLICY_MATRIX.health,
      ...(custom.health || {})
    }
  };
}

function getPolicy(covenant, policyKey, fallback = {}) {
  const matrix = readPolicyMatrix();
  const section = matrix[covenant] || {};
  const target = section[policyKey] || {};
  return {
    ...fallback,
    ...target
  };
}

module.exports = {
  DEFAULT_POLICY_MATRIX,
  readPolicyMatrix,
  getPolicy
};

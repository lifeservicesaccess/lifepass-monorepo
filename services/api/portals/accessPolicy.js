const ssoAuth = require('../tools/ssoAuth');
const { getPolicy } = require('./policyMatrix');
const portalAccessAuditStore = require('../tools/portalAccessAuditStore');

const TRUST_RANK = {
  bronze: 1,
  silver: 2,
  gold: 3
};

function normalizeTrustLevel(level) {
  const key = String(level || 'bronze').trim().toLowerCase();
  if (key in TRUST_RANK) return key;
  return 'bronze';
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  const parts = authHeader.split(' ');
  if (parts.length === 2 && /^Bearer$/i.test(parts[0]) && parts[1]) {
    return parts[1];
  }
  if (req.headers['x-lifepass-token']) {
    return String(req.headers['x-lifepass-token']);
  }
  return '';
}

function requirePortalAccess(options = {}) {
  async function logDecision(req, minTrustLevel, status, decision, detail = {}) {
    const event = {
      at: new Date().toISOString(),
      path: req.originalUrl || req.url,
      method: req.method,
      covenant: options.covenant || 'unknown',
      policyKey: options.policyKey || 'unknown',
      requiredTrustLevel: minTrustLevel,
      status,
      decision,
      ...detail
    };
    try {
      await portalAccessAuditStore.appendAuditEvent(event);
    } catch (err) {
      console.warn('portal access audit write failed:', err.message || err);
    }
  }

  return (req, res, next) => {
    const policy = getPolicy(options.covenant, options.policyKey, options);
    const minTrustLevel = normalizeTrustLevel(policy.minTrustLevel || 'bronze');
    const minRank = TRUST_RANK[minTrustLevel];
    const audience = policy.audience;

    const config = ssoAuth.getSsoConfig();
    if (!config.configured) {
      logDecision(req, minTrustLevel, 503, 'deny', { reason: 'sso_not_configured' });
      return res.status(503).json({ success: false, error: 'Portal access policy requires SSO configuration' });
    }

    const token = extractBearerToken(req);
    if (!token) {
      logDecision(req, minTrustLevel, 401, 'deny', { reason: 'missing_token' });
      return res.status(401).json({ success: false, error: 'Missing portal bearer token' });
    }

    try {
      const verified = ssoAuth.verifySsoToken(token, { audience });
      const claims = verified.claims || {};
      const trustLevel = normalizeTrustLevel(claims.trustLevel);
      const trustRank = TRUST_RANK[trustLevel];

      if (trustRank < minRank) {
        logDecision(req, minTrustLevel, 403, 'deny', {
          reason: 'insufficient_trust',
          userId: claims.lifePassId || claims.sub || null,
          actualTrustLevel: trustLevel
        });
        return res.status(403).json({
          success: false,
          error: 'Insufficient trust level for portal resource',
          requiredTrustLevel: minTrustLevel,
          actualTrustLevel: trustLevel
        });
      }

      req.portalIdentity = {
        userId: claims.lifePassId || claims.sub || null,
        trustLevel,
        trustScore: typeof claims.trustScore === 'number' ? claims.trustScore : null,
        scope: claims.scope || []
      };
      logDecision(req, minTrustLevel, 200, 'allow', {
        userId: req.portalIdentity.userId,
        actualTrustLevel: trustLevel,
        trustScore: req.portalIdentity.trustScore
      });
      return next();
    } catch (err) {
      logDecision(req, minTrustLevel, 401, 'deny', { reason: 'invalid_token', error: err.message || String(err) });
      return res.status(401).json({
        success: false,
        error: 'Invalid portal bearer token',
        reason: err.message || String(err)
      });
    }
  };
}

module.exports = {
  requirePortalAccess
};

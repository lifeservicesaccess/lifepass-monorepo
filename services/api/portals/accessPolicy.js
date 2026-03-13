const ssoAuth = require('../tools/ssoAuth');

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
  const minTrustLevel = normalizeTrustLevel(options.minTrustLevel || 'bronze');
  const minRank = TRUST_RANK[minTrustLevel];
  const audience = options.audience;

  return (req, res, next) => {
    const config = ssoAuth.getSsoConfig();
    if (!config.configured) {
      return res.status(503).json({ success: false, error: 'Portal access policy requires SSO configuration' });
    }

    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing portal bearer token' });
    }

    try {
      const verified = ssoAuth.verifySsoToken(token, { audience });
      const claims = verified.claims || {};
      const trustLevel = normalizeTrustLevel(claims.trustLevel);
      const trustRank = TRUST_RANK[trustLevel];

      if (trustRank < minRank) {
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
      return next();
    } catch (err) {
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

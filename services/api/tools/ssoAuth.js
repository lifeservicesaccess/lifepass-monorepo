const jwt = require('jsonwebtoken');

function getSsoConfig() {
  const secret = process.env.LIFEPASS_SSO_JWT_SECRET || '';
  const issuer = process.env.LIFEPASS_SSO_JWT_ISSUER || 'lifepass-api';
  const defaultAudience = process.env.LIFEPASS_SSO_DEFAULT_AUDIENCE || 'zionstack-portals';
  const expiresIn = process.env.LIFEPASS_SSO_JWT_EXPIRES_IN || '15m';

  return {
    secret,
    issuer,
    defaultAudience,
    expiresIn,
    configured: Boolean(secret)
  };
}

function issueSsoToken(input) {
  const config = getSsoConfig();
  if (!config.configured) {
    throw new Error('SSO secret is not configured');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: input.userId,
    lifePassId: input.userId,
    trustLevel: input.trustLevel || 'Bronze',
    trustScore: Number(input.trustScore) || 0,
    scope: Array.isArray(input.scope) ? input.scope : ['portal:access'],
    iat: nowSeconds
  };

  if (input.metadata && typeof input.metadata === 'object') {
    payload.meta = input.metadata;
  }

  const token = jwt.sign(payload, config.secret, {
    issuer: config.issuer,
    audience: input.audience || config.defaultAudience,
    expiresIn: input.expiresIn || config.expiresIn
  });

  return {
    token,
    payload,
    issuer: config.issuer,
    audience: input.audience || config.defaultAudience,
    expiresIn: input.expiresIn || config.expiresIn
  };
}

function verifySsoToken(token, options = {}) {
  const config = getSsoConfig();
  if (!config.configured) {
    throw new Error('SSO secret is not configured');
  }

  const decoded = jwt.verify(token, config.secret, {
    issuer: config.issuer,
    audience: options.audience || config.defaultAudience
  });

  return {
    valid: true,
    claims: decoded,
    issuer: config.issuer
  };
}

module.exports = {
  getSsoConfig,
  issueSsoToken,
  verifySsoToken
};

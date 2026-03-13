function registerCommonsRoutes(router, access = {}) {
  const requirePortalAccess = access.requirePortalAccess || ((_opts) => (_req, _res, next) => next());

  router.get('/commons/status', (_req, res) => {
    res.json({ success: true, portal: 'commons', capabilities: ['identity', 'navigation', 'service-discovery'] });
  });

  router.get('/commons/me', requirePortalAccess({ minTrustLevel: 'bronze' }), (req, res) => {
    res.json({ success: true, identity: req.portalIdentity || null });
  });
}

module.exports = { registerCommonsRoutes };

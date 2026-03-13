function registerHealthRoutes(router, access = {}) {
  const requirePortalAccess = access.requirePortalAccess || ((_opts) => (_req, _res, next) => next());

  router.get('/health/status', (_req, res) => {
    res.json({ success: true, portal: 'health', features: ['clinic-discovery-stub', 'age-gated-services'] });
  });

  router.get('/health/age-gated-services', requirePortalAccess({ covenant: 'health', policyKey: 'ageGatedServices' }), (req, res) => {
    res.json({
      success: true,
      portal: 'health',
      services: ['preventive-screening', 'specialist-referral'],
      identity: req.portalIdentity || null
    });
  });
}

module.exports = { registerHealthRoutes };

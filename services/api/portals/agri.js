const requests = [];

function registerAgriRoutes(router, access = {}) {
  const requirePortalAccess = access.requirePortalAccess || ((_opts) => (_req, _res, next) => next());

  router.get('/agri/status', (_req, res) => {
    res.json({ success: true, portal: 'agri', covenant: 'Agri Covenant', features: ['service-request-stub'] });
  });

  router.post('/agri/requests', requirePortalAccess({ minTrustLevel: 'bronze' }), (req, res) => {
    const { userId, cropType, requestType, details } = req.body || {};
    if (!userId || !requestType) {
      return res.status(400).json({ success: false, error: 'userId and requestType are required' });
    }

    const item = {
      id: `agri_${Date.now()}`,
      userId,
      cropType: cropType || null,
      requestType,
      details: details || '',
      status: 'received',
      createdAt: new Date().toISOString()
    };
    requests.push(item);
    return res.status(201).json({ success: true, request: item });
  });

  router.get('/agri/requests', requirePortalAccess({ minTrustLevel: 'silver' }), (_req, res) => {
    res.json({ success: true, requestsCount: requests.length, requests });
  });
}

module.exports = { registerAgriRoutes };

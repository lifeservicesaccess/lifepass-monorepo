function registerHealthRoutes(router) {
  router.get('/health/status', (_req, res) => {
    res.json({ success: true, portal: 'health', features: ['clinic-discovery-stub', 'age-gated-services'] });
  });
}

module.exports = { registerHealthRoutes };
